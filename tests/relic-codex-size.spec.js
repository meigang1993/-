const path = require("path");
const { test, expect } = require("@playwright/test");

const gameUrl = `file://${path.resolve(__dirname, "../publish/index.html")}`;

async function openRelicCodex(page) {
  await page.goto(gameUrl);
  await page.locator("#view").waitFor({ state: "visible" });
  await page.locator("[data-start-game]").click();
  await page.waitForTimeout(1200);
  await page.locator('[data-open-modal="relics"]').first().click();
  await page.waitForTimeout(500);
  await page.locator('[data-relic-codex="1"]').first().click();
  await page.waitForTimeout(600);
}

test("饰品图鉴：浮层铺满视口且网格有足够可视高度", async ({ page }) => {
  await openRelicCodex(page);
  const box = await page.evaluate(() => {
    const pop = document.querySelector(".relic-codex-pop");
    const grid = document.querySelector(".relic-codex-pop .codex-grid");
    return {
      popH: Math.round(pop.getBoundingClientRect().height),
      gridH: Math.round(grid.getBoundingClientRect().height),
      overlayPos: getComputedStyle(pop.parentElement).position,
      vh: window.innerHeight,
    };
  });
  // 浮层必须 fixed，否则会被祖先 contain 困在面板高度内
  expect(box.overlayPos).toBe("fixed");
  // 高度应接近视口（92vh）
  expect(box.popH).toBeGreaterThan(box.vh * 0.8);
  // 网格可视区要足够高，不能只剩两行
  expect(box.gridH).toBeGreaterThan(300);
});

test("饰品图鉴：滚动后点击饰品不会跳回顶部", async ({ page }) => {
  await openRelicCodex(page);
  const grid = page.locator(".relic-codex-pop .codex-grid");
  await expect(grid).toBeVisible();

  await grid.evaluate(el => { el.scrollTop = 120; });
  await page.waitForTimeout(150);
  const before = await grid.evaluate(el => el.scrollTop);

  const target = await page.evaluate(() => {
    const g = document.querySelector(".relic-codex-pop .codex-grid");
    const gb = g.getBoundingClientRect();
    const hit = [...g.querySelectorAll("[data-codex-relic]")].find(c => {
      const b = c.getBoundingClientRect();
      return b.top >= gb.top - 2 && b.bottom <= gb.bottom + 2;
    });
    return hit ? hit.getAttribute("data-codex-relic") : null;
  });
  expect(target).toBeTruthy();

  await page.locator(`[data-codex-relic="${target}"]`).first().click();
  await page.waitForTimeout(500);
  const after = await grid.evaluate(el => el.scrollTop);
  expect(Math.abs(after - before)).toBeLessThan(40);
});
