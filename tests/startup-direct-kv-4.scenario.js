const { test, expect } = require("@playwright/test");
const { openOnlineGame } = require("./helpers/online-game");

test("runtime boundary invalidates late new-game initialization", async ({ page }) => {
  await openOnlineGame(page);
  const result = await page.evaluate(async () => {
    const originalState = window.state;
    let releaseBundle;
    window.GameBundles.ensureState = () => new Promise(resolve => {
      releaseBundle = resolve;
    });
    let coreCalls = 0;
    window.ServerCore.call = async () => {
      coreCalls += 1;
      return { ok: true };
    };
    const pending = window.createNewGame();
    while (!releaseBundle) await Promise.resolve();
    window.AppRuntimeErrors.capture(new Error("new game boundary"), "error");
    window.AppRuntimeErrors.retry();
    releaseBundle();
    await pending;
    return {
      coreCalls,
      sameState: window.state === originalState,
      overlayOpen: !!document.getElementById("runtime-error-boundary"),
    };
  });
  expect(result).toEqual({
    coreCalls: 0,
    sameState: true,
    overlayOpen: false,
  });
  await expect(page.locator("[data-start-game]")).toBeEnabled();
});

test("runtime error dialog isolates an existing modal", async ({ page }) => {
  await openOnlineGame(page);
  await page.locator("[data-start-settings]").click();
  await expect(page.locator("[data-settings-overlay]")).toBeVisible();
  const settingsSave = page.locator("[data-settings-overlay] [data-save-game]");
  await expect(settingsSave).toBeFocused();
  await page.evaluate(() => {
    window.AppRuntimeErrors.capture(new Error("modal boundary"), "error");
  });
  const retry = page.getByRole("button", { name: "返回重试" });
  await expect(retry).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("alertdialog", { name: "操作发生异常" })).toBeVisible();
  await expect(page.locator("[data-settings-overlay]")).toBeVisible();
  expect(await page.evaluate(() =>
    document.getElementById("app").hasAttribute("inert"))).toBe(true);
  await retry.click();
  await expect(page.getByRole("alertdialog", { name: "操作发生异常" })).toHaveCount(0);
  await expect(page.locator("[data-settings-overlay]")).toBeVisible();
  await expect(settingsSave).toBeFocused();
});

test("runtime error dialog retains prior focus across a failed retry render", async ({ page }) => {
  await openOnlineGame(page);
  await page.locator("[data-start-settings]").click();
  const settingsSave = page.locator("[data-settings-overlay] [data-save-game]");
  await expect(settingsSave).toBeFocused();
  await page.evaluate(() => {
    const originalRender = window.render;
    let attempts = 0;
    window.render = () => {
      attempts += 1;
      if (attempts === 1) throw new Error("retry render failed once");
      return originalRender();
    };
    window.AppRuntimeErrors.capture(new Error("initial modal boundary"), "error");
  });
  const retry = page.getByRole("button", { name: "返回重试" });
  await retry.click();
  await expect(retry).toBeFocused();
  await retry.click();
  await expect(page.getByRole("alertdialog", { name: "操作发生异常" })).toHaveCount(0);
  await expect(settingsSave).toBeFocused();
});

test("main save, manual slot, and settings write directly to KV", async ({ page }) => {
  await openOnlineGame(page);
  const result = await page.evaluate(async () => {
    const state = window.GameStore.freshState();
    state.resources.gold = 88;
    await window.GameStore.save(state, { flush: true });
    await window.GameStore.saveSlot(2, state);
    await window.GameStore.saveSettings({
      sfxVolume: 20,
      musicVolume: 30,
      battleSpeed: 2,
      manualResponse: true,
    });
    return {
      keys: [...window.__onlineKv.keys()].sort(),
      puts: window.__onlinePuts,
      functionCalls: window.__onlineFnInvokes,
    };
  });
  expect(result.keys).toEqual([
    "succubus-kill-save-v1",
    "succubus-kill-settings-v1",
    "succubus-kill-slot-2-v1",
  ]);
  expect(result.puts.every(item => item.options?.flush === true)).toBe(true);
  expect(result.functionCalls).toEqual([]);
});
