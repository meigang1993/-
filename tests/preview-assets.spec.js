const { test, expect } = require("@playwright/test");
const { openGame } = require("./helpers/preview-game");

test("BGM stays lazy until the first player gesture", async ({ page }) => {
  const requests = [];
  page.on("request", request => {
    if (/\.ogg(?:\?|$)/.test(request.url())) requests.push(request.url());
  });
  await openGame(page, { loadFeatures: false });
  await page.waitForTimeout(150);
  expect(requests).toEqual([]);
  await page.locator("[data-start-settings]").click();
  await expect.poll(() => requests.some(url => url.endsWith("/op.ogg"))).toBe(true);
  expect(requests.filter(url => !url.endsWith("/op.ogg"))).toEqual([]);
});
