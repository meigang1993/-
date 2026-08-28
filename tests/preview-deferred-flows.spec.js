/* global GameData, GameStoreSaveLimits */
const { test, expect } = require("@playwright/test");
const {
  openGame, startFreshGame,
} = require("./helpers/preview-game");

test("offline deferred dungeon accepts the first node press", async ({ page }) => {
  await openGame(page, { loadFeatures: false });
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.locator("[data-start='machine_factory'][data-difficulty='normal']").click();
  await expect(page.locator(".dungeon-screen")).toBeVisible();
  expect(await page.evaluate(() => ({
    view: window.state.view,
    interrupted: window.state.log.some(line => line.includes("远征确认已中断")),
  }))).toEqual({ view: "dungeon", interrupted: false });

  const node = page.locator(".map-node.open").first();
  const nodeId = await node.getAttribute("data-dungeon-node");
  const box = await node.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(60);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(id => ({
    current: window.state.explore?.current,
    pending: window.state.explore?.pending,
  }), nodeId)).toEqual({ current: nodeId, pending: nodeId });
});

test("dungeon scene does not drift after entering or leaving", async ({ page }) => {
  await openGame(page, { loadFeatures: false });
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.locator("[data-start='machine_factory'][data-difficulty='normal']").click();
  await expect(page.locator(".dungeon-screen")).toBeVisible();
  const entry = await page.evaluate(async () => {
    const before = document.querySelector("#main").getBoundingClientRect().top;
    await new Promise(resolve => setTimeout(resolve, 750));
    const after = document.querySelector("#main").getBoundingClientRect().top;
    return { before, after };
  });
  expect(Math.abs(entry.after - entry.before)).toBeLessThanOrEqual(1);

  const exit = await page.evaluate(async () => {
    window.state.view = "hall";
    window.state.explore = null;
    window.render();
    const before = document.querySelector("#main").getBoundingClientRect().top;
    await new Promise(resolve => setTimeout(resolve, 750));
    const after = document.querySelector("#main").getBoundingClientRect().top;
    return { before, after };
  });
  expect(Math.abs(exit.after - exit.before)).toBeLessThanOrEqual(1);
});

test("pending settlement saves load the dungeon recovery UI in the hall", async ({ page }) => {
  await openGame(page, { loadFeatures: false });
  await startFreshGame(page);
  await page.evaluate(async () => {
    window.state._pendingSettlementActions = [{
      id: "pending-shop-refresh",
      type: "shopRefresh",
      data: {},
      attempts: 1,
    }];
    await window.GameBundles.ensureState(window.state);
    window.render();
  });
  expect(await page.evaluate(() => window.GameBundles.isReady("dungeon"))).toBe(true);
  await expect(page.locator(".save-warning")).toContainText("部分附加结算尚未完成");
  await expect(page.locator("[data-retry-settlement]")).toBeVisible();
  await page.evaluate(() => {
    window.__settlementSaveCalls = [];
    window.DungeonRewards.retryPending = async state => {
      state._pendingSettlementActions = [];
      return true;
    };
    window.GameStore.save = async (_state, options = {}) => {
      window.__settlementSaveCalls.push({ ...options });
    };
  });
  await page.locator("[data-retry-settlement]").click();
  await expect.poll(() => page.evaluate(() => window.__settlementSaveCalls))
    .toEqual([{ flush: true, trusted: true }]);
});

test("unconfirmed shop stock stays unavailable until a core refresh succeeds", async ({ page }) => {
  await openGame(page, { loadFeatures: false });
  await startFreshGame(page);
  const initial = await page.evaluate(() => ({
    confirmed: window.ShopSystem.confirmed(window.state),
    count: window.state.shopCards.length,
  }));
  expect(initial).toEqual({ confirmed: true, count: 6 });

  const renderState = await page.evaluate(() => {
    window.state.shopAuthorityVersion = 1;
    window.state.shopCards = [window.state.shopCards[0]];
    window.state.hallModal = "shop";
    window.__shopCoreCall = window.ServerCore.call;
    window.__failShopRefresh = true;
    window.__shopSaveCalls = [];
    window.ServerCore.call = async (method, args, state) => {
      if (method === "shopRefresh" && window.__failShopRefresh) {
        return { ok: false, changed: false, message: "模拟刷新失败" };
      }
      return window.__shopCoreCall(method, args, state);
    };
    window.GameStore.save = async (_state, options = {}) => {
      window.__shopSaveCalls.push({ ...options });
    };
    const before = window.state.random.cursor;
    window.render();
    return { before, after: window.state.random.cursor };
  });
  expect(renderState.after).toBe(renderState.before);
  await expect(page.locator(".shop-card")).toHaveCount(0);
  await expect(page.locator(".villa-modal")).toContainText("撤退或全军覆没");
  await expect(page.locator(".villa-modal")).toContainText("确认前不能购买");
  await page.locator("[data-shop-refresh]").click();
  await expect(page.locator("[data-shop-refresh]")).toBeVisible();
  expect(await page.evaluate(() => ({
    confirmed: window.ShopSystem.confirmed(window.state),
    count: window.state.shopCards.length,
    saves: window.__shopSaveCalls,
  }))).toEqual({ confirmed: false, count: 1, saves: [] });

  await page.evaluate(() => { window.__failShopRefresh = false; });
  await page.locator("[data-shop-refresh]").click();
  await expect(page.locator(".shop-card")).toHaveCount(6);
  await expect.poll(() => page.evaluate(() => ({
    confirmed: window.ShopSystem.confirmed(window.state),
    count: window.state.shopCards.length,
    saves: window.__shopSaveCalls,
  }))).toEqual({ confirmed: true, count: 6, saves: [{ flush: true, trusted: true }] });
});

test("full dungeon inventory can free the exact pending card slot and resume", async ({ page }) => {
  await openGame(page, { loadFeatures: false });
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.locator("[data-start='machine_factory'][data-difficulty='normal']").click();
  await expect(page.locator(".dungeon-screen")).toBeVisible();
  await page.evaluate(() => {
    const card = { ...GameData.eliteCards.find(item => item.name === "毒杀"), suit: "♠" };
    window.state.deck = Array.from(
      { length: GameStoreSaveLimits.limits.lists.deck },
      () => ({ ...card }),
    );
    window.state.resources.gold = 0;
    const pendingCard = {
      ...GameData.eliteCards.find(item => item.name === "伤口处理"),
      suit: "♥",
    };
    window.state._localPendingRun = {
      gold: 0, essence: 0, cards: [{ ...pendingCard }], relics: [],
    };
    window.state.explore.earned.cards = [{ ...pendingCard }];
    window.render();
  });

  await page.locator("[data-dungeon-inventory]").first().click();
  await expect(page.getByRole("heading", { name: "远征库存整理" })).toBeVisible();
  await expect(page.locator("#nav button")).toHaveCount(3);
  expect(await page.locator("#nav button").evaluateAll(
    buttons => buttons.every(button => button.disabled),
  )).toBe(true);
  await expect(page.locator("#view")).toContainText("牌库 4096/4096 · 需腾出1");
  await expect(page.locator("[data-shop-delete]")).toHaveCount(1);
  await expect(page.locator("[data-shop-delete]")).toHaveText("免费删除并腾出牌位");
  await expect(page.locator("#view")).toContainText("持有×4096");

  await page.locator("[data-shop-delete]").click();
  await expect.poll(() => page.evaluate(() => ({
    deck: window.state.deck.length,
    gold: window.state.resources.gold,
    pending: window.state.explore.earned.cards.length,
    needed: GameStoreSaveLimits.pendingInventoryPressure(window.state).cards.needed,
  }))).toEqual({ deck: 4095, gold: 0, pending: 1, needed: 0 });
  await expect(page.locator("[data-shop-delete]")).toBeDisabled();

  await page.locator("[data-return-dungeon]").click();
  await expect(page.locator(".dungeon-screen")).toBeVisible();
  expect(await page.evaluate(() => ({
    view: window.state.view,
    hasRun: !!window.state.explore,
    pending: window.state.explore?.earned?.cards?.length,
  }))).toEqual({ view: "dungeon", hasRun: true, pending: 1 });
});
