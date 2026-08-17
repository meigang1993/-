const { test, expect } = require("@playwright/test");
const { openOnlineGame } = require("./helpers/online-game");

test("startup reaches the title screen without invoking a save function", async ({ page }) => {
  await openOnlineGame(page);
  await expect(page.locator("[data-start-game]")).toBeVisible();
  expect(await page.evaluate(() => window.__onlineFnInvokes)).toEqual([]);
  expect(await page.evaluate(() => window.__onlineKvCalls))
    .toContainEqual({ method: "get", key: "succubus-kill-settings-v1" });
});

test("existing browser KV main and settings copies load directly", async ({ page }) => {
  await openOnlineGame(page);
  const result = await page.evaluate(async () => {
    const main = window.GameStore.freshState();
    main.updatedAt = 100;
    main._saveVersion = 100;
    main.resources.gold = 321;
    const settings = {
      updatedAt: 101,
      _saveVersion: 101,
      settings: {
        sfxVolume: 34,
        musicVolume: 56,
        battleSpeed: 1.5,
        manualResponse: true,
      },
    };
    window.__onlineKv.set(window.GameStoreIO.key, main);
    window.__onlineKv.set(window.GameStoreIO.settingsKey, settings);
    const loaded = await window.GameStore.load();
    const loadedSettings = await window.GameStore.loadSettings();
    return {
      gold: loaded.resources.gold,
      musicVolume: loadedSettings.musicVolume,
      functionCalls: window.__onlineFnInvokes,
    };
  });
  expect(result).toEqual({
    gold: 321,
    musicVolume: 56,
    functionCalls: [],
  });
});

test("a failed direct KV read does not block startup or become an empty save", async ({ page }) => {
  await openOnlineGame(page, { kvGetFailure: true });
  await expect(page.locator("[data-start-game]")).toBeVisible();
  const result = await page.evaluate(async () => {
    try {
      await window.GameStore.hasMainSave();
      return { code: null, functionCalls: window.__onlineFnInvokes };
    } catch (error) {
      return { code: error.code, functionCalls: window.__onlineFnInvokes };
    }
  });
  expect(result).toEqual({ code: "CLOUD_LOAD_FAILED", functionCalls: [] });
});

for (const failure of [
  { name: "first render", option: "renderFailure", message: "injected first render failure" },
  { name: "first frame scheduling", option: "frameFailure", message: "injected first frame scheduling failure" },
  { name: "unhandled boot rejection", option: "unhandledBootFailure", message: "injected unhandled boot rejection" },
]) {
  test(`${failure.name} reports a retryable boot failure`, async ({ page }) => {
    await openOnlineGame(page, { waitForReady: false, [failure.option]: true });
    await expect(page.getByText("游戏启动失败")).toBeVisible();
    await expect(page.locator("[data-boot-retry]")).toBeVisible();
    expect(await page.evaluate(() => window.__loadingCalls)).toContainEqual({
      type: "error",
      code: "BOOT_FAILED",
      message: failure.message,
    });
    expect(await page.evaluate(() => window.__loadingCalls.some(call => call.type === "ready")))
      .toBe(false);
    await page.evaluate(() => {
      window.dispatchEvent(new Event("resize"));
      window.dispatchEvent(new Event("game-store-status"));
    });
    await page.waitForTimeout(50);
    await expect(page.getByText("游戏启动失败")).toBeVisible();
    await expect(page.locator("[data-start-game]")).toHaveCount(0);
    await expect(page.locator("#settings-toggle")).toBeDisabled();
    const ignoredRuntimeEvent = await page.evaluate(() => {
      const event = new ErrorEvent("error", {
        cancelable: true,
        error: new Error("ignored after boot failure"),
        message: "ignored after boot failure",
      });
      return {
        accepted: window.dispatchEvent(event),
        prevented: event.defaultPrevented,
      };
    });
    expect(ignoredRuntimeEvent).toEqual({ accepted: true, prevented: false });

    await page.locator("[data-boot-retry]").click();
    await expect(page.locator("[data-start-game]")).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__loadingCalls
      .filter(call => call.type === "ready").length)).toBe(1);
    await expect(page.locator("#settings-toggle")).toBeEnabled();
    const loadingOrder = await page.evaluate(() => ({
      error: window.__loadingCalls.findIndex(call => call.type === "error"),
      retryStart: window.__loadingCalls.findLastIndex(call =>
        call.type === "progress" && call.payload?.phase === "start"),
      ready: window.__loadingCalls.findIndex(call => call.type === "ready"),
      startCount: window.__loadingCalls
        .filter(call => call.type === "progress" && call.payload?.phase === "start").length,
    }));
    expect(loadingOrder.startCount).toBe(2);
    expect(loadingOrder.error).toBeLessThan(loadingOrder.retryStart);
    expect(loadingOrder.retryStart).toBeLessThan(loadingOrder.ready);
    if (failure.option === "renderFailure") {
      expect(await page.evaluate(() => window.__startupRenderCount)).toBe(2);
      await page.evaluate(() => window.__releaseDelayedRender?.());
      await page.waitForTimeout(50);
      expect(await page.evaluate(() => window.__startupRenderCount)).toBe(2);
    }
  });
}
