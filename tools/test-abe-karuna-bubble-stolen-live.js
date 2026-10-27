// 安倍卡露娜【记忆泡泡】× 偷来的牌（归属）严格检查：
//
//   A 段：偷来的普通牌 —— 打出后按归属进**原主（敌人）**的弃牌堆；
//         「放入」应能从原主弃牌堆摘出并进泡泡区（修复前：只找自己弃牌堆
//         → 找不到 → 静默失败，点了「放入」牌却没进区）。
//   B 段：偷来的消耗牌 —— 进原主消耗区；「放入」从原主消耗区摘出；
//         泡泡区使用后才真正消耗，并回原主消耗区。
//   C 段：对照 —— 非偷来的牌仍走自己的弃牌堆/消耗区（归属未被误改）。
//   D 段：归属兜底 —— stolenFromUid 指向已不在场的单位时，回落自己牌堆。
//   E 段：防误摘 —— 自己弃牌堆里有一张同名同花色的牌时，「放入」必须摘走
//         原主那张，不能误摘自己这张（否则总数凭空 +1，实为复制牌）。
//
// 分批：KARUNA_ST=A|B|C|D|E，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KARUNA_ST || "ALL").toUpperCase();
const want = p => PART === "ALL" || PART === p;

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

const evalT = async (page, expr, ms = 15000, label = "evaluate") => {
  let timer;
  const guard = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([page.evaluate(expr), guard]);
  } catch (e) {
    console.log(`⚠️  ${label}: ${e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

// stolen: true → 手牌带 stolenFromUid（敌人 uid），模拟偷来的牌
// decoy:  true → 预先往卡露娜自己弃牌堆塞一张同名同花色牌（E 段防误摘用）
const setupTpl = (cards, opts = {}) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.karunaBubblePending; delete b.thunderHammer;
  delete b.selectedSkillCard;
  const u = b.allies[0], foe = b.enemies[0];
  u.name = "安倍卡露娜"; u.ref = "abe_karuna"; u.id = "abe_karuna";
  u.gender = "female";
  u.stats = { attack: 2, magic: 4, speed: 3, maxHp: 50, bloodlust: 1, handLimit: 3 };
  u.hp = u.maxHp = 50; u.block = 0; u.intent = 1;
  u.skills = [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }];
  delete u.bubbleCards; delete u.karunaLastColor; delete u.karunaLastSuit;
  u.pileStats = u.pileStats || {};
  u.pileStats.discard = []; u.pileStats.consumed = [];
  u.discard = u.pileStats.discard; u.consumed = u.pileStats.consumed;
  b.enemies.forEach(e => {
    e.hp = e.maxHp = 90; e.block = 0; e.statuses = [];
    e.hand = []; e.noResponse = true;
    e.pileStats = e.pileStats || {};
    e.pileStats.discard = []; e.pileStats.consumed = [];
    e.discard = e.pileStats.discard; e.consumed = e.pileStats.consumed;
  });
  const hand = ${JSON.stringify(cards)};
  ${opts.stolen ? "hand.forEach(c => { c.stolenFromUid = foe.uid; });" : ""}
  ${opts.ghostUid ? "hand.forEach(c => { c.stolenFromUid = 'ghost_uid_not_in_battle'; });" : ""}
  u.hand = hand;
  ${opts.decoy ? "u.pileStats.discard.push({ name: hand[0].name, type: hand[0].type, suit: hand[0].suit, text: '', targetless: true, _decoy: true });" : ""}
  b.activeUid = u.uid;
  b.selectedCardIndex = -1;
  st.log = []; st.battleLog = [];
  window.render();
  return { hand: u.hand.length, foeUid: foe.uid };
})()`;

// 同时快照我方与原主的牌堆，才能看出归属
const snapTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0], foe = b.enemies[0];
  return {
    hand: (u.hand || []).map(c => c.name),
    bubble: (u.bubbleCards || []).map(c => c.name),
    bubbleLen: (u.bubbleCards || []).length,
    bubbleStolen: (u.bubbleCards || []).map(c => !!c.stolenFromUid),
    myDiscard: (u.pileStats?.discard || u.discard || []).map(c => c.name),
    myConsumed: (u.pileStats?.consumed || u.consumed || []).map(c => c.name),
    myDecoy: (u.pileStats?.discard || u.discard || []).filter(c => c._decoy).length,
    foeDiscard: (foe.pileStats?.discard || foe.discard || []).map(c => c.name),
    foeConsumed: (foe.pileStats?.consumed || foe.consumed || []).map(c => c.name),
    locked: !!b.locked,
    pending: !!b.karunaBubble,
    pendingName: b.karunaBubble?.card?.name || "",
    logs: (st.battleLog || []).join(" | "),
  };
})()`;

const playTpl = name => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const card = u.hand.find(c => c.name === ${JSON.stringify(name)});
  if (!card) return false;
  window.BattleSystem.useCard(st, u, card.targetless ? null : b.enemies[0], card);
  return true;
})()`;

const useBubbleTpl = `(() => {
  const st = window.state;
  const ok1 = window.BattleSystem.selectKarunaBubble(st, 0, window.render);
  const ok2 = window.BattleSystem.playSelectedCard(st);
  window.render();
  return { ok1, ok2 };
})()`;

const playAndWait = async (page, name) => {
  await evalT(page, playTpl(name), 15000, `play:${name}`);
  await page.waitForTimeout(700);
  const hung = await evalT(page,
    "!!window.state.battle.karunaBubble || !!window.state.battle.thunderHammer"
    + " || !!window.state.battle.locked || !!window.state.battle.selectedSkillCard",
    8000, `probe:${name}`);
  if (hung !== true) {
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, `whenIdle:${name}`);
  }
  await page.waitForTimeout(300);
  return evalT(page, snapTpl, 15000, `snap:${name}`);
};

const clickBubbleBtn = async (page, sel) => {
  await evalT(page, "window.render()", 15000, "renderBeforeClick");
  await page.waitForSelector(sel, { timeout: 8000 });
  await page.locator(sel).click({ timeout: 8000 });
  await page.waitForTimeout(400);
};

const NORMAL = { name: "偷来普通牌", type: "tactic", suit: "♥", text: "", targetless: true };
const CONSUME = { name: "偷来消耗牌", type: "consume", suit: "♦", text: "", targetless: true };
const OWN = { name: "自己的牌", type: "tactic", suit: "♠", text: "", targetless: true };
const OWN_C = { name: "自己的消耗牌", type: "consume", suit: "♣", text: "", targetless: true };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ---------- A 段：偷来的普通牌 ----------
  if (want("A")) {
    console.log("\n--- A 段：偷来的普通牌 ×（放入 / 泡泡区使用 / 放弃）---");
    await evalT(page, setupTpl([NORMAL], { stolen: true }), 20000, "setupA");
    let s = await playAndWait(page, "偷来普通牌");
    T("A1 偷来的牌打出后进**原主**弃牌堆（归属口径）",
      s.foeDiscard.includes("偷来普通牌"), { foeDiscard: s.foeDiscard, myDiscard: s.myDiscard });
    T("A2 偷来的牌也会询问是否放入泡泡区", s.pending, { pending: s.pendingName });
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    s = await evalT(page, snapTpl, 15000, "snapA");
    T("A3 「放入」后牌进了泡泡区（修复点）", s.bubble.includes("偷来普通牌"),
      { bubble: s.bubble, foeDiscard: s.foeDiscard, myDiscard: s.myDiscard });
    T("A4 「放入」后已从原主弃牌堆摘出（未复制）",
      !s.foeDiscard.includes("偷来普通牌"), { foeDiscard: s.foeDiscard });
    T("A5 泡泡区里只有 1 张（总数守恒）", s.bubbleLen === 1, { bubble: s.bubble });
    T("A6 泡泡区内的牌仍带 stolenFromUid", s.bubbleStolen[0] === true, { st: s.bubbleStolen });

    const r = await evalT(page, useBubbleTpl, 15000, "useBubbleA");
    await page.waitForTimeout(700);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleA");
    s = await evalT(page, snapTpl, 15000, "snapA2");
    T("A7 泡泡区的偷来牌可被选中并使用", r && r.ok1 === true, { r });
    T("A8 用掉后离开泡泡区", !s.bubble.includes("偷来普通牌"), { bubble: s.bubble });
    T("A9 用掉后按归属回原主弃牌堆", s.foeDiscard.includes("偷来普通牌"),
      { foeDiscard: s.foeDiscard, myDiscard: s.myDiscard });
    T("A10 用掉后不再询问「放入」（无循环）", !s.pending, { pending: s.pendingName });

    // A-b：放弃
    await evalT(page, setupTpl([NORMAL], { stolen: true }), 20000, "setupAb");
    s = await playAndWait(page, "偷来普通牌");
    T("A11 打出后进原主弃牌堆", s.foeDiscard.includes("偷来普通牌"), { foeDiscard: s.foeDiscard });
    await clickBubbleBtn(page, "[data-karuna-bubble-skip]");
    s = await evalT(page, snapTpl, 15000, "snapAb");
    T("A12 「放弃」后留在原主弃牌堆", s.foeDiscard.includes("偷来普通牌"),
      { foeDiscard: s.foeDiscard });
    T("A13 「放弃」后泡泡区为空", s.bubbleLen === 0, { bubble: s.bubble });
  }

  // ---------- B 段：偷来的消耗牌 ----------
  if (want("B")) {
    console.log("\n--- B 段：偷来的消耗牌 ×（放入 / 泡泡区使用）---");
    await evalT(page, setupTpl([CONSUME], { stolen: true }), 20000, "setupB");
    let s = await playAndWait(page, "偷来消耗牌");
    T("B1 偷来的消耗牌打出后进**原主**消耗区",
      s.foeConsumed.includes("偷来消耗牌"), { foeConsumed: s.foeConsumed, myConsumed: s.myConsumed });
    T("B2 也会询问是否放入泡泡区", s.pending, { pending: s.pendingName });
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    s = await evalT(page, snapTpl, 15000, "snapB");
    T("B3 「放入」后从原主消耗区摘出、进泡泡区（修复点）",
      s.bubble.includes("偷来消耗牌") && !s.foeConsumed.includes("偷来消耗牌"),
      { bubble: s.bubble, foeConsumed: s.foeConsumed });
    const r = await evalT(page, useBubbleTpl, 15000, "useBubbleB");
    await page.waitForTimeout(700);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleB");
    s = await evalT(page, snapTpl, 15000, "snapB2");
    T("B4 泡泡区使用后真正被消耗", r && r.ok1 === true, { r });
    T("B5 用掉后按归属回原主消耗区", s.foeConsumed.includes("偷来消耗牌"),
      { foeConsumed: s.foeConsumed, myConsumed: s.myConsumed });
    T("B6 用掉后离开泡泡区", !s.bubble.includes("偷来消耗牌"), { bubble: s.bubble });
  }

  // ---------- C 段：对照 —— 自己的牌仍走自己牌堆 ----------
  if (want("C")) {
    console.log("\n--- C 段：对照（非偷来的牌，归属不变）---");
    await evalT(page, setupTpl([OWN]), 20000, "setupC");
    let s = await playAndWait(page, "自己的牌");
    T("C1 自己的牌打出后进自己弃牌堆", s.myDiscard.includes("自己的牌"),
      { myDiscard: s.myDiscard, foeDiscard: s.foeDiscard });
    T("C2 不会跑到原主（无 stolenFromUid 即无原主）弃牌堆",
      !s.foeDiscard.includes("自己的牌"), { foeDiscard: s.foeDiscard });
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    s = await evalT(page, snapTpl, 15000, "snapC");
    T("C3 「放入」后进泡泡区", s.bubble.includes("自己的牌"), { bubble: s.bubble });
    T("C4 「放入」后从自己弃牌堆摘出", !s.myDiscard.includes("自己的牌"),
      { myDiscard: s.myDiscard });

    await evalT(page, setupTpl([OWN_C]), 20000, "setupC2");
    s = await playAndWait(page, "自己的消耗牌");
    T("C5 自己的消耗牌进自己消耗区", s.myConsumed.includes("自己的消耗牌"),
      { myConsumed: s.myConsumed });
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    s = await evalT(page, snapTpl, 15000, "snapC3");
    T("C6 自己的消耗牌「放入」后进泡泡区", s.bubble.includes("自己的消耗牌"),
      { bubble: s.bubble });
  }

  // ---------- D 段：归属兜底（原主已不在场）----------
  if (want("D")) {
    console.log("\n--- D 段：原主不在场时回落自己牌堆 ---");
    await evalT(page, setupTpl([NORMAL], { ghostUid: true }), 20000, "setupD");
    let s = await playAndWait(page, "偷来普通牌");
    T("D1 原主不在场时牌进自己弃牌堆", s.myDiscard.includes("偷来普通牌"),
      { myDiscard: s.myDiscard, foeDiscard: s.foeDiscard });
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    s = await evalT(page, snapTpl, 15000, "snapD");
    T("D2 仍能「放入」泡泡区（兜底不丢机会）", s.bubble.includes("偷来普通牌"),
      { bubble: s.bubble });
    T("D3 放入后自己弃牌堆已摘出", !s.myDiscard.includes("偷来普通牌"),
      { myDiscard: s.myDiscard });
  }

  // ---------- E 段：防误摘（自己弃牌堆有同名同花色诱饵）----------
  if (want("E")) {
    console.log("\n--- E 段：防误摘同名同花色牌 ---");
    await evalT(page, setupTpl([NORMAL], { stolen: true, decoy: true }), 20000, "setupE");
    let s = await playAndWait(page, "偷来普通牌");
    T("E1 偷来的牌进原主弃牌堆", s.foeDiscard.includes("偷来普通牌"),
      { foeDiscard: s.foeDiscard });
    T("E2 自己弃牌堆里确实有一张同名同花色诱饵", s.myDecoy === 1, { decoy: s.myDecoy });
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    s = await evalT(page, snapTpl, 15000, "snapE");
    T("E3 「放入」后进泡泡区", s.bubble.includes("偷来普通牌"), { bubble: s.bubble });
    T("E4 摘走的是原主那张（诱饵仍在自己弃牌堆）", s.myDecoy === 1,
      { decoy: s.myDecoy, myDiscard: s.myDiscard });
    T("E5 原主弃牌堆已空（总数守恒，未凭空 +1）",
      !s.foeDiscard.includes("偷来普通牌"), { foeDiscard: s.foeDiscard });
  }

  const rel = relevantErrors(errors);
  T("无 JS 运行时错误", rel.length === 0, rel.slice(0, 3));

  await browser.close();
  console.log(`\n结果 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
