// 专项回归：
//   机尾机枪（机械AI龙）：虚拟【机枪扫杀】可被【闪】响应；护甲按「对每名角色
//     造成的伤害量」累加（被响应者不计）。
//     改动前该虚拟牌 type:"skill" 且无 responseKind，needsResponse 恒为 false，
//     即使去掉 ignoreResponse 也无法被响应。
//   疯狂刺刀（卡洛斯）：造成护甲值伤害（未造成生命值伤害）时能否触发多段。
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
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 把敌方 0 号改造成机械AI龙；allyHand 为我方 0 号手牌，dragonHand 为龙手牌
const tailgunTpl = (allyHand, dragonHand) => `(() => {
  const st = window.state, b = st.battle;
  st.settings = Object.assign({}, st.settings || {}, { manualResponse: false });
  const a = b.allies[0], d = b.enemies[0];
  b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  a.intent = 5; a.hp = 200; a.maxHp = 200; a.block = 0;
  a.hand = ${JSON.stringify(allyHand)};
  a.hand.forEach(c => { delete c._pendingDraw; });
  d.ai = "ruins_dragon"; d.hp = 300; d.maxHp = 300; d.block = 0;
  d.stats = Object.assign({}, d.stats || {}, { attack: 13, magic: 8, speed: 15 });
  d.hand = ${JSON.stringify(dragonHand)};
  d.hand.forEach(c => { delete c._pendingDraw; });
  d.ruinsHitsThisTurn = 0; d.ruinsGunFired = false;
  b.allies.slice(1).forEach(x => { x.hp = 200; x.maxHp = 200; x.block = 0; x.hand = []; });
  b.enemies.slice(1).forEach(x => { x.hp = 300; x.maxHp = 300; });
  st.log = [];
  window.render();
  return { allyCount: b.allies.length };
})()`;

const playSlashTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], d = b.enemies[0];
  const idx = a.hand.findIndex(c => c.type === "slash");
  if (idx < 0) return { ok: false, reason: "手牌无杀" };
  const ok = window.BattleSystem.playActiveCard(st, idx, d.uid);
  return { ok };
})()`;

const peekTailgunTpl = `(() => {
  const st = window.state, b = st.battle;
  const d = b.enemies[0];
  return {
    dragonBlock: d.block || 0,
    alliesHp: b.allies.map(x => x.hp),
    alliesHand: b.allies.map(x => (x.hand || []).filter(c => !c._pendingDraw).map(c => c.name)),
    logs: (st.log || []).slice(0, 40).map(String),
  };
})()`;

// 疯狂刺刀：把我方 0 号改造成卡洛斯，敌方 0 号设护甲
const bayonetTpl = (block, handKills) => `(() => {
  const st = window.state, b = st.battle;
  st.settings = Object.assign({}, st.settings || {}, { manualResponse: false });
  const a = b.allies[0], e = b.enemies[0];
  b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  a.ref = "carlos";
  a.stats = Object.assign({}, a.stats || {}, { attack: 10, magic: 1, speed: 4 });
  a.tempAttack = 0;
  a.intent = 5; a.hp = 200; a.maxHp = 200; a.block = 0;
  const kills = [];
  for (let i = 0; i < ${handKills}; i++) kills.push({ name: "杀", type: "slash", suit: "♠", scale: "attack" });
  a.hand = kills;
  a.hand.forEach(c => { delete c._pendingDraw; });
  e.hp = 300; e.maxHp = 300; e.block = ${block}; e.hand = [];
  b.enemies.slice(1).forEach(x => { x.hp = 300; x.maxHp = 300; });
  st.log = [];
  window.render();
  return { attack: a.stats.attack, kills: a.hand.length, block: e.block };
})()`;

const peekBayonetTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[0];
  return {
    foeHp: e.hp, foeBlock: e.block || 0,
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

  // ================= 机尾机枪 =================
  console.log("\n---------- 机尾机枪 ----------");

  // 场景A：我方无闪 → 虚拟机枪扫杀打出全部伤害，龙按每名角色伤害量获得护甲
  await page.evaluate(tailgunTpl(
    [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }],
    [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }]));
  await page.evaluate(playSlashTpl);
  await page.waitForTimeout(1500);
  const tgA = await page.evaluate(peekTailgunTpl);
  const lossA = tgA.alliesHp.map(hp => 200 - hp);
  const dealtA = lossA.reduce((s, v) => s + v, 0);
  console.log(`[场景A 无闪] 我方血量 ${JSON.stringify(tgA.alliesHp)} 掉血 ${JSON.stringify(lossA)} 龙护甲 ${tgA.dragonBlock}`);
  console.log(`  日志: ${(tgA.logs || []).filter(l => /机尾机枪|闪/.test(l)).slice(0, 4).join(" / ")}`);
  T("机尾机枪：触发后对我方全体造成伤害", dealtA > 0, tgA);
  T("机尾机枪：护甲等于对各角色造成的伤害量之和",
    dealtA > 0 && tgA.dragonBlock === dealtA, { dealtA, block: tgA.dragonBlock });

  // 场景B：我方有闪 → 虚拟牌可被响应，被响应者不掉血，龙护甲只按实际伤害计
  await page.evaluate(tailgunTpl(
    [{ name: "杀", type: "slash", suit: "♠", scale: "attack" },
     { name: "闪", type: "response", suit: "♠" }],
    [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }]));
  await page.evaluate(playSlashTpl);
  await page.waitForTimeout(1500);
  const tgB = await page.evaluate(peekTailgunTpl);
  const lossB = tgB.alliesHp.map(hp => 200 - hp);
  const dealtB = lossB.reduce((s, v) => s + v, 0);
  console.log(`[场景B 有闪] 我方血量 ${JSON.stringify(tgB.alliesHp)} 掉血 ${JSON.stringify(lossB)} 龙护甲 ${tgB.dragonBlock}`);
  console.log(`  日志: ${(tgB.logs || []).filter(l => /机尾机枪|闪|响应/.test(l)).slice(0, 5).join(" / ")}`);
  T("机尾机枪：虚拟【机枪扫杀】可被【闪】响应（有闪时总伤害低于无闪场景）",
    dealtB < dealtA, { dealtA, dealtB });
  T("机尾机枪：被响应后不误给护甲（护甲等于实际伤害量）",
    tgB.dragonBlock === dealtB, { dealtB, block: tgB.dragonBlock });

  // ================= 疯狂刺刀 × 护甲 =================
  console.log("\n---------- 疯狂刺刀 × 护甲 ----------");

  // 对照：无护甲 → 第一段 10 伤害 + 追加 3 段 × 10 = 40
  await page.evaluate(bayonetTpl(0, 4));
  const cfgA = await page.evaluate(peekBayonetTpl);
  await page.evaluate(playSlashTpl);
  await page.waitForTimeout(1500);
  const bnA = await page.evaluate(peekBayonetTpl);
  const lossNone = 300 - bnA.foeHp;
  console.log(`[对照 护甲0] 敌 ${300}→${bnA.foeHp}，掉血 ${lossNone}`);
  console.log(`  日志: ${(bnA.logs || []).filter(l => /疯狂刺刀/.test(l)).slice(0, 3).join(" / ")}`);
  const triggeredNone = (bnA.logs || []).some(l => /疯狂刺刀/.test(l));
  T("对照：无护甲时疯狂刺刀触发（日志出现疯狂刺刀）", triggeredNone, bnA);

  // 场景：护甲足够厚，第一段被完全吸收 → 无生命值伤害
  await page.evaluate(bayonetTpl(999, 4));
  await page.evaluate(playSlashTpl);
  await page.waitForTimeout(1500);
  const bnB = await page.evaluate(peekBayonetTpl);
  const lossBlocked = 300 - bnB.foeHp;
  const triggeredBlocked = (bnB.logs || []).some(l => /疯狂刺刀/.test(l));
  const blockedBayonetLogs = (bnB.logs || []).filter(l => /疯狂刺刀/.test(l));
  const blockedPierce = blockedBayonetLogs.filter(l => /无视护甲/.test(l)).length;
  console.log(`[护甲999] 敌 ${300}→${bnB.foeHp}，掉血 ${lossBlocked}，护甲剩 ${bnB.foeBlock}`);
  console.log(`  日志: ${blockedBayonetLogs.slice(0, 4).join(" / ")}`);
  T("疯狂刺刀：第一段被护甲完全吸收（无生命值伤害）时仍触发多段",
    triggeredBlocked === true, bnB);
  // 第一段 10 点全部打在护甲上（999→989，生命值 0），追加 3 段无视护甲各 10 点
  T("疯狂刺刀：护甲吸收第一段仍追加3段无视护甲，总掉血30、护甲仅被第一段消耗10",
    triggeredBlocked === true && lossBlocked === 30 && blockedPierce === 3
      && bnB.foeBlock === 989,
    { lossBlocked, blockedPierce, foeBlock: bnB.foeBlock, blockedBayonetLogs });

  // 场景：护甲部分吸收，仍有生命值伤害 → 应触发，追加段无视护甲
  await page.evaluate(bayonetTpl(3, 4));
  await page.evaluate(playSlashTpl);
  await page.waitForTimeout(1500);
  const bnC = await page.evaluate(peekBayonetTpl);
  const lossPartial = 300 - bnC.foeHp;
  const triggeredPartial = (bnC.logs || []).some(l => /疯狂刺刀/.test(l));
  console.log(`[护甲3] 敌 ${300}→${bnC.foeHp}，掉血 ${lossPartial}，护甲剩 ${bnC.foeBlock}`);
  console.log(`  日志: ${(bnC.logs || []).filter(l => /疯狂刺刀/.test(l)).slice(0, 3).join(" / ")}`);
  T("疯狂刺刀：护甲部分吸收（仍有生命值伤害）时触发多段",
    triggeredPartial === true, bnC);
  // 说明：护甲会被第一段消耗（护甲3 被第一段10点全部抵消，故剩余为0），
  // 因此不能靠剩余护甲未被追加段消耗判断；改为校验日志明确标注无视护甲，
  // 且总掉血 = 第一段穿透(10-3) + 追加3段×10 = 37。
  const bayonetLogs = (bnC.logs || []).filter(l => /疯狂刺刀/.test(l));
  // 手牌4张杀，打出1张后剩3张 → 追加3段；每段日志标注无视护甲
  const pierceLogs = bayonetLogs.filter(l => /无视护甲/.test(l)).length;
  T("疯狂刺刀：追加3段且每段标注无视护甲，总掉血=第一段穿透7+追加30=37",
    triggeredPartial === true && lossPartial === 37 && pierceLogs === 3,
    { lossPartial, pierceLogs, bayonetLogs: bayonetLogs.slice(0, 5) });

  await page.close();
  await browser.close();
  console.log(`\n页面错误: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})();
