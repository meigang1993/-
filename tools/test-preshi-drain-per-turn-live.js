// 普雷希 · 女王榨取「出牌阶段限一次」= 每回合都能用一次（不是整场限一次）
//
// 玩家反馈：战斗里只能用一次。
// 根因：actor.usedPreshiDrain 在 preshi-skills.js:85 置 true，但
// battle-turn-state.js 的 resetBeginTurn（回合开始时引擎调用，见
// battle-turn-start.js:78/83）的重置清单里没有它 —— 所有其它「出牌阶段限一次」
// 的技能（usedExtract / usedBertisWhip / usedArtinaSniper / usedGreenGatling …）
// 都在清单里，只有它漏了。于是用过一次后整场战斗永远为 true。
//
// 本测试全程走真实 DOM：第一回合点技能 → 点男性队友 → 结算 → 同回合再点应不可点
// → 真实调用 resetBeginTurn（引擎回合开始入口）→ 下一回合应可再点并再次结算。
// 另设「限定技不应被重置」的保护断言，防止把这处修复扩大成全量重置。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, dismissOpeningStory, openTestBattle,
  collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.phase = 4;
  while (b.allies.length < 2) {
    const n = b.allies.length;
    b.allies.push({ uid: "fill" + n, name: "补位" + n, ref: "fill" + n, id: "fill" + n,
      gender: "female", side: "ally", hp: 50, maxHp: 50, block: 0, hand: [], skills: [],
      stats: { attack: 4, magic: 4, speed: 4 } });
  }
  const p = b.allies[0], m = b.allies[1];
  p.name = "普雷希"; p.ref = "preshi"; p.id = "preshi"; p.gender = "female";
  p.stats = { attack: 4.8, magic: 5, speed: 5.5 };
  p.hp = p.maxHp = 56; p.block = 0;
  p.usedPreshiDrain = false;
  p.skills = [
    { name: "女王威压", type: "passive" },
    { name: "女王榨取", type: "active", card: { name: "女王榨取", type: "tactic",
      preshiDrain: true, allyTarget: true, icon: "⚔️", text: "指定我方一名男性角色。" } },
  ];
  p.hand = [];
  for (let i = 0; i < 3; i++)
    p.hand.push({ name: "闪", type: "basic", suit: "♠", uid: "ph" + i });
  m.name = "罗卡尔"; m.ref = "lokar"; m.id = "lokar"; m.gender = "male";
  m.hp = m.maxHp = 62; m.block = 0;
  m.hand = [
    { name: "闪", type: "basic", suit: "♥", uid: "mh0" },
    { name: "闪", type: "basic", suit: "♠", uid: "mh1" },
  ];
  b.enemies.forEach((e, i) => {
    e.gender = "male"; e.hp = e.maxHp = 60; e.block = 0;
    e.hand = [{ name: "闪", type: "basic", suit: "♣", uid: "eh" + i }];
  });
  b.allies.concat(b.enemies).forEach(u =>
    u.hand.forEach(c => { delete c._pendingDraw; }));
  b.activeUid = p.uid;
  b.selectedSkillCard = null; b.selectedCardIndex = null; b.pendingTargetUid = null;
  window.render();
  window.BattleEffects.recover(st);
  return { p: p.uid, m: m.uid, magic: p.stats.magic };
})()`;

// 点技能按钮：按 title 找「女王榨取」。返回是否能点（置灰的按钮不带
// data-skill-index，故找不到即视为不可点）。
const clickSkill = () => `(() => {
  const all = [...document.querySelectorAll("button.skill")];
  const own = all.find(el => (el.getAttribute("title") || "").includes("女王榨取"));
  const clickable = [...document.querySelectorAll("[data-skill-index]")]
    .find(el => (el.getAttribute("title") || "").includes("女王榨取"));
  if (!clickable) return { clicked: false, count: all.length,
    cls: own ? own.className : null,
    titles: all.map(el => (el.getAttribute("title") || "").slice(0, 12)) };
  clickable.click();
  return { clicked: true, count: all.length, cls: clickable.className };
})()`;

const clickUnit = uid => `(() => {
  const el = document.querySelector('[data-target="${uid}"] .unit-art');
  if (!el) return { ok: false, reason: "no-dom" };
  el.click();
  return { ok: true };
})()`;

const readResult = () => `(() => {
  const b = window.state.battle;
  const p = b.allies[0], m = b.allies[1];
  return {
    maleHpLoss: 62 - m.hp,
    maleLeft: (m.hand || []).filter(c => !c._pendingDraw).length,
    drew: (p.hand || []).filter(c => c._pendingDraw).length,
    used: !!p.usedPreshiDrain,
  };
})()`;

// 真实回合开始入口（引擎 battle-turn-start.js 用的就是它）
const beginNextTurn = uid => `(() => {
  const b = window.state.battle;
  const u = b.allies.concat(b.enemies).find(x => x.uid === ${JSON.stringify(uid)});
  window.BattleTurnState.resetBeginTurn(u, b, 2);
  b.animQueue = []; b.locked = false; b.phase = 4; b.activeUid = u.uid;
  b.selectedSkillCard = null; b.selectedCardIndex = null; b.pendingTargetUid = null;
  window.render();
  window.BattleEffects.recover(window.state);
  return { used: !!u.usedPreshiDrain };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await openTestBattle(page);
  await page.evaluate(() => {
    window.state.testEnemies = [0];
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await page.locator(".battle-screen").waitFor({ state: "visible" });
  await page.evaluate(() => {
    const b = window.state.battle;
    window.state.settings.battleSpeed = 1;
    b.animQueue = []; b.locked = false; b.phase = 4;
    b.activeUid = b.allies[0].uid;
    b.allies.concat(b.enemies)
      .forEach(u => u.hand.forEach(c => { delete c._pendingDraw; }));
    window.render();
    window.BattleEffects.recover(window.state);
  });

  // ── ① 第一回合：可用并结算 ──
  const u = await page.evaluate(setupTpl);
  await page.waitForTimeout(120);
  const clk = await page.evaluate(clickSkill());
  T("① 第一回合：女王榨取可点", clk.clicked === true, clk);
  await page.waitForTimeout(150);
  await page.evaluate(clickUnit(u.m));
  await page.waitForTimeout(400);
  const r1 = await page.evaluate(readResult());
  T("① 造成等同于魔力值的伤害", r1.maleHpLoss === u.magic, { r1, magic: u.magic });
  T("① 弃置其所有手牌", r1.maleLeft === 0, r1);
  T("① 普雷希摸等量牌", r1.drew === 2, r1);
  T("① 次数已消耗", r1.used === true, r1);

  // ── ② 同一回合内：仍应限一次（防止把修复做成无限次）──
  await page.waitForTimeout(900);   // 让引擎自己完成结算后的重绘，不手工干预
  const clk2 = await page.evaluate(clickSkill());
  T("② 同一回合内不可再点（限一次仍生效）", clk2.clicked === false, clk2);

  // ── ③ 真实回合开始 → 次数应被重置 ──
  const nx = await page.evaluate(beginNextTurn(u.p));
  await page.waitForTimeout(200);
  T("③ 回合开始后 usedPreshiDrain 被重置", nx.used === false, nx);

  // 给男性队友补回手牌，使「第二回合确实再次结算」可被摸牌数与弃牌数验证
  await page.evaluate(`(() => {
    const m = window.state.battle.allies[1];
    m.hand = [
      { name: "闪", type: "basic", suit: "♥", uid: "mh2" },
      { name: "闪", type: "basic", suit: "♠", uid: "mh3" },
    ];
    window.state.battle.allies.forEach(u =>
      u.hand.forEach(c => { delete c._pendingDraw; }));
    window.render();
    return m.hand.length;
  })()`);
  await page.waitForTimeout(150);

  // ── ④ 第二回合：应可再次使用并再次结算 ──
  const clk3 = await page.evaluate(clickSkill());
  T("④ 第二回合：女王榨取可再点", clk3.clicked === true, clk3);
  await page.waitForTimeout(150);
  await page.evaluate(clickUnit(u.m));
  await page.waitForTimeout(400);
  const r2 = await page.evaluate(readResult());
  T("④ 第二回合再次造成伤害", r2.maleHpLoss > r1.maleHpLoss, { r1, r2 });
  T("④ 第二回合再次弃置其手牌", r2.maleLeft === 0, r2);
  T("④ 第二回合再次摸等量牌", r2.drew >= 2, r2);

  // ── ⑤ 保护：限定技不应被这处修复波及（仍为整场一次）──
  const lim = await page.evaluate(`(() => {
    const b = window.state.battle;
    const p = b.allies[0];
    p.usedLokarWindSlash = true;   // 罗卡尔「狂风绝息斩」是限定技
    window.BattleTurnState.resetBeginTurn(p, b, 2);
    return { used: !!p.usedLokarWindSlash };
  })()`);
  T("⑤ 限定技狂风绝息斩不被回合重置（仍是整场一次）", lim.used === true, lim);

  const bad = relevantErrors(errors);
  T("页面无运行时错误", bad.length === 0, bad.slice(0, 3));
  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
