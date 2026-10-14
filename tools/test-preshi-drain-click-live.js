// 普雷希 · 女王榨取「能不能点」实机检查
//
// 旧覆盖的盲区：test-preshi-skills-strict-effects-live.js 只走
// window.BattleSystem.useCard（直接调逻辑层），逻辑层 canResolve 确实会拒绝
// 女性/自己/敌方目标 —— 但玩家点的是界面。界面选目标走 ui-battle-targeting，
// 那里对 preshiDrain 只按 allyTarget 判定（同阵营即可），没有性别限制，
// 也没有排除自己。于是女性队友和自己会被标成可选，点了却静默无反应，
// 与【狙击目标】空手牌目标同一类 BUG。
//
// 本测试全程走真实 DOM：点技能按钮 → 读 .selectable-target → 点队友头像 →
// 查实际结算。另设「队伍里没有男性」的对照组（技能应不可点）。
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

// 布置：普雷希(女) 行动，队友 罗卡尔(男) / 贝尔蒂丝(女)，敌方一名男性
const setupTpl = (maleCount) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false;
  b.phase = 4;
  // 回归战斗默认只带 2 名我方角色，不足 3 名时补一个占位，便于同时观察
  // 「男性可选 / 女性不可选」两条对照。
  while (b.allies.length < 3) {
    const n = b.allies.length;
    b.allies.push({
      uid: "fill" + n, name: "补位" + n, ref: "fill" + n, id: "fill" + n,
      gender: "female", side: "ally", hp: 50, maxHp: 50, block: 0,
      hand: [], skills: [], stats: { attack: 4, magic: 4, speed: 4 },
    });
  }
  const p = b.allies[0], m = b.allies[1], f = b.allies[2];
  p.name = "普雷希"; p.ref = "preshi"; p.id = "preshi"; p.gender = "female";
  p.stats = { attack: 4.8, magic: 5, speed: 5.5 };
  p.hp = p.maxHp = 56; p.block = 0;
  p.usedPreshiDrain = false;
  p.skills = [
    { name: "女王威压", type: "passive" },
    { name: "女王榨取", type: "active", card: { name: "女王榨取", type: "tactic", preshiDrain: true, allyTarget: true, icon: "⚔️", text: "指定我方一名男性角色。" } },
  ];
  p.hand = [];
  for (let i = 0; i < 3; i++)
    p.hand.push({ name: "闪", type: "basic", suit: "♠", uid: "ph" + i });
  m.name = "罗卡尔"; m.ref = "lokar"; m.id = "lokar";
  m.gender = ${maleCount >= 1 ? '"male"' : '"female"'};
  m.hp = m.maxHp = 62; m.block = 0;
  m.hand = [
    { name: "闪", type: "basic", suit: "♥", uid: "mh0" },
    { name: "闪", type: "basic", suit: "♠", uid: "mh1" },
  ];
  f.name = "贝尔蒂丝"; f.ref = "bertis"; f.id = "bertis"; f.gender = "female";
  f.hp = f.maxHp = 60; f.block = 0;
  f.hand = [{ name: "闪", type: "basic", suit: "♥", uid: "fh0" }];
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
  return { p: p.uid, m: m.uid, f: f.uid,
    enemies: b.enemies.map(e => e.uid), magic: p.stats.magic };
})()`;

// 点技能按钮：按 title 找「女王榨取」
const clickSkill = () => `(() => {
  const btns = [...document.querySelectorAll("[data-skill-index]")];
  const hit = btns.find(el => (el.getAttribute("title") || "").includes("女王榨取"));
  if (!hit) return { clicked: false, count: btns.length,
    titles: btns.map(el => (el.getAttribute("title") || "").slice(0, 12)) };
  hit.click();
  return { clicked: true, count: btns.length };
})()`;

const readSelectable = () => `(() => {
  const ids = [...document.querySelectorAll(".selectable-target[data-target]")]
    .map(el => el.getAttribute("data-target"));
  return { ids, picked: !!(window.state.battle.selectedSkillCard) };
})()`;

const clickUnit = uid => `(() => {
  const el = document.querySelector('[data-target="${uid}"] .unit-art');
  if (!el) return { ok: false, reason: "no-dom" };
  el.click();
  return { ok: true };
})()`;

const readResult = (uids) => `(() => {
  const b = window.state.battle;
  const p = b.allies[0], m = b.allies[1], f = b.allies[2];
  return {
    maleHpLoss: 62 - m.hp,
    maleLeft: (m.hand || []).filter(c => !c._pendingDraw).length,
    drew: (p.hand || []).filter(c => c._pendingDraw).length,
    used: !!p.usedPreshiDrain,
    femHpLoss: 60 - f.hp,
    modal: window.state.battle.locked,
  };
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

  // ── ① 队伍里有男性：技能可点，且只有男性队友可选 ──
  const u = await page.evaluate(setupTpl(1));
  await page.waitForTimeout(120);
  const clk = await page.evaluate(clickSkill());
  T("① 女王榨取按钮存在于界面且可点", clk.clicked === true, clk);
  await page.waitForTimeout(150);
  const sel = await page.evaluate(readSelectable());
  T("① 男性队友被标为可选", sel.ids.includes(u.m), sel);
  T("① 女性队友不可选（点了会静默失败）", !sel.ids.includes(u.f), sel);
  T("① 普雷希自己不可选", !sel.ids.includes(u.p), sel);
  T("① 敌方不可选", u.enemies.every(e => !sel.ids.includes(e)), sel);

  // ── ② 真实点击男性队友 → 效果落地 ──
  await page.evaluate(clickUnit(u.m));
  await page.waitForTimeout(400);
  const r = await page.evaluate(readResult(u));
  T("② 对男性造成等同于魔力值的伤害", r.maleHpLoss === u.magic, { r, magic: u.magic });
  T("② 弃置其所有手牌", r.maleLeft === 0, r);
  T("② 普雷希摸等量牌", r.drew === 2, r);
  T("② 出牌阶段限一次（次数已消耗）", r.used === true, r);

  // ── ③ 队伍里没有男性：技能应不可点 ──
  await page.evaluate(setupTpl(0));
  await page.waitForTimeout(120);
  const clk2 = await page.evaluate(clickSkill());
  T("③ 无男性队友时技能不可点", clk2.clicked === false, clk2);

  // ── ④ 用完一次后不可再点（不再重跑 setup，否则会重置 usedPreshiDrain）──
  await page.evaluate(() => {
    const b = window.state.battle;
    b.animQueue = []; b.locked = false; b.phase = 4;
    b.activeUid = b.allies[0].uid;
    b.allies.concat(b.enemies)
      .forEach(x => x.hand.forEach(c => { delete c._pendingDraw; }));
    window.render();
  });
  await page.waitForTimeout(150);
  const clk3 = await page.evaluate(clickSkill());
  T("④ 已用过后不可再点", clk3.clicked === false, clk3);

  const bad = relevantErrors(errors);
  T("页面无运行时错误", bad.length === 0, bad.slice(0, 3));
  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
