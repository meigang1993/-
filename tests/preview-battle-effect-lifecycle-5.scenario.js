const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame, startRegressionBattle,
} = require("./helpers/preview-game");

test("battle leave preserves its owner and discards queued stale actions", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    let queuedTask;
    let queuedRuns = 0;
    let ownerCommits = 0;
    const ownerTask = window.BattleActionGuard.run(
      "battle exit fixture",
      async ({ state: actionState, isCurrent }) => {
        queuedTask = window.BattleActionGuard.runWhenIdle(
          "stale queued fixture",
          async () => { queuedRuns += 1; },
        );
        window.BattleFX.leave(actionState);
        actionState.battle = null;
        actionState.view = "hall";
        if (!isCurrent()) return false;
        ownerCommits += 1;
        return true;
      },
      { allowBattleExit: true },
    );
    return {
      ownerResult: await ownerTask,
      queuedResult: await queuedTask,
      ownerCommits,
      queuedRuns,
    };
  });
  expect(result).toEqual({
    ownerResult: true,
    queuedResult: false,
    ownerCommits: 1,
    queuedRuns: 0,
  });
});

test("runtime cancellation releases pending cards from discarded effect events", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle;
    const owner = battle.allies[0];
    const card = { name: "取消恢复牌", type: "tactic", suit: "♦", _pendingDraw: true };
    owner.hand = [card];
    battle.locked = false;
    battle.animQueue = [{
      type: "gainCards", uid: owner.uid, side: owner.side, cards: [card], count: 1,
    }];
    window.BattleEffects.cancel(window.state);
    return {
      queueLength: battle.animQueue.length,
      pending: !!card._pendingDraw,
    };
  });
  expect(result).toEqual({ queueLength: 0, pending: false });
});

test("runtime recovery invalidates a battle still preloading", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await page.evaluate(() => {
    window.state.testEnemies = [0];
    window.GameAssets.preloadBattle = async () => new Promise(resolve => {
      window.__releaseBattlePreload = resolve;
    });
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
  });
  await page.locator("[data-start-test-battle]").click();
  await expect.poll(() => page.evaluate(() =>
    typeof window.__releaseBattlePreload)).toBe("function");
  await page.evaluate(() => {
    window.AppRuntimeErrors.capture(new Error("battle preload boundary"), "error");
    window.AppRuntimeErrors.retry();
    window.__releaseBattlePreload([]);
  });
  await expect.poll(() => page.evaluate(() => ({
    battle: !!window.state.battle,
    starting: !!window.state.testBattleStarting,
    view: window.state.view,
  }))).toEqual({ battle: false, starting: false, view: "hall" });
  await expect(page.locator(".battle-screen")).toHaveCount(0);
});

test("test battle startup failure clears partially initialized battle runtime", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await page.evaluate(() => {
    window.state.testEnemies = [0];
    window.GameAssets.preloadBattle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.BattleEffects.whenIdle = async () => {
      window.state.infoUnit = window.state.battle.allies[0].uid;
      const stale = document.createElement("div");
      stale.className = "float-num";
      document.body.appendChild(stale);
      throw new Error("forced startup failure");
    };
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".villa-modal")).toBeVisible();
  await expect(page.locator(".battle-screen")).toHaveCount(0);
  await expect(page.locator(".float-num,.slash-fx,.armor-shard")).toHaveCount(0);
  expect(await page.evaluate(() => ({
    view: window.state.view,
    battle: window.state.battle,
    infoUnit: window.state.infoUnit,
    infoTab: window.state.infoTab,
    effectsIdle: !window.BattleEffects.animating && !window.BattleEffects.draining,
  }))).toEqual({
    view: "hall",
    battle: null,
    infoUnit: null,
    infoTab: "stats",
    effectsIdle: true,
  });
});

test("standard battle startup failure clears partially initialized battle runtime", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  const result = await page.evaluate(async () => {
    const mission = window.GameData.missions.find(item => window.GameData.enemies[item.id]?.length);
    mission.kind = "limited";
    window.GameAssets.preloadBattle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.BattleEffects.whenIdle = async () => {
      window.state.infoUnit = window.state.battle.allies[0].uid;
      const stale = document.createElement("div");
      stale.className = "slash-fx";
      document.body.appendChild(stale);
      throw new Error("forced standard startup failure");
    };
    await window.startMission(mission.id);
    return {
      view: window.state.view,
      battle: window.state.battle,
      infoUnit: window.state.infoUnit,
      infoTab: window.state.infoTab,
      effectsIdle: !window.BattleEffects.animating && !window.BattleEffects.draining,
    };
  });
  await expect(page.locator(".villa-hall")).toBeVisible();
  await expect(page.locator(".battle-screen")).toHaveCount(0);
  await expect(page.locator(".float-num,.slash-fx,.armor-shard")).toHaveCount(0);
  expect(result).toEqual({
    view: "hall",
    battle: null,
    infoUnit: null,
    infoTab: "stats",
    effectsIdle: true,
  });
});
