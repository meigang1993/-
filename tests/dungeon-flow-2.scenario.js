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

test("late node start failure cannot roll back a successor node", async ({ page }) => {
  test.setTimeout(120000);
  await startDungeon(page);
  const firstId = await ensureFirstBattleNode(page);
  await page.evaluate(() => {
    const original = window.BattleSystem.start;
    let calls = 0;
    window.BattleSystem.start = async (...args) => {
      const result = await original(...args);
      calls += 1;
      if (calls === 1) {
        try {
          await new Promise((resolve, reject) => {
            window.__rejectFirstNodeStart = () => reject(new Error("late first-node failure"));
          });
        } finally {
          window.__firstNodeStartReleased = true;
        }
      }
      return result;
    };
  });
  await page.locator(`[data-dungeon-node='${firstId}']`).click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.evaluate(async () => {
    const battle = window.state.battle;
    battle.enemies.forEach(enemy => { enemy.hp = 0; });
    battle.defeatedEnemyIds = battle.enemies.map(enemy => enemy.ref || enemy.id).filter(Boolean);
    battle.animQueue = [];
    await window.BattleSystem.finishBattle(window.state, true);
    window.render();
  });
  await page.locator("[data-victory-continue]").click();
  await expect(page.locator(".dungeon-screen")).toBeVisible();
  await page.locator("[data-reward-confirm]").click();
  const next = await page.evaluate(() => {
    const run = window.state.explore;
    const nodes = window.DungeonEvents.nodes(run);
    return nodes.find(node => window.DungeonMap.canChoose(run, node.id))?.id;
  });
  expect(next).toBeTruthy();
  await page.locator(`[data-dungeon-node='${next}']`).click();
  await expect.poll(() => page.evaluate(id => window.state.explore?.pending, next)).toBe(next);
  await page.evaluate(() => window.__rejectFirstNodeStart());
  await expect.poll(() => page.evaluate(() => window.__firstNodeStartReleased)).toBe(true);
  const after = await page.evaluate(() => ({
    current: window.state.explore?.current,
    pending: window.state.explore?.pending,
    log: window.state.log[0],
  }));
  expect(after).toEqual({ current: next, pending: next, log: expect.not.stringContaining("late first-node failure") });
});

test("current node start failure clears partial battle and restores the node", async ({ page }) => {
  test.setTimeout(120000);
  await startDungeon(page);
  const firstId = await ensureFirstBattleNode(page);
  const previous = await page.evaluate(() => window.state.explore.current);
  await page.evaluate(() => {
    window.BattleEffects.whenIdle = async () => {
      throw new Error("injected current-node failure");
    };
  });
  await page.locator(`[data-dungeon-node='${firstId}']`).click();
  await expect.poll(() => page.evaluate(() => ({
    battle: !!window.state.battle,
    current: window.state.explore?.current,
    pending: window.state.explore?.pending,
    view: window.state.view,
  }))).toEqual({ battle: false, current: previous, pending: null, view: "dungeon" });
  await expect(page.locator(`[data-dungeon-node='${firstId}']`)).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.state.log[0]))
    .toContain("injected current-node failure");
});

test("handled encounter that keeps the run restores its pending node", async ({ page }) => {
  test.setTimeout(120000);
  await startDungeon(page);
  const firstId = await ensureFirstBattleNode(page);
  const previous = await page.evaluate(() => window.state.explore.current);
  await page.evaluate(() => {
    window.tryLittleElranaEncounter = async state => {
      state.log.unshift("injected encounter retry");
      return true;
    };
  });
  await page.locator(`[data-dungeon-node='${firstId}']`).click();
  await expect.poll(() => page.evaluate(() => ({
    battle: !!window.state.battle,
    current: window.state.explore?.current,
    pending: window.state.explore?.pending,
    view: window.state.view,
  }))).toEqual({ battle: false, current: previous, pending: null, view: "dungeon" });
  await expect(page.locator(`[data-dungeon-node='${firstId}']`)).toBeEnabled();
  await expect.poll(() => page.evaluate(() => window.state.log[0]))
    .toContain("injected encounter retry");
});

test("pending pre-battle encounter hides dungeon retreat controls", async ({ page }) => {
  test.setTimeout(120000);
  await startDungeon(page);
  const firstId = await ensureFirstBattleNode(page);
  await page.evaluate(() => {
    window.tryLittleElranaEncounter = async () => new Promise(resolve => {
      window.__releasePendingEncounter = () => resolve(true);
    });
  });
  await page.locator(`[data-dungeon-node='${firstId}']`).click();
  await expect(page.locator(".battle-loading")).toBeVisible();
  await expect(page.locator("[data-dungeon-retreat]")).toHaveCount(0);
  await expect(page.locator("#settings-toggle")).toBeHidden();
  await expect(page.locator("[data-settings-retreat]")).toHaveCount(0);
  await page.evaluate(() => window.__releasePendingEncounter());
  await expect(page.locator(".dungeon-screen")).toBeVisible();
  await expect(page.locator(`[data-dungeon-node='${firstId}']`)).toBeEnabled();
});
