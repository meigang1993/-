const path = require("path");
const { test, expect } = require("@playwright/test");

const gameUrl = `file://${path.resolve(__dirname, "../publish/index.html")}`;

async function openCardCodex(page) {
  await page.goto(gameUrl);
  await page.locator("#view").waitFor({ state: "visible" });
  await page.locator("[data-start-game]").click();
  await page.waitForTimeout(1200);
  await page.locator('[data-open-modal="deck"]').first().click();
  await page.waitForTimeout(600);
  await page.locator('[data-card-codex="1"]').first().click();
  await page.waitForTimeout(600);
}

test("卡牌图鉴：滚动后点击卡片不会跳回顶部", async ({ page }) => {
  await openCardCodex(page);
  const grid = page.locator(".card-codex-grid");
  await expect(grid).toBeVisible();

  await grid.evaluate(el => { el.scrollTop = 300; });
  await page.waitForTimeout(150);
  const before = await grid.evaluate(el => el.scrollTop);
  expect(before).toBeGreaterThan(0);

  // 只点当前视口内可见的卡片（真实用户也点不到视口外的）
  const target = await page.evaluate(() => {
    const g = document.querySelector(".card-codex-grid");
    const gb = g.getBoundingClientRect();
    const hit = [...g.querySelectorAll("[data-codex-card]")].find(c => {
      const b = c.getBoundingClientRect();
      return b.top >= gb.top - 2 && b.bottom <= gb.bottom + 2;
    });
    return hit ? hit.getAttribute("data-codex-card") : null;
  });
  expect(target).toBeTruthy();

  await page.locator(`[data-codex-card="${target}"]`).first().click();
  await page.waitForTimeout(500);
  const after = await grid.evaluate(el => el.scrollTop);
  expect(Math.abs(after - before)).toBeLessThan(40);
});

test("卡牌图鉴：浮层铺满视口且网格有足够可视高度", async ({ page }) => {
  await openCardCodex(page);
  const box = await page.evaluate(() => {
    const pop = document.querySelector(".card-codex-pop");
    const grid = document.querySelector(".card-codex-grid");
    return {
      popH: Math.round(pop.getBoundingClientRect().height),
      gridH: Math.round(grid.getBoundingClientRect().height),
      vh: window.innerHeight,
    };
  });
  // 浮层应接近视口高度（解除祖先 contain 后不再是面板高度）
  expect(box.popH).toBeGreaterThan(box.vh * 0.8);
  // 卡片网格可视区应足够高，不能只剩一两条
  expect(box.gridH).toBeGreaterThan(300);
});
