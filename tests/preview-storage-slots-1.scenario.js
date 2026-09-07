const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

test("background save failures immediately update the save warning", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.__originalStoreStatus = window.GameStore.status;
    window.__saveWarnings = [];
    window.dzmm = { toast: { warning: message => window.__saveWarnings.push(message) } };
    window.GameStore.status = () => ({ dirty: true, storage: "cloud", slotPending: {} });
    window.dispatchEvent(new Event("game-store-status"));
  });
  await expect(page.locator(".save-warning")).toContainText("云存档同步失败");
  expect(await page.evaluate(() => window.__saveWarnings)).toEqual(["自动存档失败，当前进度待重试"]);
  await page.evaluate(() => {
    window.GameStore.status = () => ({ dirty: false, slotPending: {} });
    window.dispatchEvent(new Event("game-store-status"));
  });
  await expect(page.locator(".save-warning")).toHaveCount(0);
});

test("offline manual save survives reload and can be loaded locally", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.state.resources.gold = 4321;
    window.state.resources.essence = 876;
    window.render();
  });
  await page.locator("#settings-toggle").click();
  await page.locator(".settings-menu [data-save-game]").click();
  await expect(page.locator(".save-panel")).toBeVisible();
  await page.locator("[data-save-slot='1']").click();
  await expect(page.locator(".save-confirm")).toContainText("存档成功");
  await page.locator("[data-notice-ok]").click();

  await page.reload();
  await page.locator("#view").waitFor({ state: "visible" });
  await expect(page.locator("[data-start-load]")).toBeVisible();
  await page.locator("[data-start-load]").click();
  await expect(page.locator(".save-panel")).toBeVisible();
  await expect(page.locator("[data-save-slot='1']")).toContainText("莉莉丝元：4321");
  await page.locator("[data-save-slot='1']").click();
  await page.locator("[data-confirm-ok]").click();
  await expect(page.locator(".villa-hall")).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    gold: window.state.resources.gold,
    essence: window.state.resources.essence,
    slot: window.state.currentSaveSlot,
  }))).toEqual({ gold: 4321, essence: 876, slot: 1 });
  expect(relevantErrors(errors)).toEqual([]);
});

test("manual save load preserves non-starter cards", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  const expected = await page.evaluate(() => {
    const extras = [
      window.CardUtils.cloneEntity("毒杀", { suit: "♣" }),
      window.CardUtils.cloneEntity("物资补给", { suit: "♠" }),
      window.CardUtils.cloneEntity("火杀", { suit: "♦" }),
    ];
    window.state.deck.push(...extras);
    window.render();
    return window.state.deck
      .filter(card => ["毒杀", "物资补给", "火杀"].includes(card.name))
      .map(card => `${card.name}|${card.suit}`);
  });
  await page.locator("#settings-toggle").click();
  await page.locator(".settings-menu [data-save-game]").click();
  await page.locator("[data-save-slot='2']").click();
  await expect(page.locator(".save-confirm")).toContainText("存档成功");
  await page.locator("[data-notice-ok]").click();

  await page.reload();
  await page.locator("#view").waitFor({ state: "visible" });
  await page.locator("[data-start-load]").click();
  await page.locator("[data-save-slot='2']").click();
  await page.locator("[data-confirm-ok]").click();
  await expect(page.locator(".villa-hall")).toBeVisible();
  expect(await page.evaluate(() => window.state.deck
    .filter(card => ["毒杀", "物资补给", "火杀"].includes(card.name))
    .map(card => `${card.name}|${card.suit}`))).toEqual(expected);
  expect(relevantErrors(errors)).toEqual([]);
});

test("automatic save slot is read-only in save mode and loadable in load mode", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(async () => {
    window.state.resources.gold = 2468;
    window.state.resources.essence = 135;
    await window.persist({ flush: true });
  });
  await page.locator("#settings-toggle").click();
  await page.locator(".settings-menu [data-save-game]").click();
  const saveAuto = page.locator(".save-slot.automatic");
  await expect(saveAuto).toContainText("自动存档");
  await expect(saveAuto).toContainText("莉莉丝元：2468");
  await expect(saveAuto).toContainText("普通变化：本地立即保存，云端约1秒后同步");
  await expect(saveAuto).toContainText("关键节点：新游戏、成长与消费");
  await expect(saveAuto).toHaveAttribute("aria-disabled", "true");
  await expect(saveAuto).not.toHaveAttribute("data-save-slot", "auto");
  await expect(saveAuto.locator("[data-delete-slot]")).toHaveCount(0);
  await page.locator("[data-save-close]").click();
  await page.locator(".settings-menu [data-load-game]").click();
  const loadAuto = page.locator("[data-save-slot='auto']");
  await expect(loadAuto).toContainText("莉莉丝元：2468");
  await expect(loadAuto).toContainText("战斗开始、稳定操作检查点和结束");
  await page.evaluate(() => {
    window.state.resources.gold = 1;
    window.state.resources.essence = 2;
    window.render();
  });
  await loadAuto.click();
  await page.locator("[data-confirm-ok]").click();
  await expect.poll(() => page.evaluate(() => ({
    gold: window.state.resources.gold,
    essence: window.state.resources.essence,
  }))).toEqual({ gold: 2468, essence: 135 });
  expect(relevantErrors(errors)).toEqual([]);
});
