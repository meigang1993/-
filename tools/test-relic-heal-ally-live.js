// 治疗类饰品 · 给队员回血 实战回归（严格版）
//
// 覆盖两条真实入口：
//   1) 凋零者胸部 —— window.WithererSkills.afterDamage（游戏里 battle-damage-triggers.js
//      的真实调用签名），内部走 healOtherByChest 给同阵营最缺血的队友回血。
//   2) 艾尔拉娜大型注射器 —— 走 BattleSystem.useCard 真实打出【杀】造成生命伤害，
//      由结算钩子触发 healBySyringe 给最缺血队友回血。
//
// 断言的是「实际效果」+「不报错」：队友生命真的变化、日志真的产生、页面无 JS 错误，
// 而不是只看函数有没有被调用。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 场景1：凋零者胸部。我方 1 号佩戴，受伤后给 0 号队友回血（magic=5）
const CHEST = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  const wearer = b.allies[1], mate = b.allies[0];
  wearer.ref = "witherer_1124_split";
  wearer.battleRelics = ["凋零者胸部"];
  wearer.stats = Object.assign({}, wearer.stats, { magic: 5 });
  wearer.maxHp = 100; wearer.hp = 90;
  mate.maxHp = 100; mate.hp = 50; mate.battleRelics = [];
  b.enemies.forEach(u => { u.battleRelics = []; u.hp = 100; u.maxHp = 100; });
  st.log = [];
  let err = null;
  try {
    // 与 battle-damage-triggers.js:58 完全一致的签名
    window.WithererSkills.afterDamage(st, b.enemies[0], wearer,
      { name: "杀（普攻）", type: "slash" }, 10,
      () => {}, () => [], () => {});
  } catch (e) { err = String(e); }
  return {
    err,
    mateHp: mate.hp,
    wearerHp: wearer.hp,
    logs: st.log.slice(0, 4),
  };
})()`;

// 场景2：艾尔拉娜大型注射器。我方 0 号佩戴，真实打出【杀】造成伤害后给 1 号队友回血
const SYRINGE = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.activeUid = b.allies[0].uid; b.phase = 4;
  const actor = b.allies[0], mate = b.allies[1], foe = b.enemies[0];
  actor.battleRelics = ["艾尔拉娜大型注射器"];
  actor.stats = Object.assign({}, actor.stats, { attack: 7 });
  actor.maxHp = 200; actor.hp = 200; actor.intent = 5;
  actor.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" }];
  actor.hand.forEach(c => { delete c._pendingDraw; });
  mate.maxHp = 100; mate.hp = 40; mate.battleRelics = [];
  b.enemies.forEach(u => { u.hand = []; u.battleRelics = []; u.maxHp = 400; u.hp = 400; u.block = 0; });
  foe.name = "测试靶"; foe.block = 0;
  st.log = [];
  let err = null;
  try {
    window.BattleSystem.useCard(st, actor, foe, actor.hand[0]);
  } catch (e) { err = String(e); }
  return {
    err,
    mateHp: mate.hp,
    foeHp: foe.hp,
    logs: st.log.slice(0, 6),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  console.log("\n【场景1】凋零者胸部 —— 佩戴者受伤，给最缺血队友回血");
  const chest = await page.evaluate(CHEST);
  T("调用未抛异常", !chest.err, chest);
  T("队友生命真的恢复（50 → 55）", chest.mateHp === 55, chest);
  T("佩戴者自身未因此回血（仍 90）", chest.wearerHp === 90, chest);
  T("日志记录了凋零者胸部触发",
    (chest.logs || []).some(l => String(l).includes("凋零者胸部")), chest);

  console.log("\n【场景2】艾尔拉娜大型注射器 —— 打出【杀】后给最缺血队友回血");
  const syringe = await page.evaluate(SYRINGE);
  T("调用未抛异常", !syringe.err, syringe);
  T("敌方真的受到伤害", syringe.foeHp < 400, syringe);
  T("队友生命真的恢复（40 → 更高）", syringe.mateHp > 40, syringe);
  T("日志记录了注射器触发",
    (syringe.logs || []).some(l => String(l).includes("艾尔拉娜大型注射器")), syringe);

  const bad = relevantErrors(errors);
  T("页面无 JS 错误", bad.length === 0, bad.slice(0, 3));

  console.log(`\n结果：${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
