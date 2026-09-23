const { test, expect } = require("@playwright/test");
const {
  openGame, startFreshGame, startRegressionBattle,
} = require("./helpers/preview-game");

test("credits and hall dialogs focus their top layer and restore the opener", async ({ page }) => {
  await openGame(page);
  const credits = page.locator("[data-open-credits]");
  await credits.focus();
  await credits.click();
  await expect(page.locator("[data-close-credits]")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".credits-overlay")).toHaveCount(0);
  await expect(credits).toBeFocused();

  await startFreshGame(page);
  const team = page.locator("[data-open-modal='team']").first();
  await team.focus();
  await team.click();
  await expect(page.locator(".villa-modal .info-close")).toBeFocused();
  expect(await team.evaluate(button => !!button.closest("[inert]"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator(".villa-modal")).toHaveCount(0);
  await expect(team).toBeFocused();
});

test("nested save layers restore exact controls and nested buttons do not activate slot cards", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  const settingsToggle = page.locator("#settings-toggle");
  await settingsToggle.focus();
  await settingsToggle.click();
  const settingsSave = page.locator(".settings-menu [data-save-game]");
  await expect(settingsSave).toBeFocused();
  await settingsSave.click();
  await expect(page.locator(".save-overlay")).toBeVisible();

  const slot = page.locator("[data-save-slot='1']");
  await slot.focus();
  await page.keyboard.press("Space");
  await expect(page.locator(".save-confirm")).toContainText("存档成功");
  await page.keyboard.press("Escape");
  await expect(page.locator(".save-confirm")).toHaveCount(0);
  await expect(slot).toBeFocused();

  const deleteButton = slot.locator("[data-delete-slot='1']");
  await deleteButton.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".save-confirm")).toContainText("确定删除此存档");
  await page.keyboard.press("Escape");
  await expect(deleteButton).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator(".save-overlay")).toHaveCount(0);
  await expect(settingsSave).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".settings-overlay")).toHaveCount(0);
  await expect(settingsToggle).toBeFocused();
});

test("reduced motion keeps static feedback visible without persistent loops", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openGame(page);
  await page.evaluate(() => window.GameBundles.load("battle"));
  const styles = await page.evaluate(() => {
    const fixture = document.createElement("div");
    fixture.innerHTML = `
      <button data-busy-text="处理中" disabled>原文</button>
      <div class="unit"><div class="unit-art"><img alt=""></div></div>
      <div class="manny-gun-victory-art"><img alt=""></div>`;
    document.body.appendChild(fixture);
    const button = fixture.querySelector("button");
    const portrait = fixture.querySelector(".unit-art img");
    const victory = fixture.querySelector(".manny-gun-victory-art img");
    return {
      busyOverlayPosition: getComputedStyle(button, "::after").position,
      busySpinnerAnimation: getComputedStyle(button, "::before").animationName,
      portraitAnimation: getComputedStyle(portrait).animationName,
      victoryAnimation: getComputedStyle(victory).animationName,
    };
  });
  expect(styles).toEqual({
    busyOverlayPosition: "absolute",
    busySpinnerAnimation: "none",
    portraitAnimation: "none",
    victoryAnimation: "none",
  });
});

test("battle character details isolate controls and restore the keyboard opener", async ({ page }) => {
  await startRegressionBattle(page);
  const portrait = page.locator("[data-active-info]").first();
  await portrait.focus();
  await page.keyboard.press("Enter");
  const overlay = page.locator(".info-overlay");
  await expect(overlay).toHaveCount(1);
  await expect(overlay).toHaveAttribute("role", "dialog");
  await expect(page.locator(".info-overlay [data-close-info]")).toBeFocused();
  expect(await page.locator("#app").evaluate(app => app.hasAttribute("inert"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(overlay).toHaveCount(0);
  await expect(portrait).toBeFocused();
});
