const { test, expect } = require("@playwright/test");
const {
  openGame, startFreshGame,
} = require("./helpers/preview-game");

test("dismissing battle dialogue and cancelling prompts do not save", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.evaluate(() => {
    window.__uiSaveCalls = [];
    window.GameStore.save = async (_state, options = {}) => { window.__uiSaveCalls.push({ ...options }); };
    window.state.battle.speech = { global: true, text: "临时对白", dismissible: true };
    window.render();
  });
  await page.locator("[data-dismiss-speech]").dispatchEvent("click");
  await expect.poll(() => page.evaluate(() => window.state.battle.speech)).toBe(null);
  await page.locator("[data-retreat]").click();
  await page.locator("[data-confirm-cancel]").click();
  expect(await page.evaluate(() => window.__uiSaveCalls)).toEqual([]);
});

test("save status updates do not rebuild the active scene", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  const result = await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const originalHall = window.GameUI.hall;
    const originalStatus = window.GameStore.status;
    let hallCalls = 0;
    window.GameUI.hall = (...args) => {
      hallCalls += 1;
      return originalHall(...args);
    };
    window.GameStore.status = () => ({ ...originalStatus(), syncing: true });
    try {
      window.dispatchEvent(new Event("game-store-status"));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {
        hallCalls,
        statusText: document.getElementById("save-status")?.textContent || "",
      };
    } finally {
      window.GameUI.hall = originalHall;
      window.GameStore.status = originalStatus;
    }
  });
  expect(result.hallCalls).toBe(0);
  expect(result.statusText).toBe("");
});

test("cloud syncing does not render a banner or move the scene", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  const result = await page.evaluate(async () => {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const before = {
      topbar: document.querySelector(".topbar").getBoundingClientRect().height,
      main: document.getElementById("main").getBoundingClientRect().top,
    };
    const originalStatus = window.GameStore.status;
    window.GameStore.status = () => ({ ...originalStatus(), syncing: true });
    window.dispatchEvent(new Event("game-store-status"));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = {
      topbar: document.querySelector(".topbar").getBoundingClientRect().height,
      main: document.getElementById("main").getBoundingClientRect().top,
    };
    window.GameStore.status = originalStatus;
    return {
      before,
      after,
      warningCount: document.querySelectorAll(
        "#save-status .save-warning",
      ).length,
    };
  });
  expect(result.after.topbar).toBeCloseTo(result.before.topbar, 4);
  expect(result.after.main).toBeCloseTo(result.before.main, 4);
  expect(result.warningCount).toBe(0);
});
