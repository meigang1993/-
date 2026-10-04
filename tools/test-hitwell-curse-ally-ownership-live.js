// 心血之咒（希特威）在「伤害来源是友方」时的归属验证
//
// 锁定技描述：当你受到伤害后，伤害来源须交给你一张♥红桃牌。
// 触发路径里存在大量「友方角色互相攻击」的情况：
//   外神之眼 / 百眼魅魔 / 控神魔眼（令友方角色互相视为使用杀或决斗）
//   榨取精华 / 苦肉鞭挞（对友方角色造成伤害）
// 于是可能出现：友方 A 手里那张红桃牌本是从敌方夺来的（stolenFromUid 指向敌方）。
// 若此时把归属改写成 A（友方），就等于把敌方的牌永久洗成我方资源。
//
// 两个子场景：
//   A 友方自有红桃牌      → 应标 stolenFromUid = A，弃置后回 A 堆（借）
//   B 友方手里的敌方红桃牌 → 归属须仍为敌方，弃置后回敌方堆（不得洗白）
// 注：同阵营单位默认共享 pileStats，会让落点判定失效，这里给每个单位独立 pileStats。
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
  const b = window.state.battle;
  b.animQueue = []; b.locked = false; b.pendingVictory = false;
  b.allies.concat(b.enemies).forEach(u => {
    u.hp = 80; u.maxHp = 100; u.block = 0; u.hand = [];
    u.pileStats = { deck: [], discard: [], consumed: [], draw: [] };
  });
  window.state.log = [];
  window.render();
  return true;
})()`;

// fromFoe: 友方手里的红桃牌是否预设为「从敌方夺来」
const driveTpl = fromFoe => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.pendingVictory = false;
  b.allies.concat(b.enemies).forEach(u => {
    u.hp = 80; u.maxHp = 100; u.block = 0; u.hand = [];
    u.pileStats = { deck: [], discard: [], consumed: [], draw: [] };
  });
  const a0 = b.allies[0], a1 = b.allies[1], e0 = b.enemies[0];
  // 把 ally1 构造成希特威（判定只看 ref/id + 技能名）
  a1.ref = "hitwell";
  a1.name = "希特威";
  a1.skills = [{ name: "心血之咒", type: "passive", icon: "⭐", text: "锁定技" }];
  const card = window.CardUtils.fromEntity("杀（普攻）");
  card.suit = "♥";
  const presetUid = ${fromFoe ? "e0.uid" : "null"};
  if (presetUid) card.stolenFromUid = presetUid;
  a0.hand.push(card);
  st.log = [];
  // 友方 a0 对友方希特威 a1 造成 5 点伤害 —— 走真实的 afterDamage 入口
  window.HitwellSkills.afterDamage(st, a0, a1, null, 5, { damage: () => {} });
  const got = a1.hand.find(c => c === card) || null;
  const logs = (st.log || []).map(l => typeof l === "string" ? l : (l.text || ""));
  if (got) window.BattleCards.put(b, a1, got, "discard", { skipAnim: true });
  const landedIn = [];
  b.allies.forEach((u, i) => { if (u.pileStats.discard.includes(card)) landedIn.push("ally" + i); });
  b.enemies.forEach((u, i) => { if (u.pileStats.discard.includes(card)) landedIn.push("enemy" + i); });
  return {
    fired: logs.some(t => t.includes("心血之咒")),
    movedToHitwell: !!got,
    stillInActor: a0.hand.includes(card),
    stolenUid: card.stolenFromUid || null,
    a0Uid: a0.uid, a1Uid: a1.uid, e0Uid: e0.uid, presetUid,
    landedIn,
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await openGame(page);
  await startRegressionBattle(page);
  await page.evaluate(baseTpl);

  // 场景 A：友方自有的红桃牌
  const A = await page.evaluate(driveTpl(false));
  T("A 友方伤害友方时心血之咒确实触发", A.fired, A);
  T("A 红桃牌确实被交给希特威", A.movedToHitwell && !A.stillInActor, A);
  T("A 自有牌标记原主 = 伤害来源（友方 A）", A.stolenUid === A.a0Uid, A);
  T("A 自有牌弃置后回到该友方堆",
    A.landedIn.length === 1 && A.landedIn[0] === "ally0", A);
  await page.evaluate(baseTpl);

  // 场景 B：友方手里那张红桃牌本是从敌方夺来的
  const B = await page.evaluate(driveTpl(true));
  T("B 友方伤害友方时心血之咒确实触发", B.fired, B);
  T("B 红桃牌确实被交给希特威", B.movedToHitwell && !B.stillInActor, B);
  T("B 已属敌方的牌不被洗成友方", B.stolenUid === B.e0Uid, B);
  T("B 已属敌方的牌弃置后回到敌方堆",
    B.landedIn.length === 1 && B.landedIn[0] === "enemy0", B);

  T("页面无 JS 错误", errors.length === 0, { errors: errors.slice(0, 3) });
  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
