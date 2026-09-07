const { test, expect } = require("@playwright/test");
const {
  openGame, startFreshGame,
} = require("./helpers/preview-game");

test("clicking an equipped relic slot unequips it", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  const relics = await page.evaluate(() => {
    const names = Object.keys(window.GameDataRelics).slice(0, 2);
    window.state.resources.relics = [...names];
    window.state.equipment.lokar = [...names];
    window.state.hallModal = "relics";
    window.render();
    return names;
  });
  await page.locator("[data-open-relic-equip='lokar'][data-open-relic-slot='0']").click();
  await expect(page.locator(
    "[data-open-relic-equip='lokar'][data-open-relic-slot='0']"
  )).toContainText("空槽");
  await expect(page.locator(
    "[data-open-relic-equip='lokar'][data-open-relic-slot='1']"
  )).toContainText(relics[1]);
  expect(await page.evaluate(() => window.state.equipment.lokar))
    .toEqual([null, relics[1]]);
});

test("removing a test relic preserves the other equipment slot", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  const relics = await page.evaluate(() => {
    const names = Object.keys(window.GameDataRelics).slice(0, 2);
    window.state.testRelics = [...names];
    window.state.testEquipment.lokar = [...names];
    window.state.hallModal = "testBattle";
    window.render();
    return names;
  });
  await page.locator(`[data-test-relic="${relics[0]}"]`).click();
  expect(await page.evaluate(() => window.state.testEquipment.lokar))
    .toEqual([null, relics[1]]);
});

test("living-room relic tab keeps equipment controls without a codex entry", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-view='livingRoom']").click();
  await page.locator('[data-active-info="lokar"]').click();
  await page.locator('[data-info-tab="relics"]').click();
  await expect(page.locator(".relic-slot")).toHaveCount(2);
  await expect(page.locator(".info-overlay [data-relic-codex]")).toHaveCount(0);
  await expect(page.locator(".info-overlay")).toBeVisible();
});
