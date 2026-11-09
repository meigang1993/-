// 【魅力改造】触发弃牌时「手牌能否真实点击」实机严格检查
//   A 全链路真实鼠标点击：逐张点手牌 -> discardPick 累加 -> 点确认弃置 -> 结算
//   B 反向：未挂起/禁用弃牌入口时点手牌不会误弃
//   C 联动：男性人数改变上限 -> 需要弃置张数跟着变（2 男 vs 1 男）
//   D 反向：运行时禁用 BattleSystem.discardCard 后 A 段核心断言必须变红
// 支持 NOA_CLICK=A,B,C,D 分批；REVERT=discard 时做反向。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startFreshGame, dismissOpeningStory, collectErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SEGS = (process.env.NOA_CLICK || "A,B,C,D").split(",").filter(Boolean);
const REVERT = process.env.REVERT || "";
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

async function boot(browser, allies) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await page.locator("[data-open-butler]").waitFor({ state: "visible", timeout: 30000 });
  await page.evaluate(list => {
    const st = window.state;
    const c = st.chars.find(x => x.id === "noa");
    if (c) { c.locked = false; c.level = 10; }
    st.view = "hall";
    st.testAllies = list;
    st.testEnemies = [0];
    st.hallModal = "testBattle";
    st.settings = st.settings || {};
    st.settings.battleSpeed = 2;
    window.render?.();
  }, allies);
  await page.locator("[data-start-test-battle]").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("[data-start-test-battle]").evaluate(el => el.click());
  await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 30000 });
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

// 构造出牌阶段开始 + 超额手牌，并真实调用 balanceHand（不直接改 UI 状态）。
async function setup(page, handCount) {
  return page.evaluate(n => {
    const b = window.state.battle;
    const noa = b.allies.find(u => u.ref === "noa");
    b.activeUid = noa.uid;
    b.locked = false; b.handReveal = null;
    b.noaCharmDiscard = null; b.discardPick = null;
    Object.defineProperty(b, "phase", {
      configurable: true, enumerable: true, get: () => 4, set: () => {},
    });
    noa.hand = Array.from({ length: n }, (_, i) => ({
      name: "试牌" + i, type: "tactic", suit: "♠",
    }));
    const limit = window.NoaSideEffectSkills.handLimit(noa);
    window.NoaCharmSkills.balanceHand(window.state, noa, () => {}, { onlySelf: true });
    window.render?.();
    return { limit, need: b.noaCharmDiscard?.need || 0, hand: noa.hand.length };
  }, handCount);
}

const snap = page => page.evaluate(() => {
  const b = window.state.battle;
  const noa = b.allies.find(u => u.ref === "noa");
  const cards = [...document.querySelectorAll("[data-card-index]")];
  const confirm = document.querySelector("[data-confirm-discard]");
  return {
    picks: [...(b.discardPick?.indexes || [])],
    need: b.noaCharmDiscard?.need || 0,
    hand: noa.hand.map(c => c.name),
    cardCount: cards.length,
    discardable: cards.filter(c => c.classList.contains("discardable")).length,
    disabledClass: cards.filter(c => c.classList.contains("disabled")).length,
    pointerNone: cards.filter(c => getComputedStyle(c).pointerEvents === "none").length,
    selectedClass: cards.filter(c => c.classList.contains("selected")).length,
    confirmExists: !!confirm,
    confirmDisabled: confirm ? confirm.disabled : null,
    tip: document.querySelector(".discard-prompt")?.textContent || "",
    label: document.querySelector(".hand-phase-label")?.textContent || "",
    phase: b.phase,
    logs: (window.state.battleLog || []).join(" | "),
  };
});

// 真实鼠标点击一张手牌（不是 el.click()，也不是直调产品 API）
async function realClickCard(page, idx) {
  const loc = page.locator(`[data-card-index="${idx}"]`).first();
  await loc.click({ timeout: 8000 });
  await page.waitForTimeout(120);
}

async function segA(browser) {
  const { page, errors } = await boot(browser, ["noa", "lokar"]);
  try {
    const s0 = await setup(page, 8);
    T("A0 场景：1 名存活男性，上限 5，手牌 8 -> need=3",
      s0.limit === 5 && s0.need === 3 && s0.hand === 8, s0);
    await page.waitForTimeout(200);
    const a1 = await snap(page);
    T("A1 手牌区渲染 8 张且全部可点（discardable、无 disabled、pointer-events 非 none）",
      a1.cardCount === 8 && a1.discardable === 8 && a1.disabledClass === 0
      && a1.pointerNone === 0, a1);
    T("A2 显示魅力改造弃牌提示 + 未选够时确认按钮禁用",
      a1.tip.includes("魅力改造") && a1.confirmDisabled === true, a1);
    T("A3 仍在出牌阶段（弃牌不切到结束阶段）", a1.phase === 4, a1);

    // 逐张真实点击：0（首）、3（中间）、7（末尾），验证任意位置都能选
    for (const idx of [0, 3, 7]) await realClickCard(page, idx);
    await page.waitForFunction(() =>
      (window.state.battle.discardPick?.indexes || []).length === 3, null, { timeout: 8000 });
    const a4 = await snap(page);
    T("A4 真实点击首/中/末 3 张后 discardPick=[0,3,7]",
      [0, 3, 7].every(i => a4.picks.includes(i)) && a4.picks.length === 3, a4);
    T("A5 选中态渲染、手牌未减少、确认按钮已可用",
      a4.selectedClass === 3 && a4.hand.length === 8 && a4.confirmDisabled === false, a4);

    // 再点一次第 0 张应取消选中（弃牌阶段同款 toggle）
    await realClickCard(page, 0);
    const a6 = await snap(page);
    T("A6 再次真实点击可取消选中（toggle 生效）", !a6.picks.includes(0), a6);
    await realClickCard(page, 0);
    await page.waitForFunction(() =>
      (window.state.battle.discardPick?.indexes || []).length === 3, null, { timeout: 8000 });

    // 真实点击确认弃置
    await page.locator("[data-confirm-discard]").click({ timeout: 8000 });
    await page.waitForFunction(() => !window.state.battle.noaCharmDiscard, null, { timeout: 8000 });
    await page.waitForTimeout(150);
    const a7 = await snap(page);
    T("A7 确认后弃的是玩家真实点选的 3 张，末尾「试牌7」已离手",
      !a7.hand.includes("试牌0") && !a7.hand.includes("试牌3")
      && !a7.hand.includes("试牌7") && a7.hand.includes("试牌1"), a7.hand);
    T("A8 手牌回到上限 5、挂起清除、仍在出牌阶段",
      a7.hand.length === 5 && a7.need === 0 && a7.phase === 4, a7);
    T("A9 走弃牌阶段同款「一次性弃置」结算（不进结束阶段）",
      a7.logs.includes("一次性弃置"), { logs: a7.logs.slice(-200) });
    T("A10 无 JS 错误", errors.length === 0, errors.slice(0, 3));
  } finally { await page.close(); }
}

async function segB(browser) {
  const { page, errors } = await boot(browser, ["noa", "lokar"]);
  try {
    await setup(page, 8);
    await page.evaluate(() => { window.state.battle.noaCharmDiscard = null; window.render?.(); });
    await page.waitForTimeout(150);
    const b0 = await snap(page);
    T("B0 无挂起时确认弃置按钮不出现", !b0.confirmExists, b0);
    await realClickCard(page, 0);
    const b1 = await snap(page);
    T("B1 无挂起时点手牌走选牌（不产生 discardPick、不弃牌）",
      b1.picks.length === 0 && b1.hand.length === 8, b1);
    T("B2 无 JS 错误", errors.length === 0, errors.slice(0, 3));
  } finally { await page.close(); }
}

async function segC(browser) {
  const { page, errors } = await boot(browser, ["noa", "lokar"]);
  try {
    // 加一名存活男性队友 -> 上限 5 -> 6，同样 8 张手牌只需弃 2 张
    await page.evaluate(() => {
      const b = window.state.battle;
      const base = b.allies[1];
      b.allies.push({
        uid: "extra_male", ref: "extra_male", name: "额外男性", gender: "male",
        hp: 50, maxHp: 130, side: "ally", hand: [],
        stats: { attack: 6, magic: 4, speed: 8, maxHp: 130, bloodlust: 1, handLimit: 20 },
        skills: [],
      });
      void base;
    });
    const s = await setup(page, 8);
    T("C1 2 名存活男性 -> 上限 6 -> 同样 8 张只需弃 2 张",
      s.limit === 6 && s.need === 2, s);
    await page.waitForTimeout(150);
    const c2 = await snap(page);
    T("C2 提示与确认按钮按 need=2 渲染", c2.tip.includes("选择2张")
      && c2.confirmDisabled === true, c2);
    await realClickCard(page, 1);
    await realClickCard(page, 6);
    await page.waitForFunction(() =>
      (window.state.battle.discardPick?.indexes || []).length === 2, null, { timeout: 8000 });
    const c3 = await snap(page);
    T("C3 选 2 张后确认按钮可用（人数联动真实生效）", c3.confirmDisabled === false, c3);
    T("C4 无 JS 错误", errors.length === 0, errors.slice(0, 3));
  } finally { await page.close(); }
}

async function segD(browser) {
  const { page } = await boot(browser, ["noa", "lokar"]);
  try {
    await setup(page, 8);
    await page.evaluate(() => { window.BattleSystem.discardCard = () => false; });
    await page.waitForTimeout(150);
    for (const idx of [0, 3, 7]) await realClickCard(page, idx);
    const d = await snap(page);
    T("D1 反向：禁用弃牌入口后真实点击不产生 discardPick（A4 会红）",
      d.picks.length === 0 && d.hand.length === 8, d);
    T("D2 反向：确认按钮仍禁用（A5 会红）", d.confirmDisabled === true, d);
  } finally { await page.close(); }
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const seg of SEGS) {
      if (seg === "A") await segA(browser);
      if (seg === "B") await segB(browser);
      if (seg === "C") await segC(browser);
      if (seg === "D") await segD(browser);
    }
  } finally { await browser.close(); }
  console.log(`\nRESULT ${pass}/${total}${REVERT ? " REVERT=" + REVERT : ""}`);
  if (pass !== total) process.exit(1);
})();
