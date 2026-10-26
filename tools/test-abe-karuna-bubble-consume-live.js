// 安倍卡露娜【记忆泡泡】× 消耗牌 严格检查（语义已改：消耗牌**允许**存入，用时才被消耗）
//   A 段：type="consume" 的牌结算后进消耗区（播放烧牌），「放入」把它从消耗区摘进泡泡区，
//         此时牌**未被消耗**；两处都不得同时存在（复制牌防线仍在）。
//   B 段：从泡泡区使用该牌 → 真正被消耗（进消耗区），泡泡区清空，且不再询问「放入」（无循环）。
//   C 段：「放弃」放入 → 牌留在消耗区（已消耗），泡泡区为空。
//   D 段：void 牌（put 时强制转 consumed）同样可存入。
//   E 段：回合结束清空 —— 普通牌进弃牌堆、消耗牌被消耗，均不得复制。
//
// 分批：KARUNA_BC=A|B|C|D|E，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KARUNA_BC || "ALL").toUpperCase();
const want = p => PART === "ALL" || PART.includes(p);

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
    { name: "消耗音符", type: "consume", suit: "♦", text: "", targetless: true },
    { name: "普通牌", type: "tactic", suit: "♥", text: "", targetless: true },
    { name: "虚空牌", type: "tactic", suit: "♠", text: "", targetless: true, void: true },
  ];
  b.activeUid = u.uid;
  b.selectedCardIndex = -1;
  b.enemies.forEach(e => {
    e.hp = e.maxHp = 90; e.block = 0; e.statuses = [];
    e.hand = []; e.noResponse = true;
  });
  st.log = []; st.battleLog = [];
  window.render();
  return { foes: b.enemies.length, hand: u.hand.length };
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

const endTurnTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  window.AbeKarunaBubbleSkills.endTurn(st, u);
  window.render();
  return true;
})()`;

const playAndWait = async (page, name) => {
  await evalT(page, playTpl(name), 15000, `play:${name}`);
  await page.waitForTimeout(700);
  await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, `whenIdle:${name}`);
  await page.waitForTimeout(300);
  return evalT(page, snapTpl, 15000, `snap:${name}`);
};

// 挂起时 whenIdle 可能不 resolve（battle.locked），故点击前显式 render 并等按钮出现。
const clickBtn = async (page, sel) => {
  // 反向验证时按钮可能压根不出现（如消耗牌被排除），此时不能让整轮崩掉，
  // 否则后面的断言一条都跑不到，看不出撤掉改动的影响范围。
  try {
    await evalT(page, "window.render()", 15000, `renderBefore:${sel}`);
    await page.waitForSelector(sel, { timeout: 8000 });
    await page.locator(sel).click({ timeout: 8000 });
    await page.waitForTimeout(400);
  } catch (e) {
    console.log(`⚠️  clickBtn ${sel}: ${e.message.split("\n")[0]}`);
  }
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);
  await evalT(page, setupTpl, 20000, "setup");

  // ---------- A 段：消耗牌可存入，放入时未被消耗 ----------
  if (want("A")) {
    console.log("\n--- A 段：type=consume 的牌存入泡泡区 ---");
    const s1 = await playAndWait(page, "消耗音符");
    T("A1 消耗牌结算后进消耗区（而非弃牌堆）",
      s1.consumed.includes("消耗音符") && !s1.discard.includes("消耗音符"),
      { consumed: s1.consumed, discard: s1.discard });
    T("A2 询问放入泡泡手牌区", s1.pending && s1.pendingName === "消耗音符",
      { pending: s1.pendingName });
    await clickBtn(page, "[data-karuna-bubble-store]");
    const s2 = await evalT(page, snapTpl, 15000, "snapA2");
    T("A3 放入后泡泡区有该牌", s2.bubble.includes("消耗音符"), { bubble: s2.bubble });
    T("A4 放入后消耗区已移除该牌（无复制）", !s2.consumed.includes("消耗音符"),
      { consumed: s2.consumed });
    T("A5 全牌总数守恒：消耗区+弃牌堆+泡泡区=1 张",
      s2.consumed.filter(n => n === "消耗音符").length
        + s2.discard.filter(n => n === "消耗音符").length
        + s2.bubble.filter(n => n === "消耗音符").length === 1,
      { consumed: s2.consumed, discard: s2.discard, bubble: s2.bubble });
    T("A6 日志有「存入泡泡手牌区」", /存入泡泡手牌区/.test(s2.logs || ""),
      { logs: (s2.logs || "").slice(-160) });
    T("A7 战斗已解锁", !s2.locked, { locked: s2.locked });

    // ---------- B 段：从泡泡区使用 → 真正被消耗 ----------
    console.log("\n--- B 段：从泡泡区使用消耗牌 ---");
    const r = await evalT(page, useBubbleTpl, 15000, "useBubble");
    T("B1 泡泡区第 0 张可被选中并使用", r && r.ok1 && r.ok2, { r });
    await page.waitForTimeout(700);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdle:useBubble");
    const s3 = await evalT(page, snapTpl, 15000, "snapB");
    T("B2 使用后该牌进了消耗区（被消耗）", s3.consumed.includes("消耗音符"),
      { consumed: s3.consumed });
    T("B3 泡泡区已清空", s3.bubbleLen === 0, { bubble: s3.bubble });
    T("B4 不再询问「放入」（无无限循环）", !s3.pending, { pending: s3.pendingName });
    T("B5 全牌总数守恒：仍只有 1 张",
      s3.consumed.filter(n => n === "消耗音符").length
        + s3.discard.filter(n => n === "消耗音符").length
        + s3.bubble.filter(n => n === "消耗音符").length === 1,
      { consumed: s3.consumed, discard: s3.discard, bubble: s3.bubble });
    T("B6 未落进弃牌堆（消耗牌不洗回牌库）", !s3.discard.includes("消耗音符"),
      { discard: s3.discard });
  }

  // ---------- C 段：放弃放入 → 已消耗 ----------
  if (want("C")) {
    console.log("\n--- C 段：放弃放入消耗牌 ---");
    await evalT(page, setupTpl, 20000, "setupC");
    const s1 = await playAndWait(page, "消耗音符");
    T("C1 询问放入", s1.pending, { pending: s1.pendingName });
    await clickBtn(page, "[data-karuna-bubble-skip]");
    const s2 = await evalT(page, snapTpl, 15000, "snapC2");
    T("C2 牌仍在消耗区（已消耗）", s2.consumed.includes("消耗音符"),
      { consumed: s2.consumed });
    T("C3 泡泡区为空", s2.bubbleLen === 0, { bubble: s2.bubble });
    T("C4 不在手牌里", !s2.hand.includes("消耗音符"), { hand: s2.hand });
    T("C5 日志有「放弃发动」", /放弃发动记忆泡泡/.test(s2.logs || ""),
      { logs: (s2.logs || "").slice(-120) });
  }

  // ---------- D 段：void 牌同样可存入 ----------
  if (want("D")) {
    console.log("\n--- D 段：void 牌 ---");
    await evalT(page, setupTpl, 20000, "setupD");
    const s1 = await playAndWait(page, "虚空牌");
    T("D1 void 牌进了消耗区", s1.consumed.includes("虚空牌"),
      { consumed: s1.consumed, discard: s1.discard });
    T("D2 询问放入", s1.pending && s1.pendingName === "虚空牌",
      { pending: s1.pendingName });
    await clickBtn(page, "[data-karuna-bubble-store]");
    const s2 = await evalT(page, snapTpl, 15000, "snapD2");
    T("D3 放入后进了泡泡区", s2.bubble.includes("虚空牌"), { bubble: s2.bubble });
    T("D4 消耗区已移除（无复制）", !s2.consumed.includes("虚空牌"),
      { consumed: s2.consumed });
  }

  // ---------- E 段：回合结束清空 —— 普通牌进弃牌堆、消耗牌被消耗 ----------
  if (want("E")) {
    console.log("\n--- E 段：回合结束清空泡泡区 ---");
    await evalT(page, setupTpl, 20000, "setupE");
    await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      u.bubbleCards = [
        { name: "泡泡普通牌", type: "tactic", suit: "♥", text: "", targetless: true },
        { name: "泡泡消耗牌", type: "consume", suit: "♦", text: "", targetless: true },
      ];
      window.render();
      return true;
    })()`, 15000, "fillBubbleE");
    await evalT(page, endTurnTpl, 15000, "endTurnE");
    const s = await evalT(page, snapTpl, 15000, "snapE");
    T("E1 泡泡区已清空", s.bubbleLen === 0, { bubble: s.bubble });
    T("E2 普通牌进了弃牌堆", s.discard.includes("泡泡普通牌"), { discard: s.discard });
    T("E3 消耗牌进了消耗区（未被洗回牌库）", s.consumed.includes("泡泡消耗牌"),
      { consumed: s.consumed });
    T("E4 消耗牌不在弃牌堆", !s.discard.includes("泡泡消耗牌"), { discard: s.discard });
    T("E5 普通牌不在消耗区", !s.consumed.includes("泡泡普通牌"), { consumed: s.consumed });
    T("E6 日志同时写明进弃牌堆与被消耗",
      /进入弃牌堆/.test(s.logs || "") && /被消耗/.test(s.logs || ""),
      { logs: (s.logs || "").slice(-200) });
  }

  const rel = relevantErrors(errors);
  T("页面无 JS 错误", rel.length === 0, { errs: rel.slice(0, 3) });

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
