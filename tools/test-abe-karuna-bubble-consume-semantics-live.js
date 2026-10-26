// 安倍卡露娜【记忆泡泡】「消耗」语义 严格检查：
//   A 段：普通牌「放入」= 未被消耗 —— 牌被从弃牌堆搬进泡泡区，本回合还能再用一次。
//   B 段：普通牌「放弃」= 已消耗 —— 牌留在弃牌堆，本回合不能再使用。
//   C 段：泡泡区里的【消耗牌】被使用时，是否真的被消耗（进消耗区/播放烧牌），
//         且用完后不再触发「放入」。
//   D 段（对照）：泡泡区里的普通牌用掉后进弃牌堆（不是消耗区）。
//
// 分批：KARUNA_CS=A|B|C|D，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KARUNA_CS || "ALL").toUpperCase();
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

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.karunaBubblePending; delete b.thunderHammer;
  const u = b.allies[0];
  u.name = "安倍卡露娜"; u.ref = "abe_karuna"; u.id = "abe_karuna";
  u.gender = "female";
  u.stats = { attack: 2, magic: 4, speed: 3, maxHp: 50, bloodlust: 1, handLimit: 3 };
  u.hp = u.maxHp = 50; u.block = 0; u.intent = 1;
  u.skills = [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }];
  delete u.bubbleCards; delete u.karunaLastColor; delete u.karunaLastSuit;
  u.pileStats = u.pileStats || {};
  u.pileStats.discard = []; u.pileStats.consumed = [];
  u.discard = u.pileStats.discard; u.consumed = u.pileStats.consumed;
  u.hand = [
    { name: "普通牌", type: "tactic", suit: "♥", text: "", targetless: true },
    { name: "备用牌", type: "tactic", suit: "♣", text: "", targetless: true },
  ];
  b.activeUid = u.uid;
  b.selectedCardIndex = -1;
  b.enemies.forEach(e => {
    e.hp = e.maxHp = 90; e.block = 0; e.statuses = [];
    e.hand = []; e.noResponse = true;
  });
  st.log = []; st.battleLog = [];
  window.render();
  return { hand: u.hand.length };
})()`;

const snapTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  return {
    hand: u.hand.map(c => c.name),
    bubble: (u.bubbleCards || []).map(c => c.name),
    bubbleLen: (u.bubbleCards || []).length,
    discard: (u.pileStats?.discard || u.discard || []).map(c => c.name),
    consumed: (u.pileStats?.consumed || u.consumed || []).map(c => c.name),
    locked: !!b.locked,
    pending: !!b.karunaBubble,
    pendingName: b.karunaBubble?.card?.name || "",
    sel: b.selectedSkillCard?.name || "",
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

// 点击泡泡区第 0 张并就地使用（走真实入口 selectKarunaBubble + playSelectedCard）
const useBubbleTpl = `(() => {
  const st = window.state;
  const ok1 = window.BattleSystem.selectKarunaBubble(st, 0, window.render);
  const ok2 = window.BattleSystem.playSelectedCard(st);
  window.render();
  return { ok1, ok2 };
})()`;

// 直接把一张牌塞进泡泡区（模拟任何绕过 afterCardPlayed 的入区路径）
const forceIntoBubbleTpl = (name, type) => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const card = { name: ${JSON.stringify(name)}, type: ${JSON.stringify(type)}, suit: "♦", text: "", targetless: true };
  u.bubbleCards = [card];
  window.render();
  return { bubble: u.bubbleCards.map(c => c.name) };
})()`;

const playAndWait = async (page, name) => {
  await evalT(page, playTpl(name), 15000, `play:${name}`);
  await page.waitForTimeout(700);
  await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, `whenIdle:${name}`);
  await page.waitForTimeout(300);
  return evalT(page, snapTpl, 15000, `snap:${name}`);
};

const clickBubbleBtn = async (page, sel) => {
  await evalT(page, "window.render()", 15000, "renderBeforeClick");
  await page.waitForSelector(sel, { timeout: 8000 });
  await page.locator(sel).click({ timeout: 8000 });
  await page.waitForTimeout(400);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ---------- A 段：放入 = 未被消耗（可再用一次） ----------
  if (want("A")) {
    console.log("\n--- A 段：「放入」后牌是否未被消耗 ---");
    await evalT(page, setupTpl, 20000, "setupA");
    const s1 = await playAndWait(page, "普通牌");
    T("A1 打出后牌进了弃牌堆（此时已消耗）", s1.discard.includes("普通牌"),
      { discard: s1.discard });
    T("A2 询问是否放入泡泡手牌区", s1.pending, { pending: s1.pendingName });
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    const s2 = await evalT(page, snapTpl, 15000, "snapA2");
    T("A3 放入后牌已搬出弃牌堆", !s2.discard.includes("普通牌"), { discard: s2.discard });
    T("A4 放入后牌在泡泡区（未被消耗，仍可用）", s2.bubble.includes("普通牌"),
      { bubble: s2.bubble });
    T("A5 放入后战斗已解锁", !s2.locked, { locked: s2.locked });
    const r = await evalT(page, useBubbleTpl, 15000, "useBubbleA");
    await page.waitForTimeout(700);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleA");
    const s3 = await evalT(page, snapTpl, 15000, "snapA3");
    T("A6 泡泡区的牌可被选中并使用", r && r.ok1 === true, { r });
    T("A7 用掉后离开泡泡区", !s3.bubble.includes("普通牌"), { bubble: s3.bubble });
    T("A8 用掉后进了弃牌堆（此时才真正消耗）", s3.discard.includes("普通牌"),
      { discard: s3.discard, consumed: s3.consumed });
    T("A9 用掉后不再询问「放入」（无无限循环）", !s3.pending, { pending: s3.pendingName });
  }

  // ---------- B 段：放弃 = 已消耗（留在弃牌堆，不能再使用） ----------
  if (want("B")) {
    console.log("\n--- B 段：「放弃」后牌是否已被消耗 ---");
    await evalT(page, setupTpl, 20000, "setupB");
    const s1 = await playAndWait(page, "普通牌");
    T("B1 打出后牌进了弃牌堆", s1.discard.includes("普通牌"), { discard: s1.discard });
    await clickBubbleBtn(page, "[data-karuna-bubble-skip]");
    const s2 = await evalT(page, snapTpl, 15000, "snapB2");
    T("B2 放弃后牌仍在弃牌堆（已被消耗）", s2.discard.includes("普通牌"),
      { discard: s2.discard });
    T("B3 放弃后泡泡区为空（没有被保留）", s2.bubbleLen === 0, { bubble: s2.bubble });
    T("B4 放弃后手牌里也没有该牌（本回合不能再使用）",
      !s2.hand.includes("普通牌"), { hand: s2.hand });
    T("B5 日志写明放弃发动记忆泡泡", /放弃发动记忆泡泡/.test(s2.logs || ""),
      { logs: (s2.logs || "").slice(-160) });
    T("B6 放弃后战斗已解锁", !s2.locked, { locked: s2.locked });
  }

  // ---------- C 段：泡泡区里的消耗牌使用时是否被消耗 ----------
  if (want("C")) {
    console.log("\n--- C 段：泡泡区内的 type=consume 牌使用时是否进消耗区 ---");
    await evalT(page, setupTpl, 20000, "setupC");
    await evalT(page, forceIntoBubbleTpl("泡泡消耗牌", "consume"), 15000, "forceC");
    const s0 = await evalT(page, snapTpl, 15000, "snapC0");
    T("C1 消耗牌已置入泡泡区", s0.bubble.includes("泡泡消耗牌"), { bubble: s0.bubble });
    const r = await evalT(page, useBubbleTpl, 15000, "useBubbleC");
    await page.waitForTimeout(700);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleC");
    const s1 = await evalT(page, snapTpl, 15000, "snapC1");
    T("C2 泡泡区的消耗牌可被选中并使用", r && r.ok1 === true, { r });
    T("C3 用掉后离开泡泡区", !s1.bubble.includes("泡泡消耗牌"), { bubble: s1.bubble });
    T("C4 用掉后进消耗区（真的被消耗/烧掉）", s1.consumed.includes("泡泡消耗牌"),
      { consumed: s1.consumed, discard: s1.discard });
    T("C5 用掉后没有掉进弃牌堆", !s1.discard.includes("泡泡消耗牌"),
      { discard: s1.discard });
    T("C6 用掉后不再询问「放入」", !s1.pending, { pending: s1.pendingName });
    T("C7 全牌守恒：消耗区+弃牌堆+泡泡区 = 1 张",
      s1.consumed.filter(n => n === "泡泡消耗牌").length
        + s1.discard.filter(n => n === "泡泡消耗牌").length
        + s1.bubble.filter(n => n === "泡泡消耗牌").length === 1,
      { consumed: s1.consumed, discard: s1.discard, bubble: s1.bubble });
  }

  // ---------- D 段（对照）：泡泡区里的普通牌用掉后进弃牌堆 ----------
  if (want("D")) {
    console.log("\n--- D 段（对照）：泡泡区内的普通牌用掉后进弃牌堆 ---");
    await evalT(page, setupTpl, 20000, "setupD");
    await evalT(page, forceIntoBubbleTpl("泡泡普通牌", "tactic"), 15000, "forceD");
    const r = await evalT(page, useBubbleTpl, 15000, "useBubbleD");
    await page.waitForTimeout(700);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleD");
    const s1 = await evalT(page, snapTpl, 15000, "snapD1");
    T("D1 泡泡区的普通牌可被选中并使用", r && r.ok1 === true, { r });
    T("D2 用掉后进弃牌堆", s1.discard.includes("泡泡普通牌"),
      { discard: s1.discard, consumed: s1.consumed });
    T("D3 用掉后没进消耗区（普通牌不该被烧）", !s1.consumed.includes("泡泡普通牌"),
      { consumed: s1.consumed });
    T("D4 用掉后泡泡区已空", s1.bubbleLen === 0, { bubble: s1.bubble });
  }

  const rel = relevantErrors(errors);
  T("页面无 JS 错误", rel.length === 0, { errs: rel.slice(0, 3) });

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
