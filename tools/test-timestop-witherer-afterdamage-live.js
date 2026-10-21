// 米尔尤拉【神奇怀表】时停 · 是否覆盖「凋零者的受击被动链」
//
// 背景：battle-damage-triggers.js 的 afterDamage 里，绝大多数分支都带了时停判据，
// 但 `window.WithererSkills?.afterDamage?.(...)` 是裸调 —— 没有 tsStopped 包裹。
// 凋零者是**敌方**单位（会被时停标记），所以这条漏判会让以下效果在被时停时照常触发：
//   · 鲜血之忆   → 掉血后提升杀意上限与每回合摸牌（witherer-relic-skills.js）
//   · 勒脖标记   → 勒杀命中后挂持续伤害标记
//   · 长舌头     → 吸取目标手牌上限
//   · 1124号镰刀 → 击杀后获得额外回合
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

// 布阵：我方米尔尤拉（持神奇怀表），敌方凋零者 1124（被动：鲜血之忆）
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
  w.name = "凋零者1124号"; w.ref = "witherer_1124"; w.id = "xx_witherer_1124";
  w.ai = "witherer_1124"; w.gender = "male";
  // maxHp 100、初始 hp 75：已损 25%（level 1），但 withererBloodMemory 记的是
  // 「上次结算到的档位」，初值 0，故任何一次受伤都会重新结算出 level 1 → gain 1。
  w.maxHp = 100; w.hp = 75; w.block = 0; w.statuses = []; w.hand = [];
  w.withererBloodMemory = 0;
  w.stats = Object.assign({}, w.stats || {}, { attack: 6, magic: 3, speed: 4, bloodlust: 1, drawPerTurn: 0 });
  w.skills = [{ name: "鲜血之忆", type: "passive", icon: "⭐", text: "t" }];
  b.enemies.slice(1).forEach(e => { e.hp = e.maxHp = 60; e.block = 0; e.hand = []; e.statuses = []; });
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

// 我方 2 号位对凋零者打出一张高伤实体【杀】
const hitTpl = `(() => {
  const st = window.state, b = st.battle;
  const a1 = b.allies[1], w = b.enemies[0];
  b.animQueue = []; b.locked = false;
  st.log = [];
  const card = { name: "杀（普攻）", type: "slash", suit: "\\u2660", power: 29, uid: "hk" + Date.now() };
  a1.hand.push(card);
  window.BattleSystem.useCard(st, a1, w, card);
  return { ok: true };
})()`;

const readTpl = () => `(() => {
  const st = window.state, b = st.battle;
  const logs = (st.log || []).map(String);
  return {
    blood: logs.filter(x => x.includes("鲜血之忆触发")),
    marked: (b.enemies[0].statuses || []).includes("时停"),
    withererHp: b.enemies[0].hp,
    memory: b.enemies[0].withererBloodMemory || 0,
    bloodlust: b.enemies[0].stats?.bloodlust,
    all: logs.slice(0, 8),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(300);

  const run = async (cast) => {
    await page.evaluate(setupTpl);
    const c = await page.evaluate(castTpl(cast));
    await page.waitForTimeout(400);
    await page.evaluate(hitTpl);
    await page.waitForTimeout(2500);
    const r = await page.evaluate(readTpl());
    return { c, r };
  };

  console.log("\n── 对照组：不施加时停 ──");
  const ctl = await run(false);
  console.log(`   鲜血之忆日志 ${ctl.r.blood.length} 条：${JSON.stringify(ctl.r.blood)}`);
  console.log("\n── 实验组：施加时停 ──");
  const exp = await run(true);
  console.log(`   标记=${exp.c.marked}；鲜血之忆日志 ${exp.r.blood.length} 条`);
  console.log(`   实验日志：${JSON.stringify(exp.r.all)}`);

  T("C0 对照组：未时停时伤害确实落地（掉血到 70 附近）",
    ctl.r.withererHp <= 74, ctl.r);
  T("C1 对照组：未时停时【鲜血之忆】确实触发",
    ctl.r.blood.length > 0, ctl.r);
  T("A0 时停标记已施加到凋零者身上", exp.c.marked === true, exp.c);
  T("A1 时停后：【鲜血之忆】不再触发",
    exp.r.blood.length === 0, exp.r);
  T("A2 时停后：杀意上限未被提升（仍为初始 1）",
    exp.r.bloodlust === 1, exp.r);
  T("A3 时停本身不免疫伤害（伤害照常结算）",
    exp.r.withererHp <= 74, exp.r);

  const bad = relevantErrors(errors);
  T("Z0 无 JS 报错", bad.length === 0, bad.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
