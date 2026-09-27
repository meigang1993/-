// 新手引导首战锁定与状态牌计数回归（浏览器）
// 覆盖：
//   1. 首战仅罗卡尔出战，贝丝妲魔偶不入场
//   2. 状态牌不记入手牌上限（countsForLimit / visibleHand / discardNeed / 回合结束后仍在手）
//   3. 首战失败后引导不消失（不 completed、不 skipped，回退到 hall，大厅仍显示目标卡片）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};
const flag = page => page.evaluate(() => JSON.parse(JSON.stringify(
  window.state?.flags?.onboarding || null)));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await openGame(page);
  await startFreshGame(page);

  // ---------- 进入首战 ----------
  await page.locator("[data-open-modal='team']").click();
  await page.locator(".difficulty-card").first().waitFor({ state: "visible" });
  await page.locator("[data-start='machine_factory'][data-difficulty='normal']").first().click();
  await page.locator(".map-node").first().waitFor({ state: "visible" });
  await page.locator(".onboarding-recommend").first().click();
  await page.locator(".battle-screen").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => !!window.state?.battle);

  const allies = await page.evaluate(() =>
    window.state.battle.allies.map(a => ({ id: a.ref, name: a.name })));
  T("首战仅罗卡尔一人出战", allies.length === 1 && allies[0].id === "lokar", allies);
  T("首战魔偶未入场", !allies.some(a => a.id === "besta_doll"), allies);

  await page.waitForFunction(() => {
    const b = window.state?.battle;
    return !!b && !!b.activeUid && b.phase === 4 && !b.locked;
  }, null, { timeout: 25000 });

  // ---------- 状态牌不记入手牌上限 ----------
  // 手牌填满到上限，再额外塞 1 张状态牌（粘液：不会在回合结束自动消耗）
  const setup = await page.evaluate(() => {
    const a = window.state.battle.allies[0];
    const H = window.BattleRuntimeHelpers();
    const limit = a.stats.handLimit;
    const filler = [];
    while (filler.length < limit) filler.push({ name: "杀（普攻）", type: "slash", suit: "♠" });
    const status = window.BattleStatusCards.create("slime");
    delete status._pendingDraw;
    a.hand = [...filler, status];
    window.render();
    return {
      limit,
      handLen: a.hand.length,
      isStatus: window.BattleStatusCards.isStatus(a.hand[a.hand.length - 1]),
      countsForLimit: window.GuestCharacterSkills.countsForLimit(a, a.hand[a.hand.length - 1]),
      visibleHand: H.visibleHand(a),
      discardNeed: H.discardNeed(a),
    };
  });
  T("构造：手牌含 1 张状态牌", setup.isStatus === true, setup);
  T("状态牌 countsForLimit = false", setup.countsForLimit === false, setup);
  T("手牌实际张数 = 上限 + 1", setup.handLen === setup.limit + 1, setup);
  T("visibleHand 不計状态牌（= 上限）", setup.visibleHand === setup.limit, setup);
  T("超出上限不产生弃牌需求", setup.discardNeed === 0, setup);

  // 回合结束推进后，状态牌必须仍在手里（不会被当溢出牌弃掉）
  await page.locator("[data-end-phase]").first().click().catch(() => {});
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => {
    const a = window.state.battle?.allies?.[0];
    if (!a) return { ended: true };
    return {
      ended: false,
      hasStatus: (a.hand || []).some(c => window.BattleStatusCards.isStatus(c)),
      handLen: a.hand.length,
      visibleHand: window.BattleRuntimeHelpers().visibleHand(a),
    };
  });
  T("回合流转后状态牌仍在手（未被当溢出弃掉）",
    after.ended === true || (after.hasStatus === true && after.visibleHand <= setup.limit),
    after);

  // ---------- 首战失败：引导不消失 ----------
  const before = await flag(page);
  T("失败前引导处于 battle 步骤", before && before.step === "battle" && !before.completed, before);

  await page.evaluate(async () => {
    window.state.battle.allies.forEach(a => { a.hp = 0; });
    await window.DungeonSystem.fail(window.state);
  });
  await page.waitForFunction(() => window.state?.view === "hall", null, { timeout: 25000 });
  await page.waitForTimeout(500);
  // 首次全军覆没会弹出贝丝妲与洛基事件面板，先关闭再看大厅引导
  if (await page.locator("[data-close-modal]").count()) {
    await page.locator("[data-close-modal]").first().click().catch(() => {});
    await page.waitForTimeout(400);
  }

  const f = await flag(page);
  T("首战失败后引导未结束（completed=false）", f && f.completed === false, f);
  T("首战失败后引导未被跳过（skipped=false）", f && f.skipped === false, f);
  T("首战失败后步骤回退到 hall", f && f.step === "hall", f);
  T("大厅仍显示首次目标卡片（引导未消失）",
    await page.locator(".hall-first-objective").count() === 1);

  // 失败后重新出征仍能推进引导（证明没有卡死在某一步）
  await page.locator("[data-open-modal='team']").click();
  await page.locator(".difficulty-card").first().waitFor({ state: "visible" });
  const f2 = await flag(page);
  T("失败后可重新推进到 prep", f2 && f2.step === "prep", f2);

  const relevant = errors.filter(t => !/favicon|ResizeObserver loop/.test(t));
  T("页面无 JS 错误", relevant.length === 0, relevant.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("脚本异常:", e.message, e.stack); process.exit(2); });
