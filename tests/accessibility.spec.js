const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const gameUrl = `file://${path.resolve(__dirname, "../publish/index.html")}`;
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function openGame(page) {
  await page.context().setOffline(true);
  await page.goto(gameUrl);
  await page.locator("#view").waitFor({ state: "visible" });
  await expect(page.locator("[data-start-game]")).toBeVisible();
}

async function audit(page, testInfo, name) {
  await page.addScriptTag({ content: axeSource });
  const results = await page.evaluate(tags => window.axe.run(document, {
    runOnly: { type: "tag", values: tags },
  }), wcagTags);
  await testInfo.attach(`${name}-axe-report`, {
    body: JSON.stringify(results.violations, null, 2),
    contentType: "application/json",
  });
  const critical = results.violations.filter(item => item.impact === "critical");
  expect(critical, JSON.stringify(critical, null, 2)).toEqual([]);
}

test("start screen has no critical accessibility violations", async ({ page }, testInfo) => {
  await openGame(page);
  await audit(page, testInfo, "start");
});

test("hall has no critical accessibility violations", async ({ page }, testInfo) => {
  await openGame(page);
  await page.locator("[data-start-game]").click();
  await expect(page.locator(".villa-hall")).toBeVisible();
  await audit(page, testInfo, "hall");
});
