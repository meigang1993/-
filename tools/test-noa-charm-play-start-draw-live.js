// 【淫气改造】「出牌阶段开始手牌小于上限是否摸齐」实机检查（真实挂点 + 真实 BattleSystem.draw）
//   A 1 名存活男性 → 上限 5，手牌 1 → 补齐到 5，DOM 手牌区同步渲染
//   B 0 名存活男性 → 上限 4，手牌 2 → 补齐到 4
//   C 反向：把 enterPlayPhase 换成「只设 phase」的旧入口 → 不补齐
//   D 按实际摸到数记录：真实页面里替换 draw 只给 2 张（差 3），验证战报写 2 张、
//     不谎报「摸3张」，且不足时确认耗尽即停（draw 恰好 2 次）
//   E 真实牌堆耗尽（deck+discard 清空，走真实 BattleSystem.draw）
//   F 真实封魔（状态牌【封魔】红桃判定 → drawLockedThisTurn）
//   G 真实吸魔邪眼转交（risaEye 标记 → 牌进对方手牌）
//   H 两批摸牌动画是否合成两批：牌堆 2 张、差 3，第二轮空 draw 不新增动画
//   I 反向：禁用 draw 信号后退化成无信号重试
// 支持 NOA_START_LIVE=A,B,...,I 分批。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startFreshGame, dismissOpeningStory, collectErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SEGS = (process.env.NOA_START_LIVE || "A,B,C,D,E,F,G,H,I").split(",").filter(Boolean);
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await page.locator("[data-open-butler]").waitFor({ state: "visible", timeout: 30000 });
  await page.evaluate(() => {
    const st = window.state;
    const c = st.chars.find(x => x.id === "noa");
    if (c) { c.locked = false; c.level = 10; }
    st.view = "hall";
    st.testAllies = ["noa", "lokar"];
    st.testEnemies = [0];
    st.hallModal = "testBattle";
    st.settings = st.settings || {};
    st.settings.battleSpeed = 2;
    window.render?.();
  });
  await page.locator("[data-start-test-battle]").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("[data-start-test-battle]").evaluate(el => el.click());
  await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 30000 });
  await page.waitForTimeout(600);
  await page.waitForFunction(() => {
    const b = window.state?.battle;
    return !!b && !!b.activeUid && !b.thinkingUid
      && (!b.animQueue || b.animQueue.length === 0);
  }, { timeout: 20000 });
  return { page, errors };
}

// 真实构造「出牌阶段开始」：phase 3 + 手牌缺口，再调真实 enterPlayPhase（不是直接调 balanceHand）
async function setup(page, { handCount, maleCount, revert }) {
  return page.evaluate(o => {
    const st = window.state, b = st.battle;
    const noa = b.allies.find(u => u.ref === "noa");
    b.activeUid = noa.uid;
    b.phase = 3;
    b.locked = false;
    b.handReveal = null;
    b.noaCharmDiscard = null;
    b.discardPick = null;
    noa.skipPlayPhase = false;
    const others = b.allies.filter(u => u.ref !== "noa" && u.hp > 0);
    others.forEach((u, i) => { u.gender = i < o.maleCount ? "male" : "female"; });
    noa.hand = Array.from({ length: o.handCount }, (_, i) => ({
      name: "试牌" + i, type: "tactic", suit: "♠",
    }));
    const limit = window.NoaSideEffectSkills.handLimit(noa);
    const before = noa.hand.length;
    const logs = [];
    const origAdd = window.BattleLog?.add;
    if (window.BattleLog) window.BattleLog.add = (s, t) => { logs.push(String(t)); return origAdd?.(s, t); };
    const saved = window.NoaCharmSkills.enterPlayPhase;
    if (o.revert) {
      window.NoaCharmSkills.enterPlayPhase = (s, u, d, cb) => { s.battle.phase = 4; return true; };
    }
    let threw = null;
    let ret;
    try { ret = window.NoaCharmSkills.enterPlayPhase(st, noa, window.BattleSystem.draw); }
    catch (e) { threw = String(e.message); }
    window.NoaCharmSkills.enterPlayPhase = saved;
    if (window.BattleLog) window.BattleLog.add = origAdd;
    const after = noa.hand.length;
    const pending = noa.hand.filter(c => c._pendingDraw).length;
    // 模拟摸牌动画结算（真实流程由 revealPending 消费），让 UI 渲染落位的牌
    noa.hand.forEach(c => { delete c._pendingDraw; });
    window.render?.();
    return {
      limit, before, after, pending, ret, threw, phase: b.phase,
      logs: logs.slice(-5),
      dom: document.querySelectorAll("[data-card-index]").length,
      handNames: noa.hand.map(c => c.name),
    };
  }, { handCount, maleCount, revert });
}

// 真实场景构造：不替换 draw 的实现，只在外面包一层记录返回值信号与调用次数。
// 牌堆/弃牌堆、封魔状态、吸魔邪眼标记都按真实链路设置，走真实 BattleSystem.draw。
async function setupReal(page, opts = {}) {
  return page.evaluate(o => {
    const st = window.state, b = st.battle;
    const noa = b.allies.find(u => u.ref === "noa");
    const risa = o.eye ? (b.enemies.find(u => u.hp > 0) || null) : null;
    b.activeUid = noa.uid;
    b.phase = 3;
    b.locked = false;
    b.handReveal = null;
    b.noaCharmDiscard = null;
    b.discardPick = null;
    b.risaEye = null;
    b.animQueue = [];
    noa.skipPlayPhase = false;
    noa.drawLockedThisTurn = false;
    b.allies.filter(u => u.ref !== "noa" && u.hp > 0).forEach(u => { u.gender = "female"; });
    const deckCard = i => ({ name: "牌堆" + i, type: "tactic", suit: "♠" });
    noa.deck = Array.from({ length: o.deckCount || 0 }, (_, i) => deckCard(i));
    noa.discard = [];
    noa.consumed = [];
    if (noa.pileStats) {
      noa.pileStats.deck = noa.deck;
      noa.pileStats.discard = noa.discard;
      noa.pileStats.consumed = noa.consumed;
    }
    noa.hand = o.sealJudge
      ? [{ name: "封魔", type: "status", seal: true, suit: "♠" }]
      : [{ name: "试牌0", type: "tactic", suit: "♠" }];
    if (o.sealJudge) noa.deck.push({ name: "判定红", type: "tactic", suit: "♥" });
    if (o.eye && risa) {
      risa.hand = [];
      b.risaEye = { ownerUid: risa.uid, targetUid: noa.uid };
      b.phase = 4;
    }
    const logs = [];
    const origAdd = window.BattleLog?.add;
    if (window.BattleLog) window.BattleLog.add = (s, t) => { logs.push(String(t)); return origAdd?.(s, t); };
    const savedSignal = window.BattleDrawFeedback?.signal;
    if (o.noSignal && window.BattleDrawFeedback) window.BattleDrawFeedback.signal = undefined;
    // 真实封魔：【封魔】状态牌 + 红桃判定成功 → drawLockedThisTurn=true
    let judged = null;
    if (o.sealJudge) {
      try { window.BattleStatusCardTriggers?.judgement?.(st, noa); judged = !!noa.drawLockedThisTurn; }
      catch (e) { judged = String(e.message); }
    }
    const savedDraw = window.BattleSystem.draw;
    const calls = [], signals = [], queueLenAfter = [];
    window.BattleSystem.draw = (u, n, bb) => {
      const r = savedDraw(u, n, bb);
      calls.push(n);
      signals.push(r?.drawSignal ? { ...r.drawSignal } : null);
      queueLenAfter.push((bb?.animQueue || []).length);
      return r;
    };
    const before = noa.hand.length;
    let threw = null, ret;
    try { ret = window.NoaCharmSkills.enterPlayPhase(st, noa, window.BattleSystem.draw); }
    catch (e) { threw = String(e.message); }
    window.BattleSystem.draw = savedDraw;
    if (o.noSignal && window.BattleDrawFeedback) window.BattleDrawFeedback.signal = savedSignal;
    if (window.BattleLog) window.BattleLog.add = origAdd;
    const batches = (b.animQueue || []).filter(e => e.type === "drawBatch" || e.type === "drawGroup")
      .map(e => ({ type: e.type, uid: e.uid, count: e.count, cards: (e.cards || []).length }));
    return {
      limit: window.NoaSideEffectSkills.handLimit(noa), before, after: noa.hand.length,
      calls, signals, queueLenAfter, logs, batches, ret, threw, judged,
      locked: !!noa.drawLockedThisTurn,
      risaUid: risa ? risa.uid : null,
      risaHand: risa ? risa.hand.length : null,
    };
  }, opts);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const { page, errors } = await boot(browser);
    if (SEGS.includes("A")) {
      const a = await setup(page, { handCount: 1, maleCount: 1, revert: false });
      T("A1 实机：1 名存活男性 → 上限 5", a.limit === 5, a);
      T("A2 实机：出牌阶段开始手牌 1 → 补齐到 5", a.after === 5 && a.ret === true, a);
      T("A3 实机：补的牌来自真实 BattleSystem.draw（动画占位）", a.pending === 4, a);
      T("A4 实机：战报记录摸 4 张至上限 5", a.logs.some(l => l.includes("摸4张牌至手牌上限5")), a.logs);
      T("A5 实机：phase 进入 4", a.phase === 4, a);
      T("A6 实机：手牌区 DOM 渲染 5 张", a.dom === 5, { dom: a.dom, hand: a.handNames });
      T("A7 实机：无 JS 异常", a.threw === null && errors.length === 0, { threw: a.threw, errors });
    }
    if (SEGS.includes("B")) {
      const b = await setup(page, { handCount: 2, maleCount: 0, revert: false });
      T("B1 实机：0 名存活男性 → 上限 4", b.limit === 4, b);
      T("B2 实机：手牌 2 → 补齐到 4", b.after === 4 && b.pending === 2, b);
      T("B3 实机：手牌区 DOM 渲染 4 张", b.dom === 4, { dom: b.dom });
    }
    if (SEGS.includes("C")) {
      const c = await setup(page, { handCount: 1, maleCount: 1, revert: true });
      T("C1 反向：换成只设 phase 的旧入口 → 不补齐", c.after === 1 && c.phase === 4, c);
      T("C2 反向：也不产生摸牌战报", !c.logs.some(l => l.includes("摸4张")), c.logs);
    }
    if (SEGS.includes("D")) {
      const d = await page.evaluate(() => {
        const st = window.state, b = st.battle;
        const noa = b.allies.find(u => u.ref === "noa");
        b.activeUid = noa.uid;
        b.phase = 4;
        b.locked = false; b.handReveal = null; b.noaCharmDiscard = null; b.discardPick = null;
        noa.skipPlayPhase = false;
        b.allies.filter(u => u.ref !== "noa" && u.hp > 0).forEach(u => { u.gender = "female"; });
        noa.hand = [{ name: "试牌0", type: "tactic", suit: "♠" }];
        const logs = [];
        const origAdd = window.BattleLog?.add;
        if (window.BattleLog) window.BattleLog.add = (s, t) => { logs.push(String(t)); return origAdd?.(s, t); };
        let calls = 0;
        const saved = window.BattleSystem.draw;
        window.BattleSystem.draw = (u, n) => {
          calls++;
          const give = calls === 1 ? Math.min(2, n) : 0;
          for (let i = 0; i < give; i++) u.hand.push({ name: "半补" + i, type: "tactic", suit: "♠" });
        };
        let threw = null;
        try {
          window.NoaCharmSkills.balanceHand(st, noa, window.BattleSystem.draw, { onlySelf: true });
        } catch (e) { threw = String(e.message); }
        window.BattleSystem.draw = saved;
        if (window.BattleLog) window.BattleLog.add = origAdd;
        return {
          hand: noa.hand.length, calls, logs, threw,
          limit: window.NoaSideEffectSkills.handLimit(noa),
        };
      });
      T("D1 实机：上限 4、手牌 1，部分摸到 2 张 → 战报写 2 张、不谎报「摸3张」",
        d.limit === 4 && d.hand === 3
        && d.logs.some(l => l.includes("实际摸到2张牌"))
        && !d.logs.some(l => l.includes("摸3张牌至手牌上限4")), d);
      T("D2 实机：自定义 draw 无信号时确认耗尽（恰好 2 次）", d.calls === 2, d);
      T("D3 实机：无 JS 异常", d.threw === null && errors.length === 0, { threw: d.threw, errors });
    }
    if (SEGS.includes("E")) {
      const e = await setupReal(page, { deckCount: 0 });
      T("E1 真实牌堆耗尽：手牌不变、只 1 轮就确认耗尽",
        e.limit === 4 && e.before === 1 && e.after === 1 && e.calls.length === 1, e);
      T("E2 真实信号：drawn=0 / exhausted=true / locked=false",
        e.signals[0]?.drawn === 0 && e.signals[0]?.exhausted === true
        && e.signals[0]?.locked === false, e.signals);
      T("E3 战报只 1 条淫气改造，含「未能补齐」「牌堆已无可摸的牌」，不写「未摸到牌」",
        e.logs.filter(l => l.includes("淫气改造")).length === 1
        && e.logs.some(l => l.includes("未能补齐"))
        && e.logs.some(l => l.includes("牌堆已无可摸的牌"))
        && !e.logs.some(l => l.includes("未摸到牌")), e.logs);
      T("E4 牌堆空不产生任何 drawBatch 飞牌动画", e.batches.length === 0, e.batches);
      T("E5 无 JS 异常", e.threw === null && errors.length === 0, { threw: e.threw, errors });
    }
    if (SEGS.includes("F")) {
      const f = await setupReal(page, { deckCount: 3, sealJudge: true });
      T("F1 真实封魔判定：红桃成功 → drawLockedThisTurn=true",
        f.judged === true && f.locked === true, { judged: f.judged, locked: f.locked, logs: f.logs.slice(0, 2) });
      T("F2 封魔：draw 只调 1 轮，signal.locked=true",
        f.calls.length === 1 && f.signals[0]?.locked === true, f.signals);
      T("F3 封魔：状态牌判定结算后已消耗（手牌保持 0），战报含「因封魔无法摸牌」且如实写明手牌数",
        f.before === 0 && f.after === 0
        && f.logs.some(l => l.includes("因封魔无法摸牌"))
        && f.logs.some(l => l.includes("手牌0张低于上限4"))
        && !f.logs.some(l => l.includes("摸1张牌至")),
        { before: f.before, after: f.after, logs: f.logs });
      T("F4 封魔不产生 drawBatch 飞牌动画", f.batches.length === 0, f.batches);
    }
    if (SEGS.includes("G")) {
      const g = await setupReal(page, { deckCount: 3, eye: true });
      T("G1 真实吸魔邪眼：牌全进对方手牌，诺亚 0 张到手",
        g.after === 1 && g.risaHand === 3, { after: g.after, risaHand: g.risaHand });
      T("G2 真实信号：drawn=3 / redirected=3 / exhausted=false，只 1 轮即停",
        g.calls.length === 1 && g.signals[0]?.drawn === 3
        && g.signals[0]?.redirected === 3 && g.signals[0]?.exhausted === false, g.signals);
      T("G3 两条战报各司其职：转交一条 + 淫气改造一条，且不重复「吸魔邪眼转交」",
        g.logs.filter(l => l.includes("吸魔邪眼转交")).length === 1
        && g.logs.filter(l => l.includes("淫气改造")).length === 1
        && !g.logs.some(l => l.includes("淫气改造") && l.includes("吸魔邪眼转交")), g.logs);
      T("G4 全日志不出现重复的「未摸到牌」", !g.logs.some(l => l.includes("未摸到牌")), g.logs);
      T("G5 转交动画只有 1 条 drawBatch（uid=对方、count=3）",
        g.batches.length === 1 && g.batches[0].count === 3
        && g.batches[0].uid === g.risaUid, { batches: g.batches, risaUid: g.risaUid });
    }
    if (SEGS.includes("H")) {
      const h = await setupReal(page, { deckCount: 2 });
      T("H1 牌堆只有 2 张：摸 2 张后第二轮确认耗尽，draw 恰好 2 次",
        h.calls.length === 2 && h.calls[0] === 3 && h.calls[1] === 1
        && h.signals[0]?.drawn === 2 && h.signals[1]?.exhausted === true,
        { calls: h.calls, signals: h.signals });
      T("H2 战报按实摸 2 张、仍差 1 张，并写明牌堆已空",
        h.after === 3 && h.logs.some(l => l.includes("实际摸到2张牌"))
        && h.logs.some(l => l.includes("仍差1张"))
        && h.logs.some(l => l.includes("牌堆已无可摸的牌")), h.logs);
      T("H3 两批摸牌动画合成 1 条：第二轮空 draw 不新增动画事件",
        h.batches.length === 1 && h.batches[0].count === 2
        && h.queueLenAfter[0] === h.queueLenAfter[1],
        { batches: h.batches, queueLenAfter: h.queueLenAfter });
      T("H4 无 JS 异常", h.threw === null && errors.length === 0, { threw: h.threw, errors });
    }
    if (SEGS.includes("I")) {
      const i = await setupReal(page, { deckCount: 0, noSignal: true });
      T("I1 反向：禁用 draw 信号后无法确认耗尽，退化为重试一次",
        i.calls.length === 2 && i.after === 1, { calls: i.calls, after: i.after });
      const j = await setupReal(page, { deckCount: 0 });
      T("I2 恢复信号后回到 1 轮即停（防空转守卫）",
        j.calls.length === 1 && j.after === 1, { calls: j.calls, after: j.after });
    }
    console.log(`\nNOA_START_LIVE ${pass}/${total}`);
    if (pass !== total) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})().catch(e => { console.error("FATAL", e); process.exitCode = 2; });
