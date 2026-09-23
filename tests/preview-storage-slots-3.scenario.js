const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

test("manual load keeps a settings retry visible after sync failure", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    const loaded = window.GameStore.freshState();
    loaded.settings.musicVolume = 33;
    const originalStatus = window.GameStore.status;
    window.__slotSettingsStatus = {
      state: "ready", error: null, pending: false,
    };
    window.GameStore.status = () => ({
      ...originalStatus(),
      settings: { ...window.__slotSettingsStatus },
    });
    window.GameStore.getSlots = async () => [{
      id: 1,
      summary: {
        time: "测试存档", unlocked: 1, total: 1,
        party: "罗卡尔", gold: 0, essence: 0,
      },
      cloudUnknown: false,
    }];
    window.GameStore.loadSlot = async () => loaded;
    window.GameStore.promoteLoaded = async () => {};
    window.GameStore.saveSettings = async () => {
      window.__slotSettingsStatus = {
        state: "error", error: "SETTINGS_SAVE_FAILED", pending: true,
      };
      const error = new Error("settings unavailable");
      error.code = "SETTINGS_SAVE_FAILED";
      throw error;
    };
  });
  await page.locator("#settings-toggle").click();
  await page.locator(".settings-menu [data-load-game]").click();
  await page.locator("[data-save-slot='1']").click();
  await page.locator("[data-confirm-ok]").click();
  await expect(page.locator(".settings-menu")).toBeVisible();
  await expect(page.locator(".settings-menu [role='alert']")).toContainText(
    "设置同步失败"
  );
  await expect(page.locator("[data-retry-settings]")).toHaveText("重试同步");
  expect(await page.evaluate(() => window.state.settings.musicVolume)).toBe(33);
});

test("runtime recovery invalidates an in-flight manual slot load", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    const loaded = window.GameStore.freshState();
    loaded.resources.gold = 987654;
    window.state.resources.gold = 321;
    window.GameStore.getSlots = async () => [{
      id: 1,
      summary: {
        time: "测试存档", unlocked: 1, total: 1,
        party: "罗卡尔", gold: loaded.resources.gold, essence: 0,
      },
      cloudUnknown: false,
    }];
    window.GameStore.loadSlot = () => new Promise(resolve => {
      window.__releaseStaleSlotLoad = () => resolve(loaded);
    });
    window.GameStore.promoteLoaded = async () => {};
    window.GameBundles.ensureState = async () => {};
  });
  await page.locator("#settings-toggle").click();
  await page.locator(".settings-menu [data-load-game]").click();
  await page.locator("[data-save-slot='1']").click();
  await page.locator("[data-confirm-ok]").click();
  await expect.poll(() => page.evaluate(() =>
    typeof window.__releaseStaleSlotLoad)).toBe("function");
  await page.evaluate(() => {
    window.AppRuntimeErrors.capture(new Error("slot load boundary"), "error");
    window.AppRuntimeErrors.retry();
    window.__releaseStaleSlotLoad();
  });
  await expect.poll(() => page.evaluate(() => window.state.resources.gold))
    .toBe(321);
  await expect(page.locator(".save-panel")).toBeVisible();
});
