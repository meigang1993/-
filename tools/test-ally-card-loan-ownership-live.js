// 同阵营「交牌」= 借：牌仍属交出者，弃置时须回到交出者牌堆
//
// 覆盖 7 处交牌中 3 个可直接驱动的入口：
//   米勒·收获分享 resolveShare / 诺诺卡·新月之歌 resolveShare / 卡迪西斯·责任心 resolveResponsibility
// 每处两个子场景：
//   A 全新牌        → 应标 stolenFromUid = 交出者，弃置后回交出者堆
//   B 已属敌方的牌  → 归属不得被覆盖成友方，弃置后回敌方堆（否则=洗白）
// 注意：同阵营单位默认共享同一份 pileStats，会让落点判定失效，
//       所以这里给每个单位强制独立 pileStats。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

const baseTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.pendingVictory = false;
  b.allies.concat(b.enemies).forEach(u => {
    u.hp = 80; u.maxHp = 100; u.block = 0; u.hand = [];
    u.pileStats = { deck: [], discard: [], consumed: [], draw: [] };
  });
  st.log = [];
  window.render();
  return { allies: b.allies.length, foes: b.enemies.length };
})()`;

const driveTpl = (drive, presetEnemy) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.allies.concat(b.enemies).forEach(u => {
    u.hp = 80; u.maxHp = 100; u.hand = [];
    u.pileStats = { deck: [], discard: [], consumed: [], draw: [] };
  });
  const a0 = b.allies[0], a1 = b.allies[1], e0 = b.enemies[0];
  const card = window.CardUtils.fromEntity("杀（普攻）");
  card.suit = "♠";
  const presetUid = ${presetEnemy ? "e0.uid" : "null"};
  if (presetUid) card.stolenFromUid = presetUid;
  a0.hand.push(card);
  if (${JSON.stringify(drive)} === "miller") {
    b.millerShare = { unitUid: a0.uid, cards: [card], indexes: [0] };
    window.MillerSkills.resolveShare(st, a1.uid);
  } else if (${JSON.stringify(drive)} === "nonoka") {
    b.newMoonShare = { unitUid: a0.uid, indexes: [0], count: 1 };
    window.NonokaNewMoonSkills.resolveShare(st, a1.uid);
  } else {
    b.cadicisResponsibility = { cadicisUid: a0.uid, targetUid: a1.uid };
    window.CadicisResponsibility.resolveResponsibility(st, 0);
  }
  const got = a1.hand.find(c => c === card) || null;
  if (got) window.BattleCards.put(b, a1, got, "discard", { skipAnim: true });
  const landedIn = [];
  b.allies.forEach((u, i) => { if (u.pileStats.discard.includes(card)) landedIn.push("ally" + i); });
  b.enemies.forEach((u, i) => { if (u.pileStats.discard.includes(card)) landedIn.push("enemy" + i); });
  return {
    movedToA1: !!got,
    stolenUid: card.stolenFromUid || null,
    a0Uid: a0.uid, a1Uid: a1.uid, e0Uid: e0.uid, presetUid,
    landedIn,
  };
})()`;

const cases = [
  ["米勒·收获分享", "miller"],
  ["诺诺卡·新月之歌", "nonoka"],
  ["卡迪西斯·责任心", "cadicis"],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await openGame(page);
  await startRegressionBattle(page);
  await page.evaluate(baseTpl);

  for (const [label, drive] of cases) {
    const A = await page.evaluate(driveTpl(drive, false));
    T(`${label}：交牌确实发生`, A.movedToA1, A);
    T(`${label}：全新牌标记原主 = 交出者`, A.stolenUid === A.a0Uid, A);
    T(`${label}：全新牌弃置后回到交出者堆`,
      A.landedIn.length === 1 && A.landedIn[0] === "ally0", A);

    const B = await page.evaluate(driveTpl(drive, true));
    T(`${label}：已属敌方的牌不被洗成友方`,
      B.stolenUid === B.e0Uid, B);
    T(`${label}：已属敌方的牌弃置后回到敌方堆`,
      B.landedIn.length === 1 && B.landedIn[0] === "enemy0", B);
    await page.evaluate(baseTpl);
  }

  T("页面无 JS 错误", errors.length === 0, { errors: errors.slice(0, 3) });
  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
