// 战报条目 `_destinationSide` / `_destinationPile` 归属字段 直接断言。
//
// 背景：BattleCombatTrail.snapshot 从 battle-combat.js 拆出后，既有三个 trail
// 测试（response-verb / exit-once / duel-relic）断言的都是【闪】这类响应牌的
// 战报，而响应牌走另一条记录通道，压根不经过 snapshot —— 对本次拆分恒绿。
// response-verb 已补 action/by 断言；本文件补**归属字段**的直接断言，
// 覆盖偷牌场景（原主侧）与消耗牌场景（consumed）。
//
//   A 段：偷来的普通牌 —— 我方打出，但归属仍是原主（敌人）侧 → enemy / discard
//   B 段：对照 —— 自己的普通牌 → ally / discard
//   C 段：偷来的消耗牌 → enemy / consumed
//   D 段：兜底 —— stolenFromUid 指向不在场单位时回落 actor.side → ally
//   E 段：防空转 —— played 数组非空，且牌确实落进了原主弃牌堆
//
// 分批：TRAIL_DS=A|B|C|D|E，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.TRAIL_DS || "ALL").toUpperCase();
const want = p => PART === "ALL" || PART === p;

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` +
    (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
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

// stolen: 手牌带 stolenFromUid（敌人 uid）｜ghostUid: 指向不在场单位
const setupTpl = (cards, opts = {}) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  const u = b.allies[0], foe = b.enemies[0];
  u.name = "测试我方";
  u.stats = { attack: 2, magic: 2, speed: 5, maxHp: 50, bloodlust: 1, handLimit: 3 };
  u.hp = u.maxHp = 50; u.block = 0; u.intent = 1;
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
  b.played = [];
  b.activeUid = u.uid;
  b.selectedCardIndex = -1;
  st.log = []; st.battleLog = [];
  window.render();
  return { hand: u.hand.length, foeUid: foe.uid };
})()`;

// 只读战报条目（played[0] 即本次出牌的 trail 快照）
const snapTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0], foe = b.enemies[0];
  const e = (b.played || [])[0];
  return {
    playedLen: (b.played || []).length,
    entry: e ? {
      name: e.name,
      side: e._destinationSide ?? null,
      pile: e._destinationPile ?? null,
      by: e._playedByName ?? null,
      action: e._playedAction ?? null,
    } : null,
    myDiscard: (u.pileStats?.discard || u.discard || []).map(c => c.name),
    myConsumed: (u.pileStats?.consumed || u.consumed || []).map(c => c.name),
    foeDiscard: (foe.pileStats?.discard || foe.discard || []).map(c => c.name),
    foeConsumed: (foe.pileStats?.consumed || foe.consumed || []).map(c => c.name),
    locked: !!b.locked,
  };
})()`;

const playTpl = name => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const card = u.hand.find(c => c.name === ${JSON.stringify(name)});
  if (!card) return false;
  window.BattleSystem.useCard(st, u, card.targetless ? null : b.enemies[0], card);
  return true;
})()`;

const playAndWait = async (page, name) => {
  const ok = await evalT(page, playTpl(name), 15000, `play:${name}`);
  if (ok !== true) console.log(`⚠️  play:${name} 未找到牌`);
  await page.waitForTimeout(700);
  await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, `whenIdle:${name}`);
  await page.waitForTimeout(300);
  return evalT(page, snapTpl, 15000, `snap:${name}`);
};

const NORMAL = { name: "归属普通牌", type: "tactic", suit: "♥", text: "", targetless: true };
const CONSUME = { name: "归属消耗牌", type: "consume", suit: "♦", text: "", targetless: true };

(async () => {
  const browser = await chromium.launch();

  // ---- A 段：偷来的普通牌 → 原主（敌人）侧 ----
  if (want("A")) {
    console.log("\n===== A 段：偷来的普通牌（归属应为 enemy / discard）=====");
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = collectErrors(page);
    await openGame(page);
    await startRegressionBattle(page);
    await evalT(page, setupTpl([NORMAL], { stolen: true }), 15000, "setup:A");
    const s = await playAndWait(page, NORMAL.name);
    T("A0 战报条目存在（非空转）", !!s?.entry, { playedLen: s?.playedLen });
    T("A1 归属侧 = enemy（原主）", s?.entry?.side === "enemy",
      { side: s?.entry?.side });
    T("A2 归属堆 = discard", s?.entry?.pile === "discard", { pile: s?.entry?.pile });
    T("A3 记录者仍是我方（未把 by 改成原主）", s?.entry?.by === "测试我方",
      { by: s?.entry?.by });
    T("A4 牌确实落进原主弃牌堆", (s?.foeDiscard || []).includes(NORMAL.name),
      { foeDiscard: s?.foeDiscard, myDiscard: s?.myDiscard });
    T("A5 未残留锁定", s?.locked === false, { locked: s?.locked });
    T("A6 无 JS 错误", relevantErrors(errors).length === 0, errors.slice(0, 2));
    await page.close();
  }

  // ---- B 段：对照 —— 自己的普通牌 ----
  if (want("B")) {
    console.log("\n===== B 段：自己的普通牌（归属应为 ally / discard）=====");
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = collectErrors(page);
    await openGame(page);
    await startRegressionBattle(page);
    await evalT(page, setupTpl([NORMAL]), 15000, "setup:B");
    const s = await playAndWait(page, NORMAL.name);
    T("B0 战报条目存在（非空转）", !!s?.entry, { playedLen: s?.playedLen });
    T("B1 归属侧 = ally", s?.entry?.side === "ally", { side: s?.entry?.side });
    T("B2 归属堆 = discard", s?.entry?.pile === "discard", { pile: s?.entry?.pile });
    T("B3 牌进自己弃牌堆（不是原主）", (s?.myDiscard || []).includes(NORMAL.name)
      && !(s?.foeDiscard || []).includes(NORMAL.name),
      { myDiscard: s?.myDiscard, foeDiscard: s?.foeDiscard });
    T("B4 无 JS 错误", relevantErrors(errors).length === 0, errors.slice(0, 2));
    await page.close();
  }

  // ---- C 段：偷来的消耗牌 → consumed ----
  if (want("C")) {
    console.log("\n===== C 段：偷来的消耗牌（归属应为 enemy / consumed）=====");
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = collectErrors(page);
    await openGame(page);
    await startRegressionBattle(page);
    await evalT(page, setupTpl([CONSUME], { stolen: true }), 15000, "setup:C");
    const s = await playAndWait(page, CONSUME.name);
    T("C0 战报条目存在（非空转）", !!s?.entry, { playedLen: s?.playedLen });
    T("C1 归属堆 = consumed", s?.entry?.pile === "consumed", { pile: s?.entry?.pile });
    T("C2 归属侧 = enemy（原主）", s?.entry?.side === "enemy",
      { side: s?.entry?.side });
    T("C3 牌落进原主消耗区", (s?.foeConsumed || []).includes(CONSUME.name),
      { foeConsumed: s?.foeConsumed, myConsumed: s?.myConsumed });
    T("C4 无 JS 错误", relevantErrors(errors).length === 0, errors.slice(0, 2));
    await page.close();
  }

  // ---- D 段：兜底 —— 原主不在场 → 回落 actor.side ----
  if (want("D")) {
    console.log("\n===== D 段：原主不在场（应回落 ally）=====");
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = collectErrors(page);
    await openGame(page);
    await startRegressionBattle(page);
    await evalT(page, setupTpl([NORMAL], { ghostUid: true }), 15000, "setup:D");
    const s = await playAndWait(page, NORMAL.name);
    T("D0 战报条目存在（非空转）", !!s?.entry, { playedLen: s?.playedLen });
    T("D1 原主不在场时回落 = ally", s?.entry?.side === "ally",
      { side: s?.entry?.side });
    T("D2 归属堆 = discard", s?.entry?.pile === "discard", { pile: s?.entry?.pile });
    T("D3 无 JS 错误", relevantErrors(errors).length === 0, errors.slice(0, 2));
    await page.close();
  }

  // ---- E 段：防空转 —— 撤空 played 后必须检出 ----
  if (want("E")) {
    console.log("\n===== E 段：防空转（强制清空 played 后 A1 必须变红）=====");
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await openGame(page);
    await startRegressionBattle(page);
    await evalT(page, setupTpl([NORMAL], { stolen: true }), 15000, "setup:E");
    await evalT(page, playTpl(NORMAL.name), 15000, "play:E");
    await page.waitForTimeout(700);
    // 人为抹掉归属字段，模拟「拆坏了」
    await evalT(page, `(() => {
      const e = (window.state.battle.played || [])[0];
      if (e) { delete e._destinationSide; delete e._destinationPile; }
      return true;
    })()`, 8000, "strip:E");
    const s = await evalT(page, snapTpl, 15000, "snap:E");
    T("E1 抹掉字段后 side 检出为 null（断言非空转）", s?.entry?.side === null,
      { side: s?.entry?.side });
    T("E2 抹掉字段后 pile 检出为 null（断言非空转）", s?.entry?.pile === null,
      { pile: s?.entry?.pile });
    await page.close();
  }

  await browser.close();
  console.log(`\n汇总：${pass} 通过 / ${total - pass} 失败`);
  process.exit(total - pass ? 1 : 0);
})();
