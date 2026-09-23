const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, waitForImages, startFreshGame,
  startRegressionBattle, prepareAoeLineCapture, capturedAoeLineCount,
} = require("./helpers/preview-game");

test("static game shell boots without console errors", async ({ page }, testInfo) => {
  const errors = collectErrors(page);
  await openGame(page);
  await expect(page.locator("[data-nalang-open]")).toHaveCount(0);
  await expect(page.locator("#settings-toggle")).toHaveCount(1);
  await page.screenshot({ path: testInfo.outputPath("preview.png"), fullPage: true });
  expect(relevantErrors(errors)).toEqual([]);
});

test("compact title controls remain visible without overlap", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 270 });
  await openGame(page);
  const layout = await page.evaluate(() => {
    const settings = document.querySelector("[data-start-settings]").getBoundingClientRect();
    const credits = document.querySelector("[data-open-credits]").getBoundingClientRect();
    const overlaps = settings.left < credits.right && settings.right > credits.left
      && settings.top < credits.bottom && settings.bottom > credits.top;
    return {
      pageOverflowX: document.scrollingElement.scrollWidth > innerWidth,
      pageOverflowY: document.scrollingElement.scrollHeight > innerHeight,
      settingsVisible: settings.left >= 0 && settings.right <= innerWidth
        && settings.top >= 0 && settings.bottom <= innerHeight,
      creditsVisible: credits.left >= 0 && credits.right <= innerWidth
        && credits.top >= 0 && credits.bottom <= innerHeight,
      overlaps,
    };
  });
  expect(layout).toEqual({
    pageOverflowX: false,
    pageOverflowY: false,
    settingsVisible: true,
    creditsVisible: true,
    overlaps: false,
  });
});

test("start and hall layouts match visual baselines", async ({ page }) => {
  await openGame(page);
  await waitForImages(page);
  await expect(page).toHaveScreenshot("start-screen.png", {
    animations: "disabled",
    mask: [page.locator(".build-badge")],
    maxDiffPixelRatio: 0.002,
  });

  await startFreshGame(page);
  await waitForImages(page);
  await expect(page).toHaveScreenshot("hall-screen.png", {
    animations: "disabled",
    mask: [page.locator(".build-badge"), page.locator(".hall-update-button small")],
    maxDiffPixelRatio: 0.002,
  });

  const overflow = await page.evaluate(() => ({
    bodyX: document.body.scrollWidth - document.body.clientWidth,
    bodyY: document.body.scrollHeight - document.body.clientHeight,
    viewX: document.querySelector("#view").scrollWidth - document.querySelector("#view").clientWidth,
  }));
  expect(overflow.bodyX).toBeLessThanOrEqual(1);
  expect(overflow.bodyY).toBeLessThanOrEqual(1);
  expect(overflow.viewX).toBeLessThanOrEqual(1);
});
