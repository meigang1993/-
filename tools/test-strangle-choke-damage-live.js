// 【勒杀】的「勒脖」标记持续伤害 = 使用者攻击力（而非攻击力的一半）
//
// 背景：markChoke 原写 Math.max(1, Math.floor(stat(actor,"attack") / 2))，
// 低攻击力角色挂上的标记每回合只掉 1 点血，与卡面描述（攻击力的一半）观感都不明显，
// 现按需求改为「施加标记时使用者的攻击力」。
//
// 用奇数攻击力 5 做探针：旧口径 floor(5/2)=2，新口径 5 —— 数值可区分。
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

// 我方 0 号攻击力 5；敌方 0 号无手牌（不能响应）
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.phase = 4;
  b.kaiichiShare = null; b.kaiichiShareQueue = [];
  while (b.allies.length < 3) {
    const n = b.allies.length;
    b.allies.push({ uid: "afill" + n, name: "补友" + n, ref: "fill_a" + n, id: "fill_a" + n,
      gender: "female", side: "ally", hp: 80, maxHp: 80, block: 0, hand: [], skills: [],
      statuses: [], battleRelics: [], stats: { attack: 4, magic: 4, speed: 4 } });
  }
  const a0 = b.allies[0];
  a0.name = "出杀者"; a0.ref = "nanali"; a0.id = "nanali"; a0.gender = "female";
  a0.stats = { attack: 5, magic: 2, speed: 5 }; a0.tempAttack = 0;
  a0.hp = a0.maxHp = 90; a0.block = 0; a0.hand = []; a0.statuses = []; a0.skills = [];
  b.allies.slice(1).forEach(a => { a.hp = a.maxHp = 80; a.block = 0; a.hand = []; a.statuses = []; });
  const e0 = b.enemies[0];
  e0.name = "受勒者"; e0.ref = "witherer_1124"; e0.id = "xx_witherer_1124";
  e0.ai = "ruins_witherer"; e0.gender = "male";
  e0.maxHp = 100; e0.hp = 100; e0.block = 0; e0.statuses = [];
  // 必须给手牌：无手牌会触发「虚弱斩杀」使本次杀伤害翻倍，
  // 即时伤害就不是攻击力 5 而是 10，掩盖本次要验证的标记数值。
  // 只给不可响应的牌，否则会被【闪】抵消，hpLoss 为 0 就挂不上标记
  e0.hand = [{ name: "杀（普攻）", type: "slash", suit: "\\u2660", power: 2, uid: "eh1" },
    { name: "杀（普攻）", type: "slash", suit: "\\u2663", power: 2, uid: "eh2" }];
  delete e0.withererChoke;
  b.enemies.slice(1).forEach(e => { e.hp = e.maxHp = 60; e.block = 0; e.hand = []; e.statuses = []; });
  st.log = [];
  window.render();
  return { ok: true, atk: a0.stats.attack, foeHp: e0.hp };
})()`;

// 真实打出【勒杀】
const strangleTpl = cast => `(() => {
  const st = window.state, b = st.battle;
  const a0 = b.allies[0], e0 = b.enemies[0];
  b.animQueue = []; b.locked = false;
  st.log = [];
  if (${cast}) {
    const card = { name: "勒杀", type: "slash", scale: "attack", strangleKill: true,
      suit: "\\u2660", uid: "st" + Date.now() };
    a0.hand.push(card);
    window.BattleSystem.useCard(st, a0, e0, card);
  }
  return { ok: true };
})()`;

// 真实准备阶段入口：与 enemy-skills.js 的 step 1 完全一致
const prepareTpl = `(() => {
  const st = window.state, b = st.battle;
  const e0 = b.enemies[0];
  const before = e0.hp;
  window.WithererSkills?.prepare?.(st, e0, window.BattleSystem.damage);
  return { before, after: e0.hp, loss: before - e0.hp };
})()`;

const readTpl = `(() => {
  const st = window.state, b = st.battle;
  const e0 = b.enemies[0];
  const logs = (st.log || []).map(String);
  return {
    foeHp: e0.hp,
    marked: (e0.statuses || []).includes("勒脖"),
    amount: e0.withererChoke ? e0.withererChoke.amount : null,
    chokeLogs: logs.filter(x => x.includes("勒脖")),
  };
})()`;

// 快照校验：施加后再把出杀者攻击力改成 99，标记伤害不应变化
const bumpTpl = `(() => {
  const st = window.state, b = st.battle;
  b.allies[0].stats.attack = 99; b.allies[0].tempAttack = 0;
  return { atk: b.allies[0].stats.attack };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(300);

  // ── 对照组：不打勒杀 ──
  await page.evaluate(setupTpl);
  await page.evaluate(strangleTpl(false));
  await page.waitForTimeout(600);
  const ctlPrep = await page.evaluate(prepareTpl);
  const ctl = await page.evaluate(readTpl);

  // ── 实验组：真实打出勒杀 ──
  await page.evaluate(setupTpl);
  await page.evaluate(strangleTpl(true));
  await page.waitForTimeout(2500);
  const exp = await page.evaluate(readTpl);

  console.log(`\n对照组：标记=${ctl.marked} amount=${ctl.amount} 准备阶段掉血=${ctlPrep.loss}`);
  console.log(`实验组：标记=${exp.marked} amount=${exp.amount} 命中后血量=${exp.foeHp}`);
  console.log(`实验日志：${JSON.stringify(exp.chokeLogs)}`);

  T("C0 对照组：未打勒杀时没有勒脖标记", ctl.marked === false, ctl);
  T("C1 对照组：未打勒杀时准备阶段不掉血", ctlPrep.loss === 0, ctlPrep);

  T("A0 勒杀命中后目标获得勒脖标记", exp.marked === true, exp);
  T("A1 勒杀即时伤害 = 攻击力 5（100 → 95）", exp.foeHp === 95, exp);
  T("A2 标记伤害 = 使用者攻击力 5（旧口径为一半 2）", exp.amount === 5, exp);
  T("A3 标记伤害不等于旧口径 floor(5/2)=2", exp.amount !== 2, exp);

  const prep1 = await page.evaluate(prepareTpl);
  T("A4 准备阶段真的造成 5 点伤害（旧口径只有 2）", prep1.loss === 5, prep1);

  await page.evaluate(bumpTpl);
  const prep2 = await page.evaluate(prepareTpl);
  T("A5 标记伤害是施加时的快照（后续攻击力 99 也不变）", prep2.loss === 5, prep2);

  const bad = relevantErrors(errors);
  T("Z0 无 JS 报错", bad.length === 0, bad.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
