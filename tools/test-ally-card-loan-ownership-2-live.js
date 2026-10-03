// 同阵营「交牌」= 借（第二批）：牌仍属交出者，弃置时须回到交出者牌堆
//
// 上一批（test-ally-card-loan-ownership-live.js）只覆盖了 3 个入口，
// 本批补上剩余 4 个可达入口：
//   星野一·半魅魔血交牌  resolveShare
//   艾斯·贡献计划        ElranaAceNanaliSkills.handleSpecialCard
//   艾伦格·战斗演练      GuestAilengSkills.resolveBattleDrill
//   巴卡尔·捕获入侵      BakarSkills.completeInvasion
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
    u.hp = 80; u.maxHp = 100; u.block = 0; u.hand = [];
    u.pileStats = { deck: [], discard: [], consumed: [], draw: [] };
  });
  const a0 = b.allies[0], a1 = b.allies[1], e0 = b.enemies[0];
  const card = window.CardUtils.fromEntity("杀（普攻）");
  card.suit = "♠";
  const presetUid = ${presetEnemy ? "e0.uid" : "null"};
  if (presetUid) card.stolenFromUid = presetUid;

  const drive = ${JSON.stringify(drive)};
  if (drive === "kaiichi") {
    a0.ref = "hoshino_kaiichi";
    a0.hand.push(card);
    b.kaiichiShare = { unitUid: a0.uid, indexes: [0], count: 1 };
    window.HoshinoKaiichiSkills.resolveShare(st, a1.uid);
  } else if (drive === "ace") {
    a0.usedAceContribution = false;
    card.aceContribution = true;
    card.name = "贡献计划";
    a0.hand.push(card);
    window.ElranaAceNanaliSkills.handleSpecialCard(st, a0, a1, card, {}, {});
  } else if (drive === "aileng") {
    a0.hand.push(card);
    b.ailengDrillPicker = { actorUid: a0.uid, card };
    window.GuestAilengSkills.resolveBattleDrill(st, a1.uid);
  } else {
    // bakar：需要两个巴卡尔单位，牌放在弃牌堆（捕获入侵取"用过的牌"）
    // 注意：fromEntity 返回的是 virtual 牌，而 takeUsedCard 明确跳过 virtual
    //（虚拟牌本就不在真实牌堆里），所以这里必须标记为实体牌才能被取到。
    a0.id = "demon_king_bakaar";
    a1.id = "demon_king_bakaar";
    card.virtual = false;
    a0.pileStats.discard.push(card);
    b.bakarInvasionCapture = { actorUid: a0.uid, card, triggered: [] };
    window.BakarSkills.completeInvasion(st);
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
  ["星野一·半魅魔血交牌", "kaiichi"],
  ["艾斯·贡献计划", "ace"],
  ["艾伦格·战斗演练", "aileng"],
  ["巴卡尔·捕获入侵", "bakar"],
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
    T(`${label}：已属敌方的牌未被洗成友方`, B.stolenUid === B.e0Uid, B);
    T(`${label}：已属敌方的牌弃置后回到敌方堆`,
      B.landedIn.length === 1 && B.landedIn[0] === "enemy0", B);
  }

  T("无页面 JS 错误", errors.length === 0, errors.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  if (pass !== total) process.exit(1);
})().catch(e => {
  console.error("FATAL", e && e.message);
  process.exit(1);
});
