// 米尔尤拉【神奇怀表】时停 · 是否覆盖「回合外触发」的技能
//
// 背景：前几轮补齐的守卫集中在「杀牌前置链」与「受击/结束/回合开始」钩子上，
// 但它们有一类共同前提：技能在被标记者自己的回合内发动，因此「跳过回合」也能兜住。
// 下面两类技能不在这个前提里 —— 它们在**被标记者回合之外**触发，跳过回合挡不住：
//   1) 伊迪斯【无限暗刃】：我方任意角色治疗时，伊迪斯挥刀（EnemySkills.beforeHeal）
//   2) 机械牛王【防御系统】：我方攻击牛王时吸收伤害（EnemySkills.absorbDefense）
// 若缺守卫，被时停的敌人仍会「隔空发动技能」，时停等于半身不遂。
//
// 每条断言都带「不施加时停」的对照组，确保断言不是恒真。
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

// 布阵：我方米尔尤拉（持神奇怀表）+ 一名受伤友方；敌方伊迪斯 + 机械牛王
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
  // allies[1] 当治疗者；allies[2] 受伤，作为治疗目标
  b.allies.slice(1).forEach(a => {
    a.hp = a.maxHp = 80; a.block = 0; a.hand = []; a.statuses = []; a.skills = [];
  });
  b.allies[2].hp = 40;

  while (b.enemies.length < 2) {
    const n = b.enemies.length;
    b.enemies.push({ uid: "efill" + n, name: "补敌" + n, ref: "fill_e" + n, id: "fill_e" + n,
      gender: "male", side: "enemy", hp: 100, maxHp: 100, block: 0, hand: [], skills: [],
      statuses: [], battleRelics: [], stats: { attack: 4, magic: 4, speed: 4 } });
  }
  // enemies[0] = 伊迪斯（无限暗刃）
  const edis = b.enemies[0];
  edis.name = "伊迪斯"; edis.ref = "pursuer_edis"; edis.id = "pursuer_edis";
  edis.ai = "pursuer_edis"; edis.gender = "male";
  edis.hp = edis.maxHp = 200; edis.block = 0; edis.statuses = []; edis.hand = [];
  edis.stats = Object.assign({}, edis.stats || {}, { attack: 4, magic: 3, speed: 5 });
  edis.skills = [{ name: "无限暗刃", type: "passive", icon: "⭐", text: "t" }];
  // enemies[1] = 机械牛王（防御系统）
  const bull = b.enemies[1];
  bull.name = "机械牛王"; bull.ref = "mechanical_bull_king"; bull.id = "mechanical_bull_king";
  bull.ai = "mechanical_bull_king"; bull.gender = "male";
  bull.hp = bull.maxHp = 300; bull.block = 0; bull.statuses = []; bull.hand = [];
  bull.defenseSystem = 40; bull.annihilationMode = false;
  bull.stats = Object.assign({}, bull.stats || {}, { attack: 5, magic: 3, speed: 3 });
  bull.skills = [{ name: "防御系统", type: "passive", icon: "⭐", text: "t" }];
  st.log = [];
  window.render();
  return { ok: true, allies: b.allies.length, foes: b.enemies.length };
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

// A：allies[1] 对 allies[2] 打出治疗牌 → 走 EnemySkills.beforeHeal → 伊迪斯无限暗刃
const healTpl = `(() => {
  const st = window.state, b = st.battle;
  const healer = b.allies[1], hurt = b.allies[2];
  b.animQueue = []; b.locked = false;
  st.log = [];
  const hpBeforeTeam = b.allies.reduce((s, u) => s + u.hp, 0);
  const card = { name: "伤口处理", type: "tactic", healPct: 0.1, uid: "hl" + Date.now() };
  healer.hand.push(card);
  window.BattleSystem.useCard(st, healer, hurt, card);
  return { hpBeforeTeam };
})()`;

// B：allies[1] 对机械牛王打出实体【杀】→ 走 EnemySkills.absorbDefense
const hitBullTpl = `(() => {
  const st = window.state, b = st.battle;
  const a1 = b.allies[1], bull = b.enemies[1];
  b.animQueue = []; b.locked = false;
  st.log = [];
  const dsBefore = bull.defenseSystem;
  const card = { name: "杀（普攻）", type: "slash", suit: "\\u2660", uid: "bk" + Date.now() };
  a1.hand.push(card);
  window.BattleSystem.useCard(st, a1, bull, card);
  return { dsBefore };
})()`;

const readTpl = () => `(() => {
  const st = window.state, b = st.battle;
  const logs = (st.log || []).map(String);
  return {
    dark: logs.filter(x => x.includes("无限暗刃")),
    bullDs: b.enemies[1].defenseSystem,
    bullHp: b.enemies[1].hp,
    markedEdis: (b.enemies[0].statuses || []).includes("时停"),
    markedBull: (b.enemies[1].statuses || []).includes("时停"),
    all: logs.slice(0, 10),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(300);

  // ── A 组：伊迪斯【无限暗刃】（我方治疗时触发）──
  const runHeal = async (cast) => {
    await page.evaluate(setupTpl);
    const c = await page.evaluate(castTpl(cast));
    await page.waitForTimeout(400);
    await page.evaluate(healTpl);
    await page.waitForTimeout(2500);
    const r = await page.evaluate(readTpl());
    return { c, r };
  };

  console.log("\n── A 对照组：不施加时停 ──");
  const ctlA = await runHeal(false);
  console.log(`   无限暗刃日志 ${ctlA.r.dark.length} 条：${JSON.stringify(ctlA.r.dark.slice(0, 2))}`);
  console.log("\n── A 实验组：施加时停 ──");
  const expA = await runHeal(true);
  console.log(`   标记=${expA.c.marked}；无限暗刃日志 ${expA.r.dark.length} 条`);
  console.log(`   实验日志：${JSON.stringify(expA.r.all)}`);

  T("A0 对照组：未时停时伊迪斯【无限暗刃】确实发动（断言非恒真）",
    ctlA.r.dark.length > 0, ctlA.r);
  T("A1 时停标记已施加到伊迪斯身上", expA.c.marked === true, expA.c);
  T("A2 时停后：我方治疗不再触发伊迪斯【无限暗刃】",
    expA.r.dark.length === 0, expA.r);

  // ── B 组：机械牛王【防御系统】（我方攻击时触发）──
  const runBull = async (cast) => {
    await page.evaluate(setupTpl);
    const c = await page.evaluate(castTpl(cast));
    await page.waitForTimeout(400);
    const before = await page.evaluate(hitBullTpl);
    await page.waitForTimeout(2500);
    const r = await page.evaluate(readTpl());
    return { c, before, r };
  };

  console.log("\n── B 对照组：不施加时停 ──");
  const ctlB = await runBull(false);
  console.log(`   防御系统 ${ctlB.before.dsBefore} → ${ctlB.r.bullDs}（应被消耗）`);
  console.log("\n── B 实验组：施加时停 ──");
  const expB = await runBull(true);
  console.log(`   标记=${expB.r.markedBull}；防御系统 ${expB.before.dsBefore} → ${expB.r.bullDs}（应不变）`);

  T("B0 对照组：未时停时机械牛王【防御系统】确实吸收伤害（断言非恒真）",
    ctlB.r.bullDs < ctlB.before.dsBefore, ctlB);
  T("B1 时停标记已施加到机械牛王身上", expB.r.markedBull === true, expB.r);
  T("B2 时停后：机械牛王【防御系统】不再吸收伤害",
    expB.r.bullDs === expB.before.dsBefore, expB);

  const bad = relevantErrors(errors);
  T("Z0 无 JS 报错", bad.length === 0, bad.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
