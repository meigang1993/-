// 安倍卡露娜【记忆泡泡】完整行为矩阵 严格检查：
//   横轴 = 操作（放入 / 放弃 / 泡泡区里使用）
//   纵轴 = 牌种（消耗牌 consume / 非消耗牌 tactic）
//
//   M 段：消耗牌 —— 打出即进消耗区；「放入」把它从消耗区摘出（此时未被消耗，
//         仍可再用一次）；「放弃」留在消耗区（已消耗）；泡泡区里使用后真正被消耗。
//   N 段：非消耗牌 —— 打出进弃牌堆；「放入」搬进泡泡区；「放弃」留在弃牌堆；
//         泡泡区里使用后回弃牌堆。
//   E 段：只有实体牌才触发记忆泡泡（虚拟牌/技能牌/状态牌不询问放入）。
//
// 分批：KARUNA_MX=M|N|E，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KARUNA_MX || "ALL").toUpperCase();
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

// cards: 交给 setup 的手牌定义（数组，元素为 {name,type,extra}）
const setupTpl = cards => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.karunaBubblePending; delete b.thunderHammer;
  delete b.selectedSkillCard;
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
  u.hand = ${JSON.stringify(cards)};
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
    hand: (u.hand || []).map(c => c.name),
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
  // 泡泡「询问放入」会挂起战斗（locked=true），此时 whenIdle 不会 resolve，
  // 直接等会白白超时 8s 并刷一条误导性告警。先探一次：已挂起就跳过等待。
  const hung = await evalT(page,
    "!!window.state.battle.karunaBubble || !!window.state.battle.thunderHammer"
    + " || !!window.state.battle.locked || !!window.state.battle.selectedSkillCard",
    8000, `probe:${name}`);
  // 注：E 段构造的假技能牌（generatedBySkill）没有真实效果，打出后会留在
  // animQueue 里无人消费，whenIdle 等不到 → 会刷一条 8s 超时告警。
  // 这是测试桩的问题、不是产品问题；已有超时兜底，不会挂死，断言不受影响。
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

const CONSUME_CARD = { name: "泡泡消耗牌", type: "consume", suit: "♦", text: "", targetless: true };
const NORMAL_CARD = { name: "泡泡普通牌", type: "tactic", suit: "♥", text: "", targetless: true };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ---------- M 段：消耗牌 ×（放入 / 放弃 / 泡泡区使用） ----------
  if (want("M")) {
    console.log("\n--- M 段：消耗牌矩阵 ---");
    // M-a：放入
    await evalT(page, setupTpl([CONSUME_CARD, NORMAL_CARD]), 20000, "setupMa");
    let s = await playAndWait(page, "泡泡消耗牌");
    T("M1 消耗牌打出后进了消耗区", s.consumed.includes("泡泡消耗牌"),
      { consumed: s.consumed, discard: s.discard });
    T("M2 消耗牌也会询问是否放入泡泡区", s.pending, { pending: s.pendingName });
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    s = await evalT(page, snapTpl, 15000, "snapMa");
    T("M3 「放入」后已搬出消耗区（此时未被消耗）",
      !s.consumed.includes("泡泡消耗牌"), { consumed: s.consumed });
    T("M4 「放入」后牌在泡泡区，仍可再用一次", s.bubble.includes("泡泡消耗牌"),
      { bubble: s.bubble });
    const r = await evalT(page, useBubbleTpl, 15000, "useBubbleMa");
    await page.waitForTimeout(700);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleMa");
    s = await evalT(page, snapTpl, 15000, "snapMa3");
    T("M5 泡泡区的消耗牌可被选中并使用", r && r.ok1 === true, { r });
    T("M6 泡泡区使用后真正被消耗（进消耗区）", s.consumed.includes("泡泡消耗牌"),
      { consumed: s.consumed, discard: s.discard });
    T("M7 泡泡区使用后离开泡泡区（不残留）", !s.bubble.includes("泡泡消耗牌"),
      { bubble: s.bubble });
    T("M8 用掉后不再询问「放入」（无无限循环）", !s.pending, { pending: s.pendingName });

    // M-b：放弃
    await evalT(page, setupTpl([CONSUME_CARD, NORMAL_CARD]), 20000, "setupMb");
    s = await playAndWait(page, "泡泡消耗牌");
    T("M9 打出后进消耗区", s.consumed.includes("泡泡消耗牌"), { consumed: s.consumed });
    await clickBubbleBtn(page, "[data-karuna-bubble-skip]");
    s = await evalT(page, snapTpl, 15000, "snapMb");
    T("M10 「放弃」后留在消耗区（已消耗）", s.consumed.includes("泡泡消耗牌"),
      { consumed: s.consumed });
    T("M11 「放弃」后泡泡区为空", s.bubbleLen === 0, { bubble: s.bubble });
    T("M12 「放弃」后手牌里也没有该牌", !s.hand.includes("泡泡消耗牌"), { hand: s.hand });
  }

  // ---------- N 段：非消耗牌 ×（放入 / 放弃 / 泡泡区使用） ----------
  if (want("N")) {
    console.log("\n--- N 段：非消耗牌矩阵 ---");
    // N-a：放入
    await evalT(page, setupTpl([NORMAL_CARD, CONSUME_CARD]), 20000, "setupNa");
    let s = await playAndWait(page, "泡泡普通牌");
    T("N1 普通牌打出后进了弃牌堆", s.discard.includes("泡泡普通牌"),
      { discard: s.discard, consumed: s.consumed });
    T("N2 普通牌询问是否放入泡泡区", s.pending, { pending: s.pendingName });
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    s = await evalT(page, snapTpl, 15000, "snapNa");
    T("N3 「放入」后已搬出弃牌堆（未被消耗）", !s.discard.includes("泡泡普通牌"),
      { discard: s.discard });
    T("N4 「放入」后牌在泡泡区", s.bubble.includes("泡泡普通牌"), { bubble: s.bubble });
    const r = await evalT(page, useBubbleTpl, 15000, "useBubbleNa");
    await page.waitForTimeout(700);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleNa");
    s = await evalT(page, snapTpl, 15000, "snapNa3");
    T("N5 泡泡区的普通牌可被选中并使用", r && r.ok1 === true, { r });
    T("N6 用掉后回弃牌堆（不是消耗区）", s.discard.includes("泡泡普通牌")
      && !s.consumed.includes("泡泡普通牌"), { discard: s.discard, consumed: s.consumed });
    T("N7 用掉后离开泡泡区", !s.bubble.includes("泡泡普通牌"), { bubble: s.bubble });
    T("N8 用掉后不再询问「放入」", !s.pending, { pending: s.pendingName });

    // N-b：放弃
    await evalT(page, setupTpl([NORMAL_CARD, CONSUME_CARD]), 20000, "setupNb");
    s = await playAndWait(page, "泡泡普通牌");
    T("N9 打出后进弃牌堆", s.discard.includes("泡泡普通牌"), { discard: s.discard });
    await clickBubbleBtn(page, "[data-karuna-bubble-skip]");
    s = await evalT(page, snapTpl, 15000, "snapNb");
    T("N10 「放弃」后留在弃牌堆", s.discard.includes("泡泡普通牌"), { discard: s.discard });
    T("N11 「放弃」后泡泡区为空", s.bubbleLen === 0, { bubble: s.bubble });
    T("N12 「放弃」后手牌里也没有该牌", !s.hand.includes("泡泡普通牌"), { hand: s.hand });
  }

  // ---------- E 段：只有实体牌才触发 ----------
  if (want("E")) {
    console.log("\n--- E 段：实体牌限制 ---");
    const VIRTUAL = { name: "虚拟牌", type: "tactic", suit: "♠", text: "", targetless: true, virtual: true };
        const SKILLC = { name: "技能牌", type: "tactic", suit: "♣", text: "", targetless: true, generatedBySkill: "测试技能" };
    await evalT(page, setupTpl([VIRTUAL, NORMAL_CARD]), 20000, "setupE1");
    let s = await playAndWait(page, "虚拟牌");
    T("E1 虚拟牌不询问放入泡泡区", !s.pending, { pending: s.pendingName });
    T("E2 虚拟牌打出后战斗未锁定", !s.locked, { locked: s.locked });
    T("E3 虚拟牌未进泡泡区", s.bubbleLen === 0, { bubble: s.bubble });

    await evalT(page, setupTpl([SKILLC, NORMAL_CARD]), 20000, "setupE2");
    s = await playAndWait(page, "技能牌");
    T("E4 技能牌不询问放入泡泡区", !s.pending, { pending: s.pendingName });
    T("E5 技能牌未进泡泡区", s.bubbleLen === 0, { bubble: s.bubble });

    // 正对照：实体牌仍会触发
    await evalT(page, setupTpl([NORMAL_CARD, CONSUME_CARD]), 20000, "setupE3");
    s = await playAndWait(page, "泡泡普通牌");
    T("E6 实体牌仍正常触发（正对照）", s.pending, { pending: s.pendingName });
  }

  await browser.close();
  const rel = relevantErrors(errors);
  T("无相关 JS 错误", rel.length === 0, { errors: rel.slice(0, 3) });
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
