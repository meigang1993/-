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

test("machine factory completes end to end without duplicate settlement", async ({ page }) => {
  test.setTimeout(120000);
  const errors = collectErrors(page);
  await startDungeon(page);
  const initial = await page.evaluate(() => ({
    resources: JSON.parse(JSON.stringify(window.state.resources)),
    layers: window.state.explore.layers.length,
    current: window.state.explore.current,
    nodes: window.DungeonEvents.nodes(window.state.explore).map(node => ({
      id: node.id, type: node.type, layer: node.layer, next: [...node.next],
    })),
  }));
  const mapVisual = await page.evaluate(() => ({
    links: document.querySelectorAll(".map-link").length,
    reachable: document.querySelectorAll(".map-link.reachable").length,
    open: document.querySelectorAll(".map-node.open").length,
    blocked: document.querySelectorAll(".map-node.blocked").length,
    currentDone: document.querySelectorAll(".map-node.current.done").length,
    normalIcon: document.querySelector(".map-node.normal .node-glyph")?.classList.contains("icon-normal"),
    iconPaths: document.querySelectorAll(".map-node .node-glyph path, .map-node .node-glyph circle, .map-node .node-glyph rect").length,
  }));
  await expect.poll(() => page.evaluate(() => {
      const map = document.querySelector(".tower-map")?.getBoundingClientRect();
      const current = document.querySelector(".map-node.current")?.getBoundingClientRect();
      return !!map && !!current && current.top >= map.top && current.bottom <= map.bottom;
  })).toBe(true);
  expect(mapVisual.links).toBe(initial.nodes.reduce((sum, node) => sum + node.next.length, 0));
  expect(mapVisual.reachable).toBe(mapVisual.open);
  expect(mapVisual.blocked).toBeGreaterThan(0);
  expect(mapVisual.currentDone).toBe(1);
  expect(mapVisual.normalIcon).toBe(true);
  expect(mapVisual.iconPaths).toBeGreaterThan(0);
  const plannedPath = bestCoveragePath(initial.nodes, initial.current);
  const visited = [];

  for (let guard = 0; guard < initial.layers + 2; guard += 1) {
    const planned = plannedPath[guard];
    const status = await page.evaluate(id => ({
      complete: window.state.explore.complete,
      done: window.DungeonEvents.nodes(window.state.explore).filter(node => node.done).length,
      open: window.DungeonMap.canChoose(window.state.explore, id),
    }), planned?.id);
    if (status.complete) break;
    expect(planned?.id).toBeTruthy();
    expect(status.open).toBe(true);

    const beforeCalls = await page.evaluate(() => window.__dungeonCoreCalls.length);
    await page.locator(`[data-dungeon-node='${planned.id}']`).evaluate(element => element.click());
    const node = await page.evaluate(() => {
      const run = window.state.explore;
      const current = window.DungeonEvents.nodes(run).find(item => item.id === run.pending);
      return { id: current.id, type: current.type, layer: current.layer };
    });
    visited.push(node);

    if (["normal", "elite", "boss"].includes(node.type)) {
      await expect(page.locator(".battle-screen")).toBeVisible();
      await page.evaluate(async () => {
        const battle = window.state.battle;
        battle.enemies.forEach(enemy => { enemy.hp = 0; });
        battle.defeatedEnemyIds = battle.enemies.map(enemy => enemy.ref || enemy.id).filter(Boolean);
        battle.animQueue = [];
        await window.BattleSystem.finishBattle(window.state, true);
        await window.BattleSystem.finishBattle(window.state, true);
        window.render();
      });
      await expect(page.locator("[data-victory-continue]")).toBeVisible();
      await clickTwice(page, "[data-victory-continue]");
      await expect(page.locator(".dungeon-screen")).toBeVisible();
    } else if (node.type === "chest") {
      await expect(page.locator("[data-node-claim='chest']")).toBeVisible();
      await clickTwice(page, "[data-node-claim='chest']");
    } else if (node.type === "rest") {
      await expect(page.locator("[data-rest-choice]")).toBeVisible();
      await clickTwice(page, "[data-rest-choice]");
    } else {
      throw new Error(`Unexpected dungeon node type: ${node.type}`);
    }

    await expect.poll(() => page.evaluate(id => {
      const run = window.state.explore;
      const current = window.DungeonEvents.nodes(run).find(item => item.id === id);
      return { done: current.done, pending: run.pending, current: run.current };
    }, node.id)).toEqual({ done: true, pending: null, current: node.id });
    if (node.type === "rest") {
      await expect(page.locator("[data-reward-confirm]")).toHaveCount(0);
    } else {
      await expect(page.locator("[data-reward-confirm]")).toBeVisible();
      await page.locator("[data-reward-confirm]").click();
      await expect(page.locator("[data-reward-confirm]")).toHaveCount(0);
    }
    if (node.layer === initial.layers - 1) {
      await expect(page.locator(`[data-dungeon-node='${node.id}']`)).toBeDisabled();
      await expect(page.locator(`[data-dungeon-node='${node.id}']`)).toContainText(`第${node.layer}层 · 已完成`);
      await expect(page.locator(".map-node.boss.open")).toBeEnabled();
      await expect(page.locator(".map-node.boss.open")).toContainText(`第${initial.layers}层`);
    }

    const after = await page.evaluate(({ id, done }) => {
      const run = window.state.explore;
      return {
        done: window.DungeonEvents.nodes(run).filter(item => item.done).length,
        nodeDone: window.DungeonEvents.nodes(run).find(item => item.id === id)?.done,
        calls: window.__dungeonCoreCalls.slice(done),
      };
    }, { id: node.id, done: beforeCalls });
    expect(after.done).toBe(status.done + 1);
    expect(after.nodeDone).toBe(true);
    const previousId = guard ? plannedPath[guard - 1].id : initial.current;
    await expect(page.locator(`.map-link.passed[data-from='${previousId}'][data-to='${node.id}']`)).toHaveCount(1);
    const settleCalls = after.calls.filter(call => call.method === "settleDungeon");
    expect(settleCalls).toHaveLength(node.type === "rest" ? 0 : 1);
    if (settleCalls.length) expect(settleCalls[0].nodeId).toBe(node.id);
  }

  const beforeFinish = await page.evaluate(() => {
    const run = window.state.explore;
    window.__finishedDungeonRun = run;
    run.party.forEach(id => {
      const character = window.state.chars.find(item => item.id === id);
      if (character) character.hp = 1;
    });
    window.render();
    return {
      complete: run.complete,
      currentType: window.DungeonEvents.nodes(run).find(node => node.id === run.current)?.type,
      earned: JSON.parse(JSON.stringify(run.earned)),
      pending: JSON.parse(JSON.stringify(window.state._localPendingRun)),
      resources: JSON.parse(JSON.stringify(window.state.resources)),
      bankCalls: window.__dungeonCoreCalls.filter(call => call.method === "bankRun").length,
    };
  });
  expect(beforeFinish.complete).toBe(true);
  expect(beforeFinish.currentType).toBe("boss");
  expect(visited).toHaveLength(initial.layers - 1);
  const visitedTypes = new Set(visited.map(node => node.type));
  expect(visitedTypes.has("boss")).toBe(true);
  expect(visitedTypes.has("normal") || visitedTypes.has("elite")).toBe(true);
  expect([...visitedTypes].every(type => ["normal", "elite", "rest", "chest", "boss"].includes(type))).toBe(true);
  expect(beforeFinish.earned.gold).toBeGreaterThan(0);
  expect(beforeFinish.pending.gold).toBe(beforeFinish.earned.gold);
  expect(beforeFinish.pending.essence).toBe(beforeFinish.earned.essence);
  expect(beforeFinish.resources).toEqual(initial.resources);

  await expect(page.locator("[data-dungeon-finish]")).toBeVisible();
  await clickTwice(page, "[data-dungeon-finish]");
  await expect(page.locator(".villa-hall")).toBeVisible();
  const finished = await page.evaluate(async () => {
    const snapshot = {
      resources: JSON.parse(JSON.stringify(window.state.resources)),
      pending: JSON.parse(JSON.stringify(window.state._localPendingRun)),
      bankCalls: window.__dungeonCoreCalls.filter(call => call.method === "bankRun").length,
      healed: window.__finishedDungeonRun.party.every(id => {
        const character = window.state.chars.find(item => item.id === id);
        return character && character.hp === character.stats.maxHp;
      }),
      adventure: window.state.unlockedDifficulties.includes("adventure"),
      explore: window.state.explore,
    };
    const replay = await window.ServerCore.call("bankRun", { run: window.__finishedDungeonRun }, window.state);
    snapshot.afterReplay = JSON.parse(JSON.stringify(window.state.resources));
    snapshot.replayChanged = replay.changed;
    return snapshot;
  });
  expect(finished.bankCalls - beforeFinish.bankCalls).toBe(1);
  expect(finished.resources.gold - beforeFinish.resources.gold).toBe(beforeFinish.earned.gold);
  expect(finished.resources.essence - beforeFinish.resources.essence).toBe(beforeFinish.earned.essence);
  expect(finished.pending).toEqual({ gold: 0, essence: 0, cards: [], relics: [] });
  expect(finished.afterReplay).toEqual(finished.resources);
  expect(finished.replayChanged).toBe(false);
  expect(finished.healed).toBe(true);
  expect(finished.adventure).toBe(true);
  expect(finished.explore).toBeNull();
  expect(relevantErrors(errors)).toEqual([]);
});
