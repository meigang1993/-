const { test, expect } = require("@playwright/test");
const {
  collectErrors,
  relevantErrors,
  bestCoveragePath,
  startDungeon,
  clickTwice,
} = require("./helpers/dungeon-flow");

async function ensureFirstBattleNode(page) {
  return page.evaluate(() => {
    const run = window.state.explore;
    const nodes = window.DungeonEvents.nodes(run);
    const current = nodes.find(node => node.id === run.current);
    let first = current.next.map(id => nodes.find(node => node.id === id))
      .find(node => ["normal", "elite", "boss"].includes(node?.type));
    if (!first) {
      first = nodes.find(node => node.id === current.next[0]);
      first.type = "normal";
      first.enemies = window.DungeonEnemyGroups.enemiesFor(run, "normal", window.state);
      window.render();
    }
    return first.id;
  });
}

test("runtime boundary rolls back a pending pre-battle node", async ({ page }) => {
  test.setTimeout(120000);
  await startDungeon(page);
  const firstId = await ensureFirstBattleNode(page);
  const previous = await page.evaluate(() => window.state.explore.current);
  await page.evaluate(() => {
    window.tryLittleElranaEncounter = async () => new Promise(resolve => {
      window.__releaseRuntimeEncounter = resolve;
    });
  });
  await page.locator(`[data-dungeon-node='${firstId}']`).click();
  await expect.poll(() => page.evaluate(id => ({
    pending: window.state.explore?.pending,
    ready: typeof window.__releaseRuntimeEncounter === "function",
  }), firstId)).toEqual({ pending: firstId, ready: true });
  await page.evaluate(() => {
    window.AppRuntimeErrors.capture(new Error("node boundary"), "error");
    window.AppRuntimeErrors.retry();
    window.__releaseRuntimeEncounter(false);
  });
  await expect.poll(() => page.evaluate(id => {
    const run = window.state.explore;
    return {
      battle: !!window.state.battle,
      current: run?.current,
      pending: run?.pending,
      selectable: window.DungeonMap.canChoose(run, id),
      view: window.state.view,
    };
  }, firstId)).toEqual({
    battle: false,
    current: previous,
    pending: null,
    selectable: true,
    view: "dungeon",
  });
});

test("Little Elrana encounter stops after losing node ownership", async ({ page }) => {
  test.setTimeout(120000);
  await startDungeon(page);
  const result = await page.evaluate(async () => {
    const run = window.state.explore;
    run.activeParty = ["elrana"];
    window.state.chars.find(item => item.id === "elrana").locked = false;
    window.state.chars.find(item => item.id === "little_elrana").locked = true;
    delete window.state.flags.littleElranaUnlockSeen;
    delete window.state.flags.littleElranaUnlockPending;
    const originalRetry = window.DungeonRewards.retryPending;
    let release;
    window.DungeonRewards.retryPending = async () => new Promise(resolve => { release = resolve; });
    const pending = window.tryLittleElranaEncounter(window.state, {
      exploration: true,
      enemies: [{ id: "elrana_clone" }],
    }, () => window.state.explore === run);
    window.state.explore = null;
    release(true);
    const handled = await pending;
    window.DungeonRewards.retryPending = originalRetry;
    return {
      handled,
      eventPending: !!window.state.flags.littleElranaUnlockPending,
      hallModal: window.state.hallModal,
      bankCalls: window.__dungeonCoreCalls.filter(call => call.method === "bankRun").length,
    };
  });
  expect(result).toEqual({
    handled: false,
    eventPending: false,
    hallModal: null,
    bankCalls: 0,
  });
});

test("Little Elrana encounter still completes while owning its node", async ({ page }) => {
  test.setTimeout(120000);
  await startDungeon(page);
  const firstId = await ensureFirstBattleNode(page);
  await page.evaluate(nodeId => {
    const run = window.state.explore;
    run.party = ["elrana"];
    run.activeParty = ["elrana"];
    window.state.chars.find(item => item.id === "elrana").locked = false;
    window.state.chars.find(item => item.id === "little_elrana").locked = true;
    delete window.state.flags.littleElranaUnlockSeen;
    delete window.state.flags.littleElranaUnlockPending;
    window.DungeonEvents.nodes(run).find(node => node.id === nodeId).enemies = [{ id: "elrana_clone" }];
    window.render();
  }, firstId);
  await page.locator(`[data-dungeon-node='${firstId}']`).click();
  await expect.poll(() => page.evaluate(() => ({
    explore: !!window.state.explore,
    eventPending: !!window.state.flags.littleElranaUnlockPending,
    hallModal: window.state.hallModal,
    view: window.state.view,
    bankCalls: window.__dungeonCoreCalls.filter(call => call.method === "bankRun").length,
  }))).toEqual({
    explore: false,
    eventPending: true,
    hallModal: "littleElranaUnlock",
    view: "hall",
    bankCalls: 1,
  });
});

test("dungeon retreat immediately unlocks all hall navigation", async ({ page }) => {
  const errors = collectErrors(page);
  await startDungeon(page);
  await page.evaluate(() => {
    window.state.explore.earned.gold = 100;
    window.render();
  });
  await expect(page.locator("#resources")).toContainText("待结算 +100");

  await page.locator("[data-dungeon-retreat]").click();
  await page.locator("[data-confirm-ok]").click();
  await expect(page.locator(".villa-hall")).toBeVisible();

  const nav = page.locator("#nav [data-view]");
  await expect(nav).toHaveCount(3);
  for (const view of ["nursery", "livingRoom", "furnace"]) {
    await expect(page.locator(`#nav [data-view='${view}']`)).toBeEnabled();
  }
  await page.locator("#nav [data-view='livingRoom']").click();
  await expect(page.locator(".living-room")).toBeVisible();
  expect(relevantErrors(errors)).toEqual([]);
});
