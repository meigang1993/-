const { test, expect } = require("@playwright/test");
const {
  openGame, startFreshGame,
} = require("./helpers/preview-game");

test("new game confirms before replacing an existing automatic save", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.reload();
  await expect(page.locator("[data-start-game]")).toBeVisible();
  await page.locator("[data-start-game]").click();
  await expect(page.locator(".game-confirm-card")).toContainText("新的进度将覆盖自动存档");
  await page.locator("[data-confirm-cancel]").click();
  await expect(page.locator("[data-start-game]")).toBeVisible();
  await page.locator("[data-start-game]").click();
  await page.locator("[data-confirm-ok]").click();
  await expect(page.locator(".villa-hall")).toBeVisible();
});

test("new game keeps the current state when durable overwrite fails", async ({ page }) => {
  await openGame(page);
  const result = await page.evaluate(async () => {
    const previous = window.state;
    previous.resources.gold = 321;
    window.GameStore.overwrite = async () => {
      const error = new Error("cloud blocked");
      error.code = "SAVE_FAILED";
      throw error;
    };
    await window.createNewGame();
    return {
      sameState: window.state === previous,
      gold: window.state.resources.gold,
      startOpen: window.startOpen,
      message: window.state.log[0],
      dirty: window.GameStore.status().dirty,
    };
  });
  expect(result).toEqual({
    sameState: true,
    gold: 321,
    startOpen: true,
    message: "新游戏保存失败，原进度未被替换。请检查网络后重试。",
    dirty: false,
  });
  await expect(page.locator("[data-start-game]")).toBeVisible();
});
