const { test, expect } = require("@playwright/test");
const { openGame, startFreshGame } = require("./helpers/preview-game");

test("hall actions remain reachable in minimum compact landscape", async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 270 });
  await openGame(page);
  await startFreshGame(page);
  const layout = await page.evaluate(async () => {
    const actions = document.querySelector(".villa-actions");
    const before = actions.scrollTop;
    actions.scrollTop = actions.scrollHeight;
    const maxScroll = actions.scrollTop;
    window.render();
    await new Promise(resolve => setTimeout(resolve, 100));
    const restored = document.querySelector(".villa-actions");
    const panelRect = restored.getBoundingClientRect();
    const lastButton = [...restored.querySelectorAll("button")].at(-1);
    const lastRect = lastButton.getBoundingClientRect();
    const hit = document.elementFromPoint(
      lastRect.left + lastRect.width / 2,
      lastRect.top + lastRect.height / 2
    );
    return {
      pageOverflowX: document.scrollingElement.scrollWidth > innerWidth,
      pageOverflowY: document.scrollingElement.scrollHeight > innerHeight,
      internalScrollable: restored.scrollHeight > restored.clientHeight,
      internalScrolled: maxScroll > before && restored.scrollTop > before,
      lastVisible: lastRect.top >= panelRect.top - 1
        && lastRect.bottom <= panelRect.bottom + 1,
      lastClickable: lastButton.contains(hit),
    };
  });
  expect(layout).toEqual({
    pageOverflowX: false,
    pageOverflowY: false,
    internalScrollable: true,
    internalScrolled: true,
    lastVisible: true,
    lastClickable: true,
  });
});

test("fresh games guide the first expedition and retire the hint after entry", async ({ page }) => {
  await openGame(page, { loadFeatures: false });
  await startFreshGame(page);
  await expect(page.locator(".hall-first-objective")).toContainText("前往魔国机械工厂");
  await expect(page.locator("[data-open-modal='team']")).toHaveText("开始首次远征");
  await page.locator("[data-open-modal='team']").click();
  const departureStyle = await page.locator(".party-drop").evaluate(element => {
    const style = getComputedStyle(element);
    return {
      display: style.display,
      borderWidth: style.borderTopWidth,
      background: style.backgroundImage,
    };
  });
  expect(departureStyle.display).toBe("flex");
  expect(departureStyle.borderWidth).not.toBe("0px");
  expect(departureStyle.background).not.toBe("none");
  const recommended = page.locator("[data-start='machine_factory'][data-difficulty='normal']")
    .locator("xpath=..");
  await expect(recommended).toHaveClass(/recommended/);
  await expect(recommended.locator(".recommended-badge")).toHaveText("推荐首战");
  await page.locator("[data-start='machine_factory'][data-difficulty='normal']").click();
  await expect(page.locator(".dungeon-screen")).toBeVisible();
  expect(await page.evaluate(() => window.state.flags.firstExpeditionStarted)).toBe(true);
  await page.evaluate(() => {
    window.state.view = "hall";
    window.render();
  });
  await expect(page.locator(".hall-first-objective")).toHaveCount(0);
  await expect(page.locator("[data-open-modal='team']")).toHaveText("准备启程");
});

test("relic codex exposes every formal relic and closes without leaving the library", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  const relics = await page.evaluate(() => {
    const all = window.RelicSystem.all(window.state);
    window.state.resources.relics = [all[0].name];
    window.state.relicCollection = [all[1].name];
    window.state.equipment.lokar = [all[2].name];
    window.render();
    return all.map(relic => ({ name: relic.name, effect: relic.effect }));
  });
  expect(relics).toHaveLength(30);
  await page.locator("[data-open-modal='relics']").click();
  const opener = page.locator("[data-relic-codex='1']");
  await opener.focus();
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "饰品图鉴" });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".codex-relic")).toHaveCount(relics.length);
  expect(await page.locator(".codex-relic").evaluateAll(buttons =>
    buttons.map(button => button.dataset.codexRelic)))
    .toEqual(relics.map(relic => relic.name));
  await expect(page.locator("[data-relic-codex='close']")).toBeFocused();
  for (const relic of relics.slice(0, 3)) {
    await expect(page.locator(`[data-codex-relic="${relic.name}"]`)).toHaveClass(/owned/);
  }
  await expect(page.locator(`[data-codex-relic="${relics[3].name}"]`)).toHaveClass(/locked/);

  const relic = page.locator(".codex-relic").first();
  await relic.hover();
  const tooltipDisplay = await relic.locator(".relic-name").evaluate(element => getComputedStyle(element, "::after").display);
  expect(tooltipDisplay).toBe("none");
  const tooltip = page.locator("#relic-codex-hover");
  await expect(tooltip).toBeVisible();
  const centered = await tooltip.evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      x: Math.abs(rect.left + rect.width / 2 - innerWidth / 2),
      y: Math.abs(rect.top + rect.height / 2 - innerHeight / 2),
      inViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
    };
  });
  expect(centered.x).toBeLessThanOrEqual(1);
  expect(centered.y).toBeLessThanOrEqual(1);
  expect(centered.inViewport).toBe(true);
  await relic.click();
  await expect(page.locator("#relic-codex-hover")).toHaveCount(0);
  const samples = [relics[0], relics[Math.floor(relics.length / 2)], relics.at(-1)];
  for (const entry of samples.slice(0, -1)) {
    await page.locator(`[data-codex-relic="${entry.name}"]`).click();
    await expect(page.locator(".codex-detail")).toContainText(entry.name);
    await expect(page.locator(".codex-detail")).toContainText(entry.effect);
  }

  const grid = page.locator(".relic-codex-pop .codex-grid");
  await grid.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const before = await grid.evaluate(element => element.scrollTop);
  const last = samples.at(-1);
  await page.locator(`[data-codex-relic="${last.name}"]`).click();
  await expect(page.locator(".codex-detail")).toContainText(last.name);
  await expect(page.locator(".codex-detail")).toContainText(last.effect);
  await expect.poll(() => grid.evaluate(element => element.scrollTop))
    .toBeGreaterThanOrEqual(before - 2);

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".villa-modal")).toBeVisible();
  await expect(opener).toBeFocused();
  expect(await page.evaluate(() => window.state.relicCodex)).toBe(false);

  await opener.click();
  await page.locator(".codex-overlay").click({ position: { x: 20, y: 200 } });
  await expect(page.locator(".relic-codex-pop")).toHaveCount(0);
  await expect(page.locator(".villa-modal")).toBeVisible();
  await expect(opener).toBeFocused();
});
