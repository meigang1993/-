// 专项核实：两件饰品是否真的实现了效果
//  粉色魅魔装（XX型凋零者1312号掉落）：红色牌对你无效；你使用的红色牌不可响应。
//  冰心双刺剑（内英组杀手希尔德掉落）：你获得的单体【杀】牌转换为不消耗杀意的【刺杀】。
// 静态扫描显示这两件饰品名在全部逻辑代码中出现 0 次（其余 38 件都有钩子），
// 本脚本用真实浏览器验证其描述是否成立。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const FOE = 0;
let pass = 0, total = 0;
function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}
const T = (n, c, x) => { total++; pass += check(n, c, x); };

// 构造：我方 0 号行动，手牌一张红色单体【杀】；敌方 0 号可配饰品/手牌
const setupTpl = (allyRelics, foeRelics, foeHand) => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], e = b.enemies[${FOE}];
  b.activeUid = a.uid; b.phase = 4; b.locked = false;
  b.animQueue = [];
  a.intent = 5; a.battleRelics = ${JSON.stringify(allyRelics || [])};
  a.hand = [{ name: "杀", type: "slash", suit: "♥", scale: "attack" }];
  a.hand.forEach(c => { delete c._pendingDraw; });
  e.battleRelics = ${JSON.stringify(foeRelics || [])};
  e.hand = ${JSON.stringify(foeHand || [])};
  e.hand.forEach(c => { delete c._pendingDraw; });
  e.block = 0; e.hp = 200;
  st.log = [];
  window.render();
  return { allyIntent: a.intent, foeHp: e.hp };
})()`;

const playTpl = `(() => {
  const st = window.state, b = st.battle;
  const uid = b.enemies[${FOE}].uid;
  const ok = window.BattleSystem.playActiveCard(st, 0, uid);
  return { ok, allyIntent: b.allies[0].intent };
})()`;

const peekTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}], a = b.allies[0];
  return {
    foeHp: e.hp,
    foeHand: (e.hand || []).filter(c => !c._pendingDraw).map(c => c.name),
    allyIntent: a.intent,
    allyHand: (a.hand || []).filter(c => !c._pendingDraw).map(c => c.name + (c.suit || "")),
    logs: (st.log || []).slice(0, 40).map(String),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  // ===== 粉色魅魔装 ①：红色牌对该角色无效（敌方装备）=====
  // 对照：敌方不装备
  await page.evaluate(setupTpl([], [], []));
  await page.evaluate(playTpl);
  await page.waitForTimeout(900);
  const base = await page.evaluate(peekTpl);
  const baseLoss = 200 - base.foeHp;
  console.log(`[对照] 敌方无饰品，红色杀造成掉血 ${baseLoss}`);

  await page.evaluate(setupTpl([], ["粉色魅魔装"], []));
  await page.evaluate(playTpl);
  await page.waitForTimeout(900);
  const pink = await page.evaluate(peekTpl);
  const pinkLoss = 200 - pink.foeHp;
  console.log(`[粉色魅魔装] 敌方装备后，红色杀造成掉血 ${pinkLoss}`);
  T("粉色魅魔装：红色牌对该角色无效（装备后不掉血）",
    baseLoss > 0 && pinkLoss === 0, { baseLoss, pinkLoss, logs: pink.logs.slice(0, 5) });

  // ===== 粉色魅魔装 ②：我方装备后，使用的红色牌不可被响应 =====
  // 对照：敌方有【闪】，我方不装备 → 闪被消耗、不掉血
  const FLASH = [{ name: "闪", type: "dodge", suit: "♠" }];
  await page.evaluate(setupTpl([], [], FLASH));
  await page.evaluate(playTpl);
  await page.waitForTimeout(900);
  const base2 = await page.evaluate(peekTpl);
  console.log(`[对照] 敌方有闪，我方无饰品 → 敌掉血 ${200 - base2.foeHp}，敌手牌 ${JSON.stringify(base2.foeHand)}`);

  await page.evaluate(setupTpl(["粉色魅魔装"], [], FLASH));
  await page.evaluate(playTpl);
  await page.waitForTimeout(900);
  const pink2 = await page.evaluate(peekTpl);
  console.log(`[粉色魅魔装] 我方装备 → 敌掉血 ${200 - pink2.foeHp}，敌手牌 ${JSON.stringify(pink2.foeHand)}`);
  T("粉色魅魔装：我方红色牌不可被响应（敌方闪未消耗且掉血）",
    200 - pink2.foeHp > 0 && (pink2.foeHand || []).some(n => /闪/.test(n)),
    { loss: 200 - pink2.foeHp, foeHand: pink2.foeHand, logs: pink2.logs.slice(0, 5) });

  // ===== 冰心双刺剑：单体杀转为不消耗杀意的【刺杀】 =====
  // 对照：不装备时打出杀消耗杀意
  await page.evaluate(setupTpl([], [], []));
  const beforeBase = await page.evaluate(peekTpl);
  await page.evaluate(playTpl);
  await page.waitForTimeout(900);
  const base3 = await page.evaluate(peekTpl);
  const baseIntentCost = beforeBase.allyIntent - base3.allyIntent;
  console.log(`[对照] 无饰品打出杀，杀意消耗 ${baseIntentCost}`);

  await page.evaluate(setupTpl(["冰心双刺剑"], [], []));
  const beforeIce = await page.evaluate(peekTpl);
  await page.evaluate(playTpl);
  await page.waitForTimeout(900);
  const ice = await page.evaluate(peekTpl);
  const iceIntentCost = beforeIce.allyIntent - ice.allyIntent;
  console.log(`[冰心双刺剑] 打出杀，杀意消耗 ${iceIntentCost}，日志: ${(ice.logs || []).slice(0, 4).join(" / ")}`);
  T("冰心双刺剑：单体杀不消耗杀意（已转为刺杀）",
    baseIntentCost > 0 && iceIntentCost === 0,
    { baseIntentCost, iceIntentCost, logs: ice.logs.slice(0, 6) });

  await page.close();
  await browser.close();
  console.log(`\n页面错误: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})();
