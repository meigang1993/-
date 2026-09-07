const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

test("manual slot load preserves newer independently saved appearance", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    const loaded = window.GameStore.freshState();
    loaded.ownedSkins.lokar_motherbound = true;
    loaded.equippedSkins.lokar = "lokar_default";
    loaded.settings.sfxVolume = 21;
    loaded.settings.musicVolume = 31;
    loaded.settings.manualResponse = true;
    loaded.settings.appearanceUpdatedAt = 100;
    loaded.settings.equippedSkins = { lokar: "lokar_default" };
    window.state.settings.sfxVolume = 81;
    window.state.settings.musicVolume = 91;
    window.state.settings.manualResponse = false;
    window.state.settings.appearanceUpdatedAt = 200;
    window.state.settings.equippedSkins = { lokar: "lokar_motherbound" };
    window.__promotedAppearance = null;
    window.__savedAppearance = null;
    window.__ensuredAppearance = null;
    window.GameStore.getSlots = async () => [
      { id: "auto", automatic: true, summary: null },
      {
        id: 1,
        summary: {
          time: "测试存档", unlocked: 1, total: 1,
          party: "罗卡尔", gold: 0, essence: 0,
        },
        cloudUnknown: false,
      },
      { id: 2, summary: null, cloudUnknown: false },
      { id: 3, summary: null, cloudUnknown: false },
    ];
    window.GameStore.loadSlot = async () => loaded;
    const ensureState = window.GameBundles.ensureState;
    window.GameBundles.ensureState = async value => {
      window.__ensuredAppearance = value.equippedSkins.lokar;
      return ensureState(value);
    };
    window.GameStore.promoteLoaded = async value => {
      window.__promotedAppearance = {
        skin: value.equippedSkins.lokar,
        updatedAt: value.settings.appearanceUpdatedAt,
      };
    };
    window.GameStore.saveSettings = settings => new Promise(resolve => {
      window.__savedAppearance = {
        skin: settings.equippedSkins.lokar,
        updatedAt: settings.appearanceUpdatedAt,
        sfxVolume: settings.sfxVolume,
        musicVolume: settings.musicVolume,
        manualResponse: settings.manualResponse,
      };
      window.__resolveSlotSettings = () => resolve(settings);
    });
  });
  await page.locator("#settings-toggle").click();
  await page.locator(".settings-menu [data-load-game]").click();
  await page.locator("[data-save-slot='1']").click();
  await page.locator("[data-confirm-ok]").click();
  await expect.poll(() => page.evaluate(() => window.__savedAppearance))
    .not.toBeNull();
  await expect(page.locator(".save-confirm[role='status']")).toContainText(
    "正在处理存档并同步设置"
  );
  expect(await page.evaluate(() => ({
    sfxVolume: window.state.settings.sfxVolume,
    musicVolume: window.state.settings.musicVolume,
    manualResponse: window.state.settings.manualResponse,
  }))).toEqual({ sfxVolume: 21, musicVolume: 31, manualResponse: true });
  await page.evaluate(() => window.__resolveSlotSettings());
  await expect(page.locator(".villa-hall")).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    stateSkin: window.state.equippedSkins.lokar,
    stateUpdatedAt: window.state.settings.appearanceUpdatedAt,
    ensured: window.__ensuredAppearance,
    promoted: window.__promotedAppearance,
    saved: window.__savedAppearance,
  }))).toEqual({
    stateSkin: "lokar_motherbound",
    stateUpdatedAt: 200,
    ensured: "lokar_motherbound",
    promoted: { skin: "lokar_motherbound", updatedAt: 200 },
    saved: {
      skin: "lokar_motherbound",
      updatedAt: 200,
      sfxVolume: 21,
      musicVolume: 31,
      manualResponse: true,
    },
  });
  expect(relevantErrors(errors)).toEqual([]);
});

test("automatic save load keeps independently persisted preferences", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    const loaded = window.GameStore.freshState();
    loaded.settings.sfxVolume = 10;
    loaded.settings.musicVolume = 20;
    loaded.settings.manualResponse = false;
    window.state.settings.sfxVolume = 71;
    window.state.settings.musicVolume = 82;
    window.state.settings.manualResponse = true;
    window.__automaticSettingsSaves = 0;
    window.GameStore.getSlots = async () => [{
      id: "auto",
      automatic: true,
      summary: {
        time: "自动存档", unlocked: 1, total: 1,
        party: "罗卡尔", gold: 0, essence: 0,
      },
    }];
    window.GameStore.loadAuto = async () => loaded;
    window.GameStore.saveSettings = async () => {
      window.__automaticSettingsSaves += 1;
    };
  });
  await page.locator("#settings-toggle").click();
  await page.locator(".settings-menu [data-load-game]").click();
  await page.locator("[data-save-slot='auto']").click();
  await page.locator("[data-confirm-ok]").click();
  await expect(page.locator(".villa-hall")).toBeVisible();
  expect(await page.evaluate(() => ({
    sfxVolume: window.state.settings.sfxVolume,
    musicVolume: window.state.settings.musicVolume,
    manualResponse: window.state.settings.manualResponse,
    saves: window.__automaticSettingsSaves,
  }))).toEqual({
    sfxVolume: 71,
    musicVolume: 82,
    manualResponse: true,
    saves: 0,
  });
});
