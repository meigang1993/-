// 米尔尤拉【神奇怀表】时停 · 是否覆盖「技能型 specials」钩子
//
// 背景：此前补齐的守卫逐行覆盖了 attack-flow 里的 `window.XxxSkills?.hook?.()`，
// 但 `specials.xxx()` 是另一种调用形式，静态扫描的第二节扫不到它。
// battle-card-specials.js 里只有【战斗之勇】是真正的技能（用 ctx.hasSkill 判定，
// 会播技能台词），其余格林机枪 / 注射器 / 克罗研究记录都是饰品（hasEquipped），
// 按口径不属「技能」，不在时停管辖内。
//
// 【战斗之勇】归属 actor（出牌者）。正常流程里被时停者会在回合开始被跳过、
// 根本轮不到出牌，所以这里守住的是将来任何「非本回合出牌」的入口
// （响应 / 反击 / 复制技能），与已补齐的杀牌前置链同类。
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

// 布阵：我方米尔尤拉（持神奇怀表）；敌方 0 号持【战斗之勇】
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.phase = 4;
  b.kaiichiShare = null; b.kaiichiShareQueue = [];
  b.mieryulaTimeStopOwner = null; b.mieryulaBloodthirstPicker = null;
  while (b.allies.length < 2) {
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
  b.allies.slice(1).forEach(a => {
    a.hp = a.maxHp = 80; a.block = 0; a.hand = []; a.statuses = []; a.skills = [];
  });

  while (b.enemies.length < 2) {
    const n = b.enemies.length;
    b.enemies.push({ uid: "efill" + n, name: "补敌" + n, ref: "fill_e" + n, id: "fill_e" + n,
      gender: "male", side: "enemy", hp: 100, maxHp: 100, block: 0, hand: [], skills: [],
      statuses: [], battleRelics: [], stats: { attack: 4, magic: 4, speed: 4 } });
  }
  // enemies[0] 持【战斗之勇】，作为杀牌出牌者
  const foe = b.enemies[0];
  foe.name = "勇气敌"; foe.ref = "courage_foe"; foe.id = "courage_foe";
  foe.gender = "male"; foe.hp = foe.maxHp = 200; foe.block = 0;
  foe.statuses = []; foe.hand = []; foe.intent = 3;
  foe.stats = Object.assign({}, foe.stats || {}, { attack: 4, magic: 3, speed: 5 });
  foe.skills = [{ name: "战斗之勇", type: "passive", icon: "⭐", text: "t" }];
  b.enemies[1].hp = b.enemies[1].maxHp = 100;
  b.enemies[1].statuses = []; b.enemies[1].hand = []; b.enemies[1].skills = [];
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

// 敌方 0 号（持战斗之勇）对我方米尔尤拉打出实体【杀】
const slashTpl = `(() => {
  const st = window.state, b = st.battle;
  const foe = b.enemies[0], m = b.allies[0];
  b.animQueue = []; b.locked = false;
  st.log = [];
  const card = { name: "杀（普攻）", type: "slash", suit: "\\u2660", uid: "cg" + Date.now() };
  foe.hand.push(card);
  window.BattleSystem.useCard(st, foe, m, card);
  return { foeHp: foe.hp };
})()`;

const readTpl = `(() => {
  const st = window.state, b = st.battle;
  return {
    courage: (b.animQueue || []).filter(e => e && e.type === "battleCourage").length,
    marked: (b.enemies[0].statuses || []).includes("时停"),
    logs: (st.log || []).map(String).filter(x => x.includes("战斗之勇")),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(300);

  const runOnce = async cast => {
    await page.evaluate(setupTpl);
    const c = await page.evaluate(castTpl(cast));
    await page.evaluate(slashTpl);
    await page.waitForTimeout(600);
    const r = await page.evaluate(readTpl);
    return { ...r, castMarked: c.marked };
  };

  // ── 对照组：不施加时停 ──
  console.log("\n── 对照组：不施加时停 ──");
  const base = await runOnce(false);
  console.log(`   战斗之勇入队=${base.courage}；日志=${JSON.stringify(base.logs)}`);
  // 判定用日志而非 animQueue：battleCourage 事件会被 triggerBattleCourage 消费掉，
  // 等 600ms 后队列里已查不到，只看队列会得到恒真的假结果。
  T("A0 对照组：未时停时【战斗之勇】确实发动（断言非恒真）", base.logs.length > 0, base);
  T("A1 对照组确认未带时停标记", base.marked === false, base);

  // ── 实验组：施加时停 ──
  console.log("\n── 实验组：施加时停 ──");
  const stop = await runOnce(true);
  console.log(`   战斗之勇入队=${stop.courage}；日志=${JSON.stringify(stop.logs)}`);
  T("B0 时停已施加到敌方 0 号", stop.castMarked === true && stop.marked === true, stop);
  T("B1 时停后：【战斗之勇】不再发动", stop.logs.length === 0, stop);
  // 不设"B2 队列无残留"：battleCourage 事件会被 triggerBattleCourage 消费掉，
  // 无论是否时停队列里都查不到，属恒真假断言（铁律五），故不设。

  const errs = relevantErrors(errors);
  T("Z0 无 JS 报错", errs.length === 0, errs.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  if (pass !== total) process.exit(1);
})();
