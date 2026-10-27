// 安倍卡露娜【记忆泡泡】× 偷来的敌方【杀】—— 免杀意标记残留检查：
//
//   A 段：偷来的杀牌打出 → 进原主（敌人）弃牌堆 → 「放入」进泡泡区 →
//         从泡泡区使用时确实免杀意（intent 未扣）。
//   B 段：用掉后，牌按归属进**原主**弃牌堆 —— 关键：_bubbleFree / _bubbleCast
//         是否已清除？偷牌走 put() 归属路由，与自己的牌不是同一条路径，
//         必须单独验，不能靠"自己的牌已验过"推断。
//   C 段：回收后再打出必须正常扣杀意（标记若残留会错误免杀意）。
//   D 段：对照 —— 非偷来的杀牌走自己弃牌堆，同样应清除。
//   E 段：反向验证 —— 撤掉离区清除，B/C 必须变红（证明断言非空转）。
//
// 分批：KARUNA_SF=A|B|C|D，不设则跑 A~D。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KARUNA_SF || "ALL").toUpperCase();
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

const setupTpl = (cards, opts = {}) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.karunaBubblePending; delete b.thunderHammer;
  delete b.selectedSkillCard; delete b.selectedTarget;
  const u = b.allies[0], foe = b.enemies[0];
  u.name = "安倍卡露娜"; u.ref = "abe_karuna"; u.id = "abe_karuna";
  u.gender = "female";
  u.stats = { attack: 2, magic: 4, speed: 3, maxHp: 50, bloodlust: 1, handLimit: 3 };
  u.hp = u.maxHp = 50; u.block = 0; u.intent = 2;
  u.skills = [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }];
  delete u.bubbleCards; delete u.karunaLastColor; delete u.karunaLastSuit;
  u.pileStats = u.pileStats || {};
  u.pileStats.discard = []; u.pileStats.consumed = [];
  u.discard = u.pileStats.discard; u.consumed = u.pileStats.consumed;
  b.enemies.forEach(e => {
    e.hp = e.maxHp = 90; e.block = 0; e.statuses = [];
    e.hand = []; e.noResponse = true; e.intent = 2;
    e.pileStats = e.pileStats || {};
    e.pileStats.discard = []; e.pileStats.consumed = [];
    e.discard = e.pileStats.discard; e.consumed = e.pileStats.consumed;
  });
  const hand = ${JSON.stringify(cards)};
  ${opts.stolen ? "hand.forEach(c => { c.stolenFromUid = foe.uid; });" : ""}
  u.hand = hand;
  b.activeUid = u.uid;
  b.selectedCardIndex = -1;
  st.log = []; st.battleLog = [];
  window.render();
  return { hand: u.hand.length, foeUid: foe.uid };
})()`;

// 重点：把原主弃牌堆里那张牌的免杀意标记也快照出来
const snapTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0], foe = b.enemies[0];
  const fd = (foe.pileStats?.discard || foe.discard || []);
  const md = (u.pileStats?.discard || u.discard || []);
  const mark = c => ({ n: c.name, s: c.suit || "", free: !!c._bubbleFree,
                       cast: !!c._bubbleCast, stolen: !!c.stolenFromUid });
  return {
    intent: u.intent,
    hand: (u.hand || []).map(c => c.name),
    bubble: (u.bubbleCards || []).map(c => c.name),
    bubbleLen: (u.bubbleCards || []).length,
    myDiscard: md.map(c => c.name),
    myMarks: md.map(mark),
    foeDiscard: fd.map(c => c.name),
    foeMarks: fd.map(mark),
    locked: !!b.locked,
    pending: !!b.karunaBubble,
    logs: (st.battleLog || []).join(" | "),
  };
})()`;

const playTpl = name => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const card = u.hand.find(c => c.name === ${JSON.stringify(name)});
  if (!card) return false;
  window.BattleSystem.useCard(st, u, b.enemies[0], card);
  return true;
})()`;

// 泡泡区使用杀牌：全程真实点击（点泡泡牌选中 → 点敌人指定目标 → 点确认）
// 必须真实点击：直接改 battle.selectedTarget 后调 playSelectedCard 打不出去
// （牌会留在泡泡区，于是"intent 未扣"恒真、断言空转）。
const useBubbleKill = async (page) => {
  await evalT(page, "window.render()", 15000, "renderBubble");
  await page.waitForTimeout(600);
  await page.click('[data-bubble-index="0"]')
    .catch(e => console.log(`⚠️ click bubble: ${e.message}`));
  await page.waitForTimeout(400);
  const picked = await evalT(page, "!!window.state.battle.selectedSkillCard",
    15000, "pickedProbe");
  const foeUid = await evalT(page, "window.state.battle.enemies[0].uid",
    15000, "foeUid");
  await page.click(`[data-target="${foeUid}"]`)
    .catch(e => console.log(`⚠️ click enemy: ${e.message}`));
  await page.waitForTimeout(500);
  if (await page.locator("[data-confirm-target]").count()) {
    await page.click("[data-confirm-target]").catch(() => {});
    await page.waitForTimeout(400);
  }
  await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleBK");
  await page.waitForTimeout(300);
  return { ok1: picked === true };
};

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

// 把原主弃牌堆里的牌捞回手牌，再打出，看是否错误免杀意
const recycleAndPlayTpl = (name, suit) => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0], foe = b.enemies[0];
  const fd = (foe.pileStats?.discard || foe.discard || []);
  const md = (u.pileStats?.discard || u.discard || []);
  const hit = c => c.name === ${JSON.stringify(name)} && (c.suit || "") === ${JSON.stringify(suit || "")};
  let pile = fd, at = fd.findIndex(hit);
  if (at < 0) { pile = md; at = md.findIndex(hit); }
  if (at < 0) return { found: false };
  const card = pile.splice(at, 1)[0];
  const before = u.intent;
  u.hand.push(card);
  window.BattleSystem.useCard(st, u, b.enemies[0], card);
  return { found: true, before, after: u.intent, free: !!card._bubbleFree };
})()`;

// 牌名必须真叫「杀」：杀意消耗判定认牌名，用假名会导致"没扣杀意"恒真、
// 免杀意断言全部空转（已实测确认）。偷来的与自己的用花色区分。
const KILL    = { name: "杀", type: "kill", suit: "♦", text: "", targetless: false };
const OWNKILL = { name: "杀", type: "kill", suit: "♠", text: "", targetless: false };
const K_SUIT = "♦", O_SUIT = "♠";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ---------- A 段：偷来的杀牌 → 放入 → 泡泡区使用，免杀意应生效 ----------
  if (want("A")) {
    console.log("\n--- A 段：偷来的杀牌放入泡泡区并使用（免杀意应生效）---");
    await evalT(page, setupTpl([KILL], { stolen: true }), 20000, "setupA");
    let s = await playAndWait(page, "杀");
    T("A1 偷来的杀牌打出后进原主弃牌堆", s.foeDiscard.includes("杀"),
      { foe: s.foeDiscard, my: s.myDiscard });
    T("A2 询问是否放入泡泡区", s.pending, { pending: s.pending });
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    s = await evalT(page, snapTpl, 15000, "snapA1");
    T("A3 已进泡泡区", s.bubble.includes("杀"), { bubble: s.bubble });
    T("A4 已从原主弃牌堆摘出", !s.foeDiscard.includes("杀"), { foe: s.foeDiscard });

    const before = s.intent;
    const r = await useBubbleKill(page);
    s = await evalT(page, snapTpl, 15000, "snapA2");
    T("A5 泡泡区的偷来杀牌可被真实点选", r && r.ok1 === true, { r });
    T("A6 泡泡区的杀牌确已打出（离区，否则 A7 恒真）",
      s.bubbleLen === 0, { bubble: s.bubble });
    T("A7 泡泡区使用时免杀意（intent 未扣；牌名为真「杀」否则恒真）",
      s.intent === before, { before, after: s.intent });
  }

  // ---------- B 段：用掉后原主弃牌堆里的标记 ----------
  if (want("B")) {
    console.log("\n--- B 段：用掉后进原主弃牌堆，免杀意标记是否已清除 ---");
    let s = await evalT(page, snapTpl, 15000, "snapB");
    const m = (s.foeMarks || []).find(x => x.n === "杀" && x.s === K_SUIT);
    T("B1 用掉后按归属回原主弃牌堆", !!m, { foeMarks: s.foeMarks });
    T("B2 原主弃牌堆的牌已无 _bubbleFree（关键）", m && m.free === false, { m });
    T("B3 原主弃牌堆的牌已无 _bubbleCast", m && m.cast === false, { m });
    T("B4 用掉后已离开泡泡区", s.bubbleLen === 0, { bubble: s.bubble });
    T("B5 用掉后不再询问放入（无循环）", !s.pending, { pending: s.pending });
  }

  // ---------- C 段：回收后再打出必须扣杀意 ----------
  if (want("C")) {
    console.log("\n--- C 段：回收后再打出必须正常扣杀意 ---");
    const r = await evalT(page, recycleAndPlayTpl("杀", K_SUIT), 15000, "recycleC");
    await page.waitForTimeout(700);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleC");
    T("C1 回收成功（在原主弃牌堆找到该牌）", r && r.found === true, { r });
    T("C2 回收时牌上已无免杀意标记", r && r.free === false, { r });
    T("C3 再打出正常消耗杀意（未错误免杀意）",
      r && r.after === r.before - 1, { r });
  }

  // ---------- D 段：对照，非偷来的杀牌 ----------
  if (want("D")) {
    console.log("\n--- D 段：对照 —— 自己的杀牌同样应清除 ---");
    await evalT(page, setupTpl([OWNKILL]), 20000, "setupD");
    let s = await playAndWait(page, "杀");
    T("D1 自己的杀牌进自己弃牌堆", s.myDiscard.includes("杀"), { my: s.myDiscard });
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    const before = (await evalT(page, snapTpl, 15000, "snapD1")).intent;
    await useBubbleKill(page);
    s = await evalT(page, snapTpl, 15000, "snapD2");
    const md = (s.myMarks || []).find(x => x.n === "杀" && x.s === O_SUIT);
    T("D2 泡泡区的杀牌确已打出（离区，否则 D3 恒真）",
      s.bubbleLen === 0, { bubble: s.bubble });
    T("D3 泡泡区使用时免杀意", s.intent === before, { before, after: s.intent });
    T("D4 进弃牌堆后已无 _bubbleFree", md && md.free === false, { md });
    T("D5 进弃牌堆后已无 _bubbleCast", md && md.cast === false, { md });
  }

  const rel = relevantErrors(errors);
  T("无 JS 运行错误", rel.length === 0, { rel: rel.slice(0, 3) });

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
