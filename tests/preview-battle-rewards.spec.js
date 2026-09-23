const { test, expect } = require("@playwright/test");
const {
  openGame, startFreshGame, startRegressionBattle,
} = require("./helpers/preview-game");

test("resource labels distinguish hall balance from pending dungeon income", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await expect(page.locator("#resources")).toContainText("据点余额");
  await page.evaluate(() => {
    window.DungeonSystem.start(window.state, "machine_factory", "normal");
    window.state.explore.earned.gold = 464;
    window.state.explore.earned.essence = 2;
    window.render();
  });
  await expect(page.locator("#resources")).toContainText("据点余额");
  await expect(page.locator("#resources")).toContainText("待结算 +464");
  await expect(page.locator("#resources")).toContainText("待结算 +2");
  await expect(page.locator(".dungeon-head")).toContainText("本次探索待结算 464");
});

test("victory settlement stays scrollbar-free across preview sizes", async ({ page }) => {
  await startRegressionBattle(page);
  await page.evaluate(() => {
    window.BattleVictory.open(window.state);
    window.render();
  });
  await expect(page.locator(".victory-screen")).toBeVisible();
  await expect(page.locator("[data-victory-experience]")).toHaveCount(0);
  await expect(page.locator("[data-mvp-row]")).toBeVisible();
  await expect(page.locator("[data-mvp-rank]")).toHaveCount(2);
  await expect(page.locator("[data-mvp-row]")).toContainText("MVP");
  await expect(page.locator("[data-mvp-row]")).toContainText("评分");
  const expectedExperience = await page.evaluate(() => {
    window.state.battle.test = false;
    window.state.battle.exploration = true;
    window.state.battle.nodeType = "elite";
    window.state.explore = { difficultyId: "adventure" };
    window.render();
    return window.CharacterProgression.rewardFor(
      "elite", window.GameData.difficulties.adventure);
  });
  await expect(page.locator("[data-victory-experience]"))
    .toHaveText(`队伍经验 +${expectedExperience}`);

  await page.setViewportSize({ width: 1280, height: 720 });
  const desktopSize = await page.evaluate(() => {
    const screen = document.querySelector(".victory-screen");
    const stats = document.querySelector(".victory-stats");
    return {
      screenWidth: screen.clientWidth,
      screenHeight: screen.clientHeight,
      statsWidth: stats.clientWidth,
      statsHeight: stats.clientHeight,
    };
  });
  expect(desktopSize.screenWidth).toBeGreaterThanOrEqual(940);
  expect(desktopSize.screenHeight).toBeGreaterThanOrEqual(500);
  expect(desktopSize.statsWidth).toBeGreaterThanOrEqual(880);
  expect(desktopSize.statsHeight).toBeGreaterThanOrEqual(430);

  const viewports = [
    { width: 1280, height: 720 },
    { width: 844, height: 390 },
  ];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    const layout = await page.evaluate(() => {
      const screen = document.querySelector(".victory-screen");
      const stats = document.querySelector(".victory-stats");
      return {
        screenOverflow: getComputedStyle(screen).overflowY,
        statsOverflow: getComputedStyle(stats).overflowY,
        bodyX: document.body.scrollWidth - document.body.clientWidth,
        bodyY: document.body.scrollHeight - document.body.clientHeight,
        contentFits: stats.scrollHeight <= stats.clientHeight
          && stats.scrollWidth <= stats.clientWidth,
      };
    });
    expect(layout).toEqual({
      screenOverflow: "hidden",
      statsOverflow: "hidden",
      bodyX: 0,
      bodyY: 0,
      contentFits: true,
    });
  }
});
