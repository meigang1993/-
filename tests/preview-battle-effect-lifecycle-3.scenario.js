const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame, startRegressionBattle,
} = require("./helpers/preview-game");

test("loading a save during battle preload cannot start the stale battle", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await page.evaluate(() => {
    window.__releaseBattlePreload = null;
    window.GameAssets.preloadBattle = () => new Promise(resolve => { window.__releaseBattlePreload = resolve; });
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-loading")).toBeVisible();
  await page.evaluate(() => {
    const replacement = window.GameStoreStateFactory.freshState();
    replacement.view = "hall";
    window.setState(replacement);
    window.render();
    window.__releaseBattlePreload();
  });
  await expect(page.locator(".villa-hall")).toBeVisible();
  await expect(page.locator(".battle-screen")).toHaveCount(0);
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => window.state.view)).toBe("hall");
  expect(await page.evaluate(() => window.state.battle)).toBeNull();
  expect(relevantErrors(errors)).toEqual([]);
});

test("battle asset failures show fallback art and a working retry action", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await page.evaluate(() => {
    window.state.testEnemies = [0];
    window.__failedBattleAssets = new Set();
    window.GameAssets.preloadBattle = async (_missionId, allies) => {
      const url = allies[0]?.avatar || allies[0]?.art;
      window.__failedBattleAssets.add(url);
      return [url];
    };
    window.GameAssets.failed = url => window.__failedBattleAssets.has(url);
    window.GameAssets.retryBattle = async () => {
      window.__failedBattleAssets.clear();
      return [];
    };
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-asset-warning")).toContainText("备用立绘");
  await expect(page.locator("[data-asset-fallback='1']").first()).toBeVisible();
  expect(await page.evaluate(() => {
    const screen = document.querySelector(".battle-screen");
    const button = document.querySelector("[data-retry-battle-assets]");
    screen.classList.add("battle-locked", "kaiichi-share-pending");
    const rect = button.getBoundingClientRect();
    const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
    screen.classList.remove("battle-locked", "kaiichi-share-pending");
    return hit === button || hit?.closest("[data-retry-battle-assets]") === button;
  })).toBe(true);
  await page.locator("[data-retry-battle-assets]").click();
  await expect(page.locator(".battle-asset-warning")).toHaveCount(0);
  await expect(page.locator("[data-asset-fallback='1']")).toHaveCount(0);
});

test("battle asset retry does not block actions or write into replacement state", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await page.evaluate(() => {
    window.state.testEnemies = [0];
    window.GameAssets.preloadBattle = async (_missionId, allies) => [allies[0]?.avatar || allies[0]?.art];
    window.GameAssets.failed = () => true;
    window.GameAssets.retryBattle = (_list, onProgress) => new Promise(resolve => {
      window.__finishAssetRetry = () => { onProgress?.(1, 1); resolve([]); };
    });
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
  });
  await page.locator("[data-start-test-battle]").click();
  await page.locator("[data-retry-battle-assets]").click();
  await expect(page.locator("[data-retry-battle-assets]")).toBeDisabled();
  expect(await page.evaluate(() => window.BattleActionGuard.run("并行战斗动作", async () => {
    window.__parallelBattleActionRan = true;
    return true;
  }))).toBe(true);
  expect(await page.evaluate(() => window.__parallelBattleActionRan)).toBe(true);

  const stale = await page.evaluate(async () => {
    const oldState = window.state, oldBattle = oldState.battle;
    const replacement = window.GameStoreStateFactory.freshState();
    replacement.view = "hall";
    window.setState(replacement);
    window.render();
    window.__finishAssetRetry();
    await new Promise(resolve => setTimeout(resolve, 40));
    return {
      oldFailures: oldBattle.assetFailures.length,
      oldRetrying: oldBattle.assetRetrying,
      currentView: window.state.view,
      currentBattle: window.state.battle,
    };
  });
  expect(stale).toEqual({
    oldFailures: 1,
    oldRetrying: true,
    currentView: "hall",
    currentBattle: null,
  });
});

test("an old battle asset retry does not block a replacement battle retry", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await page.evaluate(() => {
    window.state.testEnemies = [0];
    window.GameAssets.preloadBattle = async (_missionId, allies) => [allies[0]?.avatar || allies[0]?.art];
    window.GameAssets.failed = () => true;
    window.__assetRetries = [];
    window.GameAssets.retryBattle = (_list, onProgress) => new Promise(resolve => {
      window.__assetRetries.push({ onProgress, resolve });
    });
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
  });
  await page.locator("[data-start-test-battle]").click();
  await page.locator("[data-retry-battle-assets]").click();
  await expect.poll(() => page.evaluate(() => window.__assetRetries.length)).toBe(1);

  await page.evaluate(() => {
    const oldBattle = window.state.battle;
    window.state.battle = {
      ...oldBattle,
      assetFailures: [...oldBattle.assetFailures],
      assetCriticalFailures: [...oldBattle.assetCriticalFailures],
      assetRetrying: false,
      assetRetryProgress: null,
    };
    window.render();
  });
  await page.locator("[data-retry-battle-assets]").click();
  await expect.poll(() => page.evaluate(() => window.__assetRetries.length)).toBe(2);
  expect(await page.evaluate(() => window.state.battle.assetRetrying)).toBe(true);
  await page.evaluate(() => {
    window.__assetRetries[1].onProgress?.(1, 1);
    window.__assetRetries[1].resolve([]);
    window.__assetRetries[0].resolve([]);
  });
  await expect.poll(() => page.evaluate(() => window.state.battle.assetRetrying)).toBe(false);
});

test("runtime recovery invalidates an old battle asset retry", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await page.evaluate(() => {
    window.state.testEnemies = [0];
    window.GameAssets.preloadBattle = async (_missionId, allies) =>
      [allies[0]?.avatar || allies[0]?.art];
    window.GameAssets.failed = () => true;
    window.__assetRetries = [];
    window.GameAssets.retryBattle = (list, onProgress) => new Promise(resolve => {
      window.__assetRetries.push({ list: [...list], onProgress, resolve });
    });
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
  });
  await page.locator("[data-start-test-battle]").click();
  await page.locator("[data-retry-battle-assets]").click();
  await expect.poll(() => page.evaluate(() => window.__assetRetries.length)).toBe(1);
  await page.evaluate(() => {
    window.AppRuntimeErrors.capture(new Error("asset retry boundary"), "error");
    window.AppRuntimeErrors.retry();
  });
  await page.locator("[data-retry-battle-assets]").click();
  await expect.poll(() => page.evaluate(() => window.__assetRetries.length)).toBe(2);
  await page.evaluate(() => {
    window.__assetRetries[1].resolve([]);
  });
  await expect.poll(() => page.evaluate(() =>
    window.state.battle.assetFailures.length)).toBe(0);
  await page.evaluate(() => {
    const first = window.__assetRetries[0];
    first.onProgress?.(1, 1);
    first.resolve(first.list);
  });
  await page.waitForTimeout(40);
  expect(await page.evaluate(() => ({
    failures: window.state.battle.assetFailures.length,
    retrying: window.state.battle.assetRetrying,
  }))).toEqual({ failures: 0, retrying: false });
});
