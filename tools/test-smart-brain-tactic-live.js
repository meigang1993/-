// 智能大脑（被动）：战术牌造成的伤害翻倍。
// 历史 BUG：tacticDamage 只挂在攻击流程的 modifyAttackAmount 上，
// 而 与我一战 / 魔法对决 / 魔弹特攻 / 魔王军入侵 都是直连 ctx.damage，
// 完全绕过该函数 → 饰品对这些战术牌毫无效果（仅带 sweep 的枪林弹雨生效）。
// 修复后改挂在统一伤害结算链 battle-damage-resolution，覆盖全部战术牌路径。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0;
function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

// 我方 0 号行动，塞一张牌并真实打出
const playTpl = (relics, card, single) => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  b.activeUid = a.uid; b.phase = 4; b.locked = false;
  a.intent = 5; a.stats.attack = 3; a.stats.magic = 4;
  a.battleRelics = ${JSON.stringify(relics)};
  a.hand = [${JSON.stringify(card)}];
  b.enemies.forEach(e => { e.hand = []; e.block = 0; e.hp = 200; });
  st.log = [];
  window.render();
  const uid = ${single === true ? "b.enemies[0].uid" : "null"};
  window.BattleSystem.playActiveCard(st, 0, uid);
  return 1;
})()`;

const peekTpl = `(() => {
  const st = window.state, b = st.battle;
  return {
    foeHps: b.enemies.map(e => e.hp),
    logs: (st.log || []).slice(0, 140).map(String),
  };
})()`;

const CARDS = [
  { label: "与我一战", card: { name: "与我一战", type: "tactic", duel: true, scale: "attack", suit: "♠" }, single: true },
  { label: "魔法对决", card: { name: "魔法对决", type: "tactic", attackType: "magic", magicDuel: true, suit: "♠" }, single: true },
  { label: "魔王军入侵", card: { name: "魔王军入侵", type: "tactic", attackType: "magic", hybridAttack: true, demonInvasion: true, targetless: true, suit: "♠" }, single: false },
  { label: "枪林弹雨", card: { name: "枪林弹雨", type: "tactic", power: 1, hybridAttack: true, sweep: true, targetless: true, responseKind: "dodge", suit: "♦" }, single: false },
];

const runCase = async (browser, relics, c) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on("pageerror", e => errs.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  await page.evaluate(playTpl(relics, c.card, c.single));
  await page.waitForTimeout(1100);
  const r = await page.evaluate(peekTpl);
  await page.close();
  return { ...r, errs };
};

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  console.log("=== 智能大脑：战术牌伤害翻倍 ===");

  for (const c of CARDS) {
    const off = await runCase(browser, [], c);
    const on = await runCase(browser, ["智能大脑"], c);
    const lossOff = off.foeHps.map(h => 200 - h);
    const lossOn = on.foeHps.map(h => 200 - h);
    const base = lossOff.find(v => v > 0) || 0;
    const doubled = lossOn.every((v, i) =>
      (lossOff[i] > 0 ? v === lossOff[i] * 2 : v === 0));
    pass += check(`${c.label}：${JSON.stringify(lossOff)} → ${JSON.stringify(lossOn)}`,
      base > 0 && doubled, { base, lossOff, lossOn });
    if (on.logs.some(l => /智能大脑/.test(l)) === false) {
      pass += check(`${c.label}：打出智能大脑战报`, false, on.logs.slice(0, 4));
    }
    errors.push(...off.errs, ...on.errs);
  }

  // 反向对照：非战术牌不应翻倍
  const slash = { name: "杀（普攻）", type: "slash", scale: "attack", suit: "♠" };
  const offS = await runCase(browser, [], { ...slash, card: slash, single: true });
  const onS = await runCase(browser, ["智能大脑"], { ...slash, card: slash, single: true });
  const lossOffS = offS.foeHps.map(h => 200 - h);
  const lossOnS = onS.foeHps.map(h => 200 - h);
  pass += check(`对照：普通杀不应翻倍 ${JSON.stringify(lossOffS)} → ${JSON.stringify(lossOnS)}`,
    lossOffS.every((v, i) => v === lossOnS[i]), { lossOffS, lossOnS });
  errors.push(...offS.errs, ...onS.errs);

  pass += check("无 JS 错误", errors.length === 0, errors.slice(0, 3));
  await browser.close();
  console.log(`\n=== ${pass}/6 通过 ===`);
  process.exit(pass === 6 ? 0 : 1);
})();
