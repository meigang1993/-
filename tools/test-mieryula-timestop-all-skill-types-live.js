// 米尔尤拉【神奇怀表】时停 · 是否真的「禁用所有技能与技能类型」
//
// 背景：时停的「禁用技能」此前只在 battle-card-playability.js 的 blockedByBattle
// 里生效，也就是 canPlay 链路 —— 只覆盖「手牌里的主动技牌」。
// 而项目里技能 type 有 active / passive / trigger 三类，后两类根本不走 canPlay：
//   · 被动技（外神之眼、魅魔吸精术）走 afterDamage 钩子
//   · 结束阶段技（百眼魅魔）走 endTurn
//   · 触发技（复仇反击等）走 BattleCounterTriggers
// 本文件逐个类型实测，并各带「不施加时停」的对照组，确保断言不是恒真。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.phase = 4;
  b.kaiichiShare = null; b.kaiichiShareQueue = [];
  b.mieryulaTimeStopOwner = null; b.mieryulaBloodthirstPicker = null;
  while (b.allies.length < 3) {
    const n = b.allies.length;
    b.allies.push({ uid: "afill" + n, name: "补友" + n, ref: "fill_a" + n, id: "fill_a" + n,
      gender: "female", side: "ally", hp: 80, maxHp: 80, block: 0, hand: [], skills: [],
      statuses: [], battleRelics: [], stats: { attack: 4, magic: 4, speed: 4 } });
  }
  const m = b.allies[0];
  m.name = "米尔尤拉"; m.ref = "mieryula"; m.id = "mieryula"; m.gender = "female";
  m.stats = { attack: 4, magic: 2, speed: 5 }; m.tempAttack = 0;
  m.hp = m.maxHp = 52; m.bloodlust = 1; m.bloodlustMax = 1; m.hand = [];
  m.skills = [
    { name: "无谋霸姬", type: "passive" },
    { name: "神奇怀表", type: "active", card: { name: "神奇怀表", type: "tactic",
      mieryulaTimeStop: true, targetless: true, icon: "🔺", text: "t" } },
  ];
  m.usedMieryulaTimeStop = false;
  b.allies.slice(1).forEach(a => { a.hp = a.maxHp = 80; a.block = 0; a.hand = []; a.statuses = []; });
  const w = b.enemies[0];
  w.name = "XX型凋零者1312号"; w.ref = "witherer_1312"; w.id = "witherer_1312";
  w.ai = "ruins_witherer"; w.gender = "female";
  w.hp = w.maxHp = 300; w.block = 0; w.statuses = []; w.hand = [];
  w.stats = Object.assign({}, w.stats || {}, { attack: 15, magic: 14, speed: 16 });
  w.skills = [
    { name: "外神之眼", type: "passive", icon: "⭐", text: "t" },
    { name: "魅魔吸精术", type: "passive", icon: "⭐", text: "t" },
    { name: "百眼魅魔", type: "active", icon: "🔵", text: "t" },
  ];
  b.enemies.slice(1).forEach(e => { e.hp = e.maxHp = 60; e.block = 0; e.hand = []; e.statuses = []; });
  st.log = [];
  window.render();
  return { ok: true, allies: b.allies.length, foes: b.enemies.length,
    endTurnFn: typeof window.RuinsWithererSkills?.endTurn };
})()`;

// 真实出牌施加时停（cast=false 为对照组）
const castTpl = cast => `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0];
  if (${cast}) {
    const card = { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true,
      targetless: true, icon: "🔺", text: "t", _skill: true };
    m.hand.push(card);
    window.BattleSystem.useCard(st, m, m, card);
  }
  return { marked: (b.enemies[0].statuses || []).includes("时停") };
})()`;

// ── A 组：被动技（外神之眼）─────────────────────────────────
const hitTpl = `(() => {
  const st = window.state, b = st.battle;
  const a1 = b.allies[1], w = b.enemies[0];
  b.animQueue = []; b.locked = false;
  st.log = [];
  const card = { name: "杀（普攻）", type: "slash", suit: "\\u2660", uid: "hk" + Date.now() };
  a1.hand.push(card);
  window.BattleSystem.useCard(st, a1, w, card);
  return { ok: true };
})()`;

const readEye = () => `(() => {
  const st = window.state, b = st.battle;
  const logs = (st.log || []).map(String);
  return {
    eye: logs.filter(x => x.includes("外神之眼")),
    all: logs.slice(0, 10),
    withererHp: b.enemies[0].hp,
    marked: (b.enemies[0].statuses || []).includes("时停"),
  };
})()`;

// ── B 组：结束阶段主动技（百眼魅魔）─────────────────────────
const endTurnTpl = `(() => {
  const st = window.state, b = st.battle;
  const w = b.enemies[0];
  b.animQueue = []; b.locked = false; b._deferSharePrompts = false;
  w.hand = [{ name: "闪", type: "response", suit: "\\u2665", uid: "wh" + Date.now() }];
  st.log = [];
  const mod = window.RuinsWithererSkills;
  if (mod && typeof mod.endTurn === "function") { mod.endTurn(st, w); return { ok: true }; }
  return { ok: false, keys: Object.keys(mod || {}) };
})()`;

const readManyEyes = () => `(() => {
  const st = window.state;
  const logs = (st.log || []).map(String);
  return { eyes: logs.filter(x => x.includes("百眼魅魔")),
           hearts: (window.state.battle.enemies[0].hand || []).length };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(300);

  const run = async (cast) => {
    const info = await page.evaluate(setupTpl);
    const c = await page.evaluate(castTpl(cast));
    await page.waitForTimeout(400);
    const h = await page.evaluate(hitTpl);
    await page.waitForTimeout(3000);
    const eye = await page.evaluate(readEye());
    const e = await page.evaluate(endTurnTpl);
    await page.waitForTimeout(1500);
    const many = await page.evaluate(readManyEyes());
    return { info, c, eye, e, many };
  };

  console.log("\n── 对照组：不施加时停 ──");
  const ctl = await run(false);
  console.log(`   外神之眼日志 ${ctl.eye.eye.length} 条；百眼魅魔日志 ${ctl.many.eyes.length} 条`);
  console.log(`   对照日志：${JSON.stringify(ctl.eye.all)}`);
  console.log("\n── 实验组：施加时停 ──");
  const exp = await run(true);
  console.log(`   标记=${exp.c.marked}；外神之眼日志 ${exp.eye.eye.length} 条；百眼魅魔日志 ${exp.many.eyes.length} 条`);
  console.log(`   实验日志：${JSON.stringify(exp.eye.all)}`);

  T("C1 对照组：未时停时被动技【外神之眼】触发", ctl.eye.eye.length > 0, ctl.eye);
  T("C2 对照组：未时停时结束阶段技【百眼魅魔】发动", ctl.many.eyes.length > 0, ctl.many);
  T("A1 时停标记已施加到凋零者身上", exp.c.marked === true, exp.c);
  T("A2 时停后：被动技【外神之眼】被禁用", exp.eye.eye.length === 0, exp.eye);
  T("B1 时停后：结束阶段技【百眼魅魔】被禁用", exp.many.eyes.length === 0, exp.many);
  T("B2 时停后：凋零者红桃牌未被弃置（技能未发动）", exp.many.hearts === 1, exp.many);

  const bad = relevantErrors(errors);
  T("Z0 无 JS 报错", bad.length === 0, bad.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
