// 女王威压 · 「手牌数不多于目标 → 完全不触发」严格检查
//
// ⭐ 描述口径（data-characters-extra.js）
//   「当你使用的牌指定敌方角色为目标时，若你的手牌数**大于**该角色，该角色不可响应你的牌。」
//
// 本份要坐实的是「不大于时不触发」这一整条，而不只是「对方能打出闪」：
//   · suppressesResponse 必须返回 false（响应判定的唯一判据）
//   · beforeCardPlayed 必须不播台词（battle.speech 为空、无语音气泡）
//   · 战报必须不出现「触发女王威压」
//   · 目标确实能响应（【闪】被消耗、不掉血）
// 两条边界分别验：少于（mine < theirs）、相等（mine === theirs，不是「大于」）。
// 并补一处既有测试未覆盖的场景：AOE 混合——有的目标手牌少、有的手牌多，
// 必须逐目标分别判定，而不是一次压制全场或一次全不压。
//
// 运行：node tools/test-preshi-pressure-notrigger-live.js
//       PRESHI_NT=rev 跑反向验证（把判据改成 mine < theirs，等于也算触发）
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, startRegressionBattle, dismissOpeningStory, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// pHand = 普雷希手牌数（不含正在打出的那张），foeHands = 各敌人手牌数
const setupTpl = (pHand, foeHands) => `(() => {
  const st = window.state, b = st.battle;
  st.settings = st.settings || {};
  st.settings.manualResponse = false;
  b.animQueue = []; b.locked = false;
  b.speech = null; b.skillCaption = null; b.skillCaptions = [];
  const p = b.allies[0];
  p.name = "普雷希"; p.ref = "preshi"; p.id = "preshi"; p.gender = "female";
  p.stats = { attack: 3, magic: 4, speed: 3 };
  p.tempMagic = 0; p.tempAttack = 0; p.block = 0; p.noResponse = false;
  p.hp = p.maxHp = 56;
  p.skills = [{ name: "女王威压", type: "passive" }];
  p.usedPreshiDrain = false;
  p.hand = [];
  for (let i = 0; i < ${pHand}; i++) p.hand.push({ name: "蓄力", type: "tactic", suit: "♠", uid: "ph" + i });
  const hands = ${JSON.stringify(foeHands)};
  b.enemies.forEach((e, i) => {
    e.hand = [];
    e.hp = e.maxHp = 60; e.block = 0; e.noResponse = false;
    e.skills = []; e.ai = null;
    const n = hands[i] == null ? 0 : hands[i];
    for (let k = 0; k < n; k++) {
      e.hand.push({ name: "闪", type: "response", suit: "♥", uid: "fh" + i + "_" + k });
    }
  });
  // 队友塞满手牌：让普雷希永远不是「全场最多」，②号翻倍（以及它的台词）
  // 全程不介入，本份只考察①号「不可响应」这一条。
  b.allies.slice(1).forEach(a => {
    a.hp = a.maxHp = 60; a.hand = [];
    for (let i = 0; i < 20; i++) a.hand.push({ name: "蓄力", type: "tactic", suit: "♣", uid: "al" + i });
  });
  st.log = [];
  window.render();
  return { allies: b.allies.length, foes: b.enemies.length };
})()`;

// 直接问判据本身：这是响应判定的唯一入口
const askSuppress = `(() => {
  const st = window.state, b = st.battle;
  const p = b.allies[0], foe = b.enemies[0];
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", uid: "ASK" };
  return !!window.PreshiSkills?.suppressesResponse?.(st, p, foe, card);
})()`;

// 真实出牌：普雷希对 0 号敌人打出单体杀
const playSlash = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.speech = null; b.skillCaption = null; b.skillCaptions = [];
  const p = b.allies[0], foe = b.enemies[0];
  const before = {
    hp: foe.hp,
    flash: foe.hand.filter(c => c.name === "闪" && !c._pendingDraw).length,
    mine: p.hand.filter(c => !c._pendingDraw).length,
    theirs: foe.hand.filter(c => !c._pendingDraw).length
  };
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", uid: "T1" };
  p.hand.push(card);
  st.log = [];
  const r = window.BattleSystem.useCard(st, p, foe, card);
  return new Promise(res => setTimeout(() => {
    res({
      before,
      after: {
        hp: foe.hp,
        flash: foe.hand.filter(c => c.name === "闪" && !c._pendingDraw).length
      },
      ok: !!(r && r.ok !== false),
      log: (st.log || []).map(x => x.text || String(x)),
      speech: (b.speech?.lines || []).map(l => l.text || ""),
      bubbles: Array.from(document.querySelectorAll(".unit-speech-bubble")).map(n => n.textContent || "")
    });
  }, 650));
})()`;

// AOE 混合：0 号敌人手牌少于普雷希（应压制），1 号敌人手牌多于普雷希（不应压制）
const setupAoe = (pH, f0, f1) => `(() => {
  const st = window.state, b = st.battle;
  st.settings = st.settings || {};
  st.settings.manualResponse = false;
  b.animQueue = []; b.locked = false;
  b.speech = null; b.skillCaption = null; b.skillCaptions = [];
  const p = b.allies[0];
  p.name = "普雷希"; p.ref = "preshi"; p.id = "preshi"; p.gender = "female";
  p.stats = { attack: 3, magic: 4, speed: 3 };
  p.hp = p.maxHp = 56; p.block = 0; p.noResponse = false;
  p.skills = [{ name: "女王威压", type: "passive" }];
  p.hand = [];
  for (let i = 0; i < ${pH}; i++) p.hand.push({ name: "蓄力", type: "tactic", suit: "♠", uid: "ph" + i });
  const counts = [${f0}, ${f1}];
  b.enemies.forEach((e, i) => {
    e.hand = [];
    e.hp = e.maxHp = 60; e.block = 0; e.noResponse = false;
    e.skills = []; e.ai = null;
    for (let k = 0; k < counts[i]; k++) {
      e.hand.push({ name: "闪", type: "response", suit: "♥", uid: "fh" + i + "_" + k });
    }
  });
  b.allies.slice(1).forEach(a => {
    a.hp = a.maxHp = 60; a.hand = [];
    for (let i = 0; i < 20; i++) a.hand.push({ name: "蓄力", type: "tactic", suit: "♣", uid: "al" + i });
  });
  st.log = [];
  window.render();
  return { counts };
})()`;

const playAoe = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  const p = b.allies[0], foes = [b.enemies[0], b.enemies[1]];
  const before = foes.map(f => ({
    hp: f.hp, flash: f.hand.filter(c => c.name === "闪" && !c._pendingDraw).length
  }));
  // 群体牌靠 sweep 标记让引擎扫全场，target 只传一个（与既有压力测试同口径）
  const card = { name: "机枪扫杀", type: "slash", suit: "♠", sweep: true, uid: "AOE1" };
  p.hand.push(card);
  st.log = [];
  const r = window.BattleSystem.useCard(st, p, foes[0], card);
  return new Promise(res => setTimeout(() => {
    res({
      before,
      after: foes.map(f => ({
        hp: f.hp, flash: f.hand.filter(c => c.name === "闪" && !c._pendingDraw).length
      })),
      ok: !!(r && r.ok !== false),
      log: (st.log || []).map(x => x.text || String(x))
    });
  }, 900));
})()`;

const hasPressureLog = log => log.some(t => t.includes("触发女王威压"));
// 只看①号「不可响应」那条台词。②号「造成伤害/受到伤害」台词同样以「女王」开头
// （且②号在普雷希手牌全场最多时也会播），若按"含女王"判就会把②号误算进来。
const SUPPRESS_LINE = "女王的力量";
const hasPressureLine = r =>
  (r.speech || []).some(t => t.includes(SUPPRESS_LINE)) ||
  (r.bubbles || []).some(t => t.includes(SUPPRESS_LINE));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await startRegressionBattle(page);

  // ── A 段：手牌少于目标（mine < theirs）───────────────────
  console.log("\n── A 段：手牌少于目标（2 < 5）──");
  await page.evaluate(setupTpl(2, [5, 0, 0]));
  const aAsk = await page.evaluate(askSuppress);
  T("A1 判据 suppressesResponse 返回 false", aAsk === false, { ask: aAsk });
  const a = await page.evaluate(playSlash);
  T("A2 目标确实能响应：【闪】被消耗", a.after.flash === a.before.flash - 1, a);
  T("A3 目标未掉血（【闪】生效）", a.after.hp === a.before.hp, a);
  T("A4 战报未出现「触发女王威压」", !hasPressureLog(a.log), { log: a.log.slice(-4) });
  T("A5 未播放女王威压台词（speech 与气泡均无）", !hasPressureLine(a), {
    speech: a.speech, bubbles: a.bubbles
  });
  T("A6 手牌数口径正确（mine=2 theirs=5）", a.before.mine === 2 && a.before.theirs === 5, a.before);

  // ── B 段：手牌等于目标（mine === theirs，不是「大于」）────
  console.log("\n── B 段：手牌等于目标（4 = 4）──");
  await page.evaluate(setupTpl(4, [4, 0, 0]));
  const bAsk = await page.evaluate(askSuppress);
  T("B1 判据 suppressesResponse 返回 false（相等不算大于）", bAsk === false, { ask: bAsk });
  const b = await page.evaluate(playSlash);
  T("B2 目标确实能响应：【闪】被消耗", b.after.flash === b.before.flash - 1, b);
  T("B3 目标未掉血", b.after.hp === b.before.hp, b);
  T("B4 战报未出现「触发女王威压」", !hasPressureLog(b.log), { log: b.log.slice(-4) });
  T("B5 未播放女王威压台词", !hasPressureLine(b), { speech: b.speech, bubbles: b.bubbles });

  // ── C 段：对照组 手牌多于目标（6 > 3）应确实触发 ──────────
  console.log("\n── C 段：对照组 手牌多于目标（6 > 3）──");
  await page.evaluate(setupTpl(6, [3, 0, 0]));
  const cAsk = await page.evaluate(askSuppress);
  T("C1 判据 suppressesResponse 返回 true", cAsk === true, { ask: cAsk });
  const c = await page.evaluate(playSlash);
  T("C2 目标无法响应：【闪】未被消耗", c.after.flash === c.before.flash, c);
  T("C3 目标掉血", c.after.hp < c.before.hp, c);
  T("C4 战报出现「触发女王威压」", hasPressureLog(c.log), { log: c.log.slice(-4) });
  T("C5 播放了女王威压台词", hasPressureLine(c), { speech: c.speech, bubbles: c.bubbles });

  // ── D 段：AOE 混合，逐目标分别判定 ───────────────────────
  console.log("\n── D 段：AOE 混合（普雷希 5 / 敌0=2 应压 / 敌1=9 不应压）──");
  await page.evaluate(setupAoe(5, 2, 9));
  const d = await page.evaluate(playAoe);
  // 0 号：手牌 2 < 5 → 压制
  T("D1 手牌少的目标被压制（【闪】未消耗）", d.after[0].flash === d.before[0].flash, d);
  T("D2 手牌少的目标掉血", d.after[0].hp < d.before[0].hp, d);
  // 1 号：手牌 9 > 5 → 不压制
  T("D3 手牌多的目标未被压制（【闪】被消耗）", d.after[1].flash === d.before[1].flash - 1, d);
  T("D4 手牌多的目标未掉血", d.after[1].hp === d.before[1].hp, d);

  // ── E 段：AOE 全部手牌都多于普雷希 → 一个都不该压 ────────
  console.log("\n── E 段：AOE 全部手牌更多（普雷希 2 / 敌0=7 敌1=8）──");
  await page.evaluate(setupAoe(2, 7, 8));
  const e = await page.evaluate(playAoe);
  T("E1 两个目标的【闪】都被消耗（均未压制）",
    e.after[0].flash === e.before[0].flash - 1 && e.after[1].flash === e.before[1].flash - 1, e);
  T("E2 两个目标都未掉血",
    e.after[0].hp === e.before[0].hp && e.after[1].hp === e.before[1].hp, e);
  T("E3 战报未出现「触发女王威压」", !hasPressureLog(e.log), { log: e.log.slice(-4) });

  const bad = relevantErrors(errors);
  T("页面无 JS 错误", bad.length === 0, bad.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(err => {
  console.error("FATAL", err);
  process.exit(1);
});
