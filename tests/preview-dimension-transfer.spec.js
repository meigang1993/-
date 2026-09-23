const { test, expect } = require("@playwright/test");
const { startRegressionBattle } = require("./helpers/preview-game");
const {
  readTransferResult, releaseAllyTurnScenario, setupMultiHitScenario,
  setupSelectionScenario, startSkipScenario,
} = require("./helpers/dimension-transfer");

test("Dimension Transfer uses Manny's hand for black-card and target selection", async ({ page }) => {
  await startRegressionBattle(page);
  const setup = await setupSelectionScenario(page);
  await expect(page.locator(".active-hand")).toHaveAttribute("data-hand-owner", setup.mannyUid);
  await expect(page.locator(".hand-head")).toContainText("次元转移");
  await expect(page.locator("[data-card-index='0']")).toHaveClass(/disabled/);
  await expect(page.locator(`[data-target="${setup.enemyUid}"]`)).not.toHaveClass(/selectable-target/);
  await page.evaluate(() => document.querySelector("[data-card-index='0']").click());
  expect(await page.evaluate(() => window.state.battle.dimensionTransfer.costIndex)).toBeNull();
  await page.locator("[data-card-index='1']").click();
  await expect(page.locator("[data-card-index='1']")).toHaveClass(/selected/);
  await expect(page.locator(`[data-target="${setup.enemyUid}"]`)).toHaveClass(/selectable-target/);
  await page.locator(`[data-target="${setup.enemyUid}"] .unit-art`).click();
  await expect.poll(async () => {
    const result = await readTransferResult(page, setup);
    return { promptCleared: result.promptCleared, hand: result.hand, hp: result.enemyHp };
  }).toEqual({
    promptCleared: true,
    hand: ["红色保留牌"],
    hp: setup.enemyHp - 4,
  });

  await startSkipScenario(page, setup);
  await page.locator("[data-dimension-transfer-skip]").click();
  await expect.poll(async () => {
    const result = await readTransferResult(page, setup);
    return { promptCleared: result.promptCleared, hand: result.hand, hp: result.protectedHp };
  }).toEqual({
    promptCleared: true,
    hand: ["红色保留牌", "放弃时保留"],
    hp: setup.protectedHp - 3,
  });
});

test("Dimension Transfer resumes each remaining multi-hit segment", async ({ page }) => {
  await startRegressionBattle(page);
  await page.evaluate(() => { window.state.settings.battleSpeed = 2; });
  const setup = await setupMultiHitScenario(page);
  await expect(page.locator(".active-hand")).toHaveAttribute("data-hand-owner", setup.mannyUid);
  await page.locator("[data-card-index='0']").click();
  await page.locator(`[data-target="${setup.enemyUid}"] .unit-art`).click();
  await expect(page.locator(".dimension-prompt")).toContainText("次元转移");
  const firstResult = await readTransferResult(page, setup);
  expect({
    enemyHp: firstResult.enemyHp,
    protectedHp: firstResult.protectedHp,
    hand: firstResult.hand,
    pending: firstResult.pending,
  }).toEqual({
    enemyHp: setup.enemyHp - 2,
    protectedHp: setup.protectedHp,
    hand: ["第二张黑牌"],
    pending: false,
  });
  await page.locator("[data-card-index='0']").click();
  await page.locator(`[data-target="${setup.enemyUid}"] .unit-art`).click();
  await expect(page.locator(".dimension-prompt")).toHaveCount(0);
  const result = await readTransferResult(page, setup);
  expect({
    enemyHp: result.enemyHp,
    protectedHp: result.protectedHp,
    hand: result.hand,
    pending: result.pending,
    promptCleared: result.promptCleared,
  }).toEqual({
    enemyHp: setup.enemyHp - 4,
    protectedHp: setup.protectedHp,
    hand: [],
    pending: false,
    promptCleared: true,
  });
});

test("Dimension Transfer resumes reaction damage during an ally turn", async ({ page }) => {
  await startRegressionBattle(page);
  const setup = await setupMultiHitScenario(page, "ally-turn");
  await page.locator("[data-card-index='0']").click();
  await page.locator(`[data-target="${setup.enemyUid}"] .unit-art`).click();
  await expect(page.locator(".dimension-prompt")).toContainText("次元转移");
  await page.locator("[data-card-index='0']").click();
  await page.locator(`[data-target="${setup.enemyUid}"] .unit-art`).click();
  await releaseAllyTurnScenario(page);
  await expect(page.locator(".dimension-prompt")).toHaveCount(0);
  await page.evaluate(() => window.BattleActionGuard.whenIdle());
  const result = await readTransferResult(page, setup);
  expect({ hp: result.enemyHp, activeUid: result.activeUid, phase: result.phase, pending: result.pending })
    .toEqual({ hp: setup.enemyHp - 4, activeUid: setup.activeUid, phase: 4, pending: false });
});

test("Dimension Transfer stops remaining hits when it defeats the source", async ({ page }) => {
  await startRegressionBattle(page);
  const setup = await setupMultiHitScenario(page, "fatal");
  await page.locator("[data-card-index='0']").click();
  await page.locator(`[data-target="${setup.enemyUid}"] .unit-art`).click();
  await expect(page.locator(".dimension-prompt")).toHaveCount(0);
  const result = await readTransferResult(page, setup);
  expect({ enemyHp: result.enemyHp, protectedHp: result.protectedHp, pending: result.pending })
    .toEqual({ enemyHp: 0, protectedHp: setup.protectedHp, pending: false });
});
