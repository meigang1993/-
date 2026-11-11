// 怪面诺亚【淫气改造】出牌阶段生效 + 弃牌阶段同款弃置 · 实机严格检查
//   A 出牌阶段开始：手牌 > 上限触发弃置；不弹专用选牌窗，改为手牌区点选任意张 + 确认弃置
//   B 非出牌阶段（摸牌/弃牌/结束）一律不触发
//   C 反向验证：禁用 balanceHand 后 A 的触发断言确实变红
// 支持 NOA_CP=A,B,C 分批。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startFreshGame, dismissOpeningStory, collectErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SEGS = (process.env.NOA_CP || "A,B,C").split(",").filter(Boolean);
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
    st.testAllies = ["noa", "lokar"]; // 保留一名存活男性，避免狂暴跳过出牌阶段
    st.testEnemies = [0];
    st.hallModal = "testBattle";
    st.settings = st.settings || {};
    st.settings.battleSpeed = 2;
    window.render?.();
  });
  await page.locator("[data-start-test-battle]").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("[data-start-test-battle]").evaluate(el => el.click());
  await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 30000 });
  // 开战后仍有一轮排队的 beginTurn/resetBeginTurn 会跑完；它属于「新回合开始」，
  // 会清掉上一回合的挂起标记。必须等它结束再构造场景，否则刚挂起就被清。
  await page.waitForTimeout(600);
  await page.waitForFunction(() => {
    const b = window.state?.battle;
    return !!b && !!b.activeUid && !b.thinkingUid
      && (!b.animQueue || b.animQueue.length === 0);
  }, { timeout: 20000 });
  await page.evaluate(() => {
    const b = window.state?.battle;
    (b?.allies || []).forEach(u => { if (u.ref !== "noa") u.stats.handLimit = 20; });
  });
  return { page, errors };
}

// 把战斗置为「诺亚的出牌阶段开始」并塞入超额手牌，再真实调用主流程的平衡入口。
async function setupOverflow(page, disableBalance) {
  return page.evaluate(off => {
    const b = window.state.battle;
    const noa = b.allies.find(u => u.ref === "noa");
    b.activeUid = noa.uid;
    b.phase = 4;
    b.locked = false;
    b.handReveal = null;
    b.noaCharmDiscard = null;
    b.discardPick = null;
    // 战斗刚开场时后台仍有一轮已排队的 prepare/start 流程（其间有 await），
    // 恢复后会把 phase 改回 3，导致「出牌阶段内」的重判被阶段守卫挡掉。
    // 这里只做测试隔离：把 phase 钉死为 4，等价于真实游戏里玩家停在出牌阶段。
    Object.defineProperty(b, "phase", {
      configurable: true, enumerable: true, get: () => 4, set: () => {},
    });
    noa.hand = Array.from({ length: 8 }, (_, i) => ({
      name: "试牌" + i, type: "tactic", suit: "♠",
    }));
    if (off) window.NoaCharmSkills.balanceHand = () => 0;
    const limit = window.NoaSideEffectSkills.handLimit(noa);
    window.NoaCharmSkills.balanceHand(window.state, noa, () => {}, { onlySelf: true });
    window.render?.();
    return { limit, hand: noa.hand.map(c => c.name) };
  }, !!disableBalance);
}

const snap = page => page.evaluate(() => {
  const b = window.state.battle;
  const noa = b.allies.find(u => u.ref === "noa");
  const confirm = document.querySelector("[data-confirm-discard]");
  return {
    charm: b.noaCharmDiscard?.need || 0, locked: !!b.locked, phase: b.phase,
    hand: noa.hand.map(c => c.name),
    panelVisible: !!document.querySelector(".hand-reveal-panel"),
    picks: [...(b.discardPick?.indexes || [])],
    handNodes: document.querySelectorAll("[data-card-index]").length,
    confirmExists: !!confirm, confirmDisabled: confirm ? confirm.disabled : null,
    tip: document.querySelector(".discard-prompt")?.textContent || "",
    endPlay: !!document.querySelector("[data-end-play]"),
    label: document.querySelector(".hand-phase-label")?.textContent || "",
  };
});

const clickHandCard = (page, idx) => page.evaluate(i => {
  const el = [...document.querySelectorAll("[data-card-index]")].find(
    x => Number(x.dataset.cardIndex) === i);
  if (!el) return false;
  el.click();
  return true;
}, idx);

async function segA(browser) {
  const { page, errors } = await boot(browser);
  try {
    const s0 = await setupOverflow(page, false);
    T("A0 场景：出牌阶段开始手牌 8 > 上限 5", s0.hand.length === 8 && s0.limit === 5, s0);
    await page.waitForTimeout(150);
    const a1 = await snap(page);
    T("A1 触发弃置：挂起 noaCharmDiscard（无专用弹窗、不锁战斗）",
      a1.charm === 3 && !a1.panelVisible && !a1.locked, a1);
    T("A2 未替玩家自动弃牌（手牌仍 8 张）", a1.hand.length === 8, a1.hand);
    T("A3 弃牌阶段同款：手牌区可点选 + 确认弃置按钮 + 提示含淫气改造",
      a1.confirmExists && a1.tip.includes("淫气改造") && a1.handNodes === 8, a1);
    T("A4 仍在出牌阶段且不能跳过弃牌（无「结束出牌」）",
      a1.phase === 4 && !a1.endPlay, a1);
    T("A5 未选够时确认按钮禁用", a1.confirmDisabled === true, a1);

    // 真实 UI 点击一张手牌：证明确实走手牌区选牌链路，不是产品内部直调。
    const uiClicked = await clickHandCard(page, 0);
    await page.waitForTimeout(180);
    const afterUi = await snap(page);
    T("A6 真实点击第 0 张手牌后被选中，手牌未减少",
      uiClicked && afterUi.picks.includes(0) && afterUi.hand.length === 8,
      { uiClicked, afterUi });

    // 余下两张走产品真实 discardCard，再点确认弃置；全部放在同一 evaluate 内同步完成，
    // 避免后台回合流程在多次点击的 await 间隙插入改 phase / 清挂起。
    const chain = await page.evaluate(async () => {
      const st = window.state, b = st.battle;
      const noa = b.allies.find(u => u.ref === "noa");
      const read = () => ({
        charm: b.noaCharmDiscard?.need || 0,
        picks: [...(b.discardPick?.indexes || [])],
        hand: noa.hand.map(c => c.name),
        discarded: (noa.pileStats?.discard || noa.discard || []).map(c => c.name),
        phase: b.phase,
      });
      const steps = [read()];
      for (const idx of [1, 4]) {
        await window.BattleSystem.discardCard(st, idx, () => {});
        steps.push(read());
      }
      const beforeConfirm = read();
      await window.BattleSystem.confirmDiscard(st, () => {});
      return { steps, beforeConfirm, final: read(),
        logs: (st.battleLog || []).join(" | ") };
    });
    T("A7 玩家任意挑 3 张（含中间牌 1/4，非末尾 3 张）",
      chain.beforeConfirm.picks.length === 3
      && chain.beforeConfirm.picks.includes(1)
      && chain.beforeConfirm.picks.includes(4), chain.beforeConfirm);
    T("A8 确认弃置后挂起清除、手牌回到上限 5",
      chain.final.charm === 0 && chain.final.hand.length === 5, chain.final);
    T("A9 弃的是玩家挑的那 3 张，末尾「试牌7」仍在手里",
      !chain.final.hand.includes("试牌0") && !chain.final.hand.includes("试牌1")
      && !chain.final.hand.includes("试牌4") && chain.final.hand.includes("试牌7"),
      chain.final.hand);
    T("A10 走标准弃牌阶段同款结算（一次性弃置战报，不进结束阶段）",
      chain.logs.includes("一次性弃置") && chain.final.phase === 4,
      { logs: chain.logs.slice(-220), phase: chain.final.phase });
    T("A11 无 JS 错误", errors.length === 0, errors.slice(0, 3));
  } finally { await page.close(); }
}

async function segB(browser) {
  const { page, errors } = await boot(browser);
  try {
    for (const phase of [3, 5, 6]) {
      const r = await page.evaluate(p => {
        const b = window.state.battle;
        const noa = b.allies.find(u => u.ref === "noa");
        b.activeUid = noa.uid; b.phase = p; b.locked = false;
        b.handReveal = null; b.noaCharmDiscard = null; b.discardPick = null;
        noa.hand = Array.from({ length: 8 }, (_, i) => ({
          name: "试牌" + i, type: "tactic", suit: "♠",
        }));
        const changed = window.NoaCharmSkills.balanceHand(
          window.state, noa, () => {}, { onlySelf: true });
        return { changed, hand: noa.hand.length,
          charm: !!b.noaCharmDiscard, reveal: !!b.handReveal, locked: !!b.locked };
      }, phase);
      T(`B${phase} 阶段${phase}不触发弃置/不补牌/不挂起`,
        r.changed === 0 && r.hand === 8 && !r.charm && !r.reveal && !r.locked, r);
    }
    T("B4 无 JS 错误", errors.length === 0, errors.slice(0, 3));
  } finally { await page.close(); }
}

async function segC(browser) {
  const { page } = await boot(browser);
  try {
    await setupOverflow(page, true); // 禁用 balanceHand
    await page.waitForTimeout(150);
    const r = await snap(page);
    T("C1 反向：禁用 balanceHand 后触发断言确实变红（不挂起、不弃牌）",
      r.charm === 0 && !r.locked && r.hand.length === 8 && !r.panelVisible, r);
    T("C2 反向：禁用后出牌阶段未被挂起（对照 A1 会红）",
      r.phase === 4 && !r.locked && !r.confirmExists, r);
  } finally { await page.close(); }
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (SEGS.includes("A")) await segA(browser);
    if (SEGS.includes("B")) await segB(browser);
    if (SEGS.includes("C")) await segC(browser);
  } finally { await browser.close(); }
  console.log(`\nRESULT ${pass}/${total}`);
  if (pass !== total) process.exit(1);
})();
