const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

test("loading a save during dungeon bundle loading cannot mutate the replacement state", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page, { loadFeatures: false });
  await startFreshGame(page);
  await page.evaluate(() => {
    const load = window.GameBundles.load.bind(window.GameBundles);
    window.GameBundles.load = name => {
      if (name !== "dungeon") return load(name);
      return new Promise((resolve, reject) => {
        window.__releaseDungeonBundle = () => load(name).then(resolve, reject);
      });
    };
    window.__staleDungeonStart = window.startMission("machine_factory", "normal");
  });
  await expect(page.locator(".dungeon-confirm")).toBeVisible();
  await page.evaluate(() => {
    const replacement = window.GameStoreStateFactory.freshState();
    replacement.view = "hall";
    replacement.log = ["replacement save"];
    window.setState(replacement);
    window.render();
    window.__releaseDungeonBundle();
  });
  await page.evaluate(() => window.__staleDungeonStart);
  expect(await page.evaluate(() => ({
    view: window.state.view,
    explore: window.state.explore,
    log: window.state.log,
  }))).toEqual({ view: "hall", explore: null, log: ["replacement save"] });
  expect(relevantErrors(errors)).toEqual([]);
});

test("settings opens as an overlay without extending page scroll", async ({ page }) => {
  await openGame(page);
  let overflowBefore = await page.locator(".content-panel").evaluate(panel => panel.scrollHeight - panel.clientHeight);
  await page.locator("[data-start-settings]").click();
  await expect(page.locator(".settings-menu")).toBeVisible();
  await expect(page.locator("[data-desktop-download]")).toHaveCount(0);
  await page.locator("[data-battle-speed='2'] + span").click();
  await expect(page.locator("[data-battle-speed='2']")).toBeChecked();
  expect(await page.evaluate(() => window.state.settings.battleSpeed)).toBe(2);
  const saveButton = page.locator("[data-save-game]");
  await saveButton.focus();
  await page.evaluate(() => {
    window.state.settings.musicVolume = 79;
    window.render();
  });
  await expect(page.locator("[data-save-game]")).toBeFocused();
  let layout = await page.evaluate(() => {
    const panel = document.querySelector(".content-panel");
    const menu = document.querySelector(".settings-menu");
    const overlay = document.querySelector(".settings-overlay");
    const rect = menu.getBoundingClientRect();
    return {
      overlayPosition: getComputedStyle(overlay).position,
      overflow: panel.scrollHeight - panel.clientHeight,
      inViewport: rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth,
    };
  });
  expect(layout.overlayPosition).toBe("fixed");
  expect(layout.overflow).toBe(overflowBefore);
  expect(layout.inViewport).toBe(true);

  await page.locator("[data-close-settings]").click();
  await startFreshGame(page);
  overflowBefore = await page.locator(".content-panel").evaluate(panel => panel.scrollHeight - panel.clientHeight);
  await page.locator("#settings-toggle").click();
  await expect(page.locator(".settings-menu")).toBeVisible();
  await expect(page.locator("[data-battle-speed='2']")).toBeChecked();
  layout = await page.evaluate(() => {
    const panel = document.querySelector(".content-panel");
    const menu = document.querySelector(".settings-menu");
    const overlay = document.querySelector(".settings-overlay");
    const rect = menu.getBoundingClientRect();
    return {
      overlayPosition: getComputedStyle(overlay).position,
      overflow: panel.scrollHeight - panel.clientHeight,
      inViewport: rect.top >= 0 && rect.left >= 0 && rect.bottom <= innerHeight && rect.right <= innerWidth,
    };
  });
  expect(layout.overlayPosition).toBe("fixed");
  expect(layout.overflow).toBe(overflowBefore);
  expect(layout.inViewport).toBe(true);
  await page.locator(".settings-menu [data-save-game]").click();
  await expect(page.locator(".save-panel")).toBeVisible();
  await page.locator("[data-save-close]").click();
  await expect(page.locator(".settings-menu")).toBeVisible();
  await page.mouse.click(4, 4);
  await expect(page.locator(".settings-menu")).toHaveCount(0);
});

test("settings read failures lock writes until retry restores a valid copy", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    const originalStatus = window.GameStore.status;
    window.__settingsReadStatus = {
      state: "error",
      source: "local",
      cloudUnknown: true,
      localAvailable: true,
      error: "SETTINGS_CLOUD_LOAD_FAILED",
      pending: false,
    };
    window.__settingsRetryCalls = 0;
    window.GameStore.status = () => ({
      ...originalStatus(),
      settings: { ...window.__settingsReadStatus },
    });
    window.state.ownedSkins.lokar_motherbound = true;
    window.state.equippedSkins.lokar = "lokar_motherbound";
    window.state.settings.appearanceUpdatedAt = 200;
    window.state.settings.equippedSkins = { lokar: "lokar_motherbound" };
    window.GameStore.retrySettings = async () => {
      window.__settingsRetryCalls += 1;
      window.__settingsReadStatus = {
        state: "ready",
        source: "cloud",
        cloudUnknown: false,
        localAvailable: true,
        error: null,
        pending: false,
      };
      return {
        sfxVolume: 56,
        musicVolume: 66,
        manualResponse: true,
        appearanceUpdatedAt: 100,
        equippedSkins: { lokar: "lokar_default" },
      };
    };
  });
  await page.locator("[data-start-settings]").click();
  await expect(page.locator(".settings-menu [role='alert']")).toContainText(
    "云端设置读取失败"
  );
  await expect(page.locator("[data-music-volume]")).toBeDisabled();
  await page.locator("[data-retry-settings]").click();
  await expect(page.locator(".settings-menu [role='alert']")).toHaveCount(0);
  await expect(page.locator("[data-music-volume]")).toBeEnabled();
  await expect(page.locator("[data-music-volume]")).toHaveValue("66");
  expect(await page.evaluate(() => window.__settingsRetryCalls)).toBe(1);
  expect(await page.evaluate(() => ({
    equipped: window.state.equippedSkins.lokar,
    savedEquipped: window.state.settings.equippedSkins.lokar,
    appearanceUpdatedAt: window.state.settings.appearanceUpdatedAt,
    sfxVolume: window.state.settings.sfxVolume,
    manualResponse: window.state.settings.manualResponse,
  }))).toEqual({
    equipped: "lokar_motherbound",
    savedEquipped: "lokar_motherbound",
    appearanceUpdatedAt: 200,
    sfxVolume: 56,
    manualResponse: true,
  });

  await page.evaluate(() => {
    window.__settingsReadStatus = {
      state: "syncing",
      source: "local",
      cloudUnknown: false,
      localAvailable: true,
      error: null,
      pending: true,
    };
    window.render();
  });
  await expect(page.locator(".settings-menu [role='status']")).toContainText(
    "正在同步设置"
  );
  await expect(page.locator("[data-music-volume]")).toBeDisabled();

  await page.evaluate(() => {
    window.__settingsReadStatus = {
      state: "error",
      source: "local",
      cloudUnknown: false,
      localAvailable: true,
      error: "SETTINGS_SAVE_FAILED",
      pending: true,
    };
    window.render();
  });
  await expect(page.locator(".settings-menu [role='alert']")).toContainText(
    "当前修改已保留"
  );
  await expect(page.locator("[data-retry-settings]")).toHaveText("重试同步");
});

test("only milestone changes reach gameplay persistence", async ({ page }) => {
  await openGame(page);
  await page.evaluate(() => {
    window.__automaticSaveCalls = [];
    window.__settingsSaves = [];
    window.GameStore.save = async (_state, options = {}) => { window.__automaticSaveCalls.push({ method: "save", ...options }); };
    window.GameStore.overwrite = async () => { window.__automaticSaveCalls.push({ method: "overwrite", flush: true }); };
    window.GameStore.saveSettings = async settings => { window.__settingsSaves.push({ ...settings }); };
  });
  await page.locator("[data-start-settings]").click();
  await page.locator("[data-music-volume]").evaluate(input => {
    input.value = "35";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__settingsSaves)).toEqual([
    expect.objectContaining({ musicVolume: 35 }),
  ]);
  expect(await page.evaluate(() => window.__automaticSaveCalls)).toEqual([]);
  await page.locator("[data-music-volume]").evaluate(input => {
    input.value = "15";
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.evaluate(async () => {
    const loaded = { ...window.state, settings: { sfxVolume: 42, musicVolume: 67, manualResponse: true } };
    window.setState(loaded);
    await window.GameStore.saveSettings(loaded.settings);
  });
  await page.waitForTimeout(600);
  expect(await page.evaluate(() => window.__settingsSaves)).toHaveLength(2);
  expect(await page.evaluate(() => window.__settingsSaves[1])).toEqual({ sfxVolume: 42, musicVolume: 67, manualResponse: true });
  await page.locator("[data-close-settings]").click();
  await startFreshGame(page);
  expect(await page.evaluate(() => window.state.settings.musicVolume)).toBe(67);
  await page.locator("[data-open-modal='team']").click();
  await page.locator("[data-close-modal]").click();
  await page.evaluate(() => {
    window.state.artZoom = { src: "./assets/images/besta-portrait.png", name: "贝丝妲" };
    window.render();
  });
  await page.keyboard.press("Escape");
  await expect(page.locator("[data-close-art]")).toHaveCount(0);
  await page.locator("[data-view='livingRoom']").click();
  const relics = await page.evaluate(() => {
    const names = Object.keys(window.GameDataRelics).slice(0, 2);
    window.state.resources.relics = [...names];
    window.state.equipment.lokar = [names[0]];
    window.state.view = "hall";
    window.state.hallModal = "relics";
    window.render();
    return names;
  });
  await page.locator("[data-open-relic-equip='lokar'][data-open-relic-slot='1']").click();
  await page.locator(`[data-popup-relic-item="${relics[1]}"]`).click();
  await page.locator("#settings-toggle").click();
  await page.evaluate(() => window.persist({ flush: true }));
  expect(await page.evaluate(() => window.__automaticSaveCalls)).toEqual([
    { method: "overwrite", flush: true },
    { method: "save", trusted: true },
    { method: "save", flush: true, trusted: true },
  ]);
});
