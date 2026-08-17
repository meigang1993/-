const { test, expect } = require("@playwright/test");
const { openGame } = require("./helpers/preview-game");

test("BGM stays lazy until the first player gesture", async ({ page }) => {
  const requests = [];
  page.on("request", request => {
    if (/\.m4a(?:\?|$)/.test(request.url())) requests.push(request.url());
  });
  await openGame(page, { loadFeatures: false });
  await page.waitForTimeout(150);
  expect(requests).toEqual([]);
  await page.locator("[data-start-settings]").click();
  await expect.poll(() => requests.some(url => url.endsWith("/op.m4a"))).toBe(true);
  expect(requests.filter(url => !url.endsWith("/op.m4a"))).toEqual([]);
});
