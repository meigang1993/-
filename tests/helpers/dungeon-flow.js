const path = require("path");
const { expect } = require("@playwright/test");

const gameUrl = `file://${path.resolve(__dirname, "../../publish/index.html")}`;

function collectErrors(page) {
  const errors = [];
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", error => errors.push(error.message));
  return errors;
}

function relevantErrors(errors) {
  return errors.filter(text => !/favicon|ResizeObserver loop/.test(text));
}

function bestCoveragePath(nodes, startId) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const targetTypes = new Set(["normal", "elite", "rest", "chest", "boss"]);
  function walk(id, seen) {
    const node = byId.get(id);
    if (!node?.next?.length) return { path: [], seen };
    return node.next.map(nextId => {
      const next = byId.get(nextId);
      const nextSeen = new Set(seen);
      if (targetTypes.has(next?.type)) nextSeen.add(next.type);
      const tail = walk(nextId, nextSeen);
      return { path: [next, ...tail.path], seen: tail.seen };
    }).sort((a, b) => b.seen.size - a.seen.size)[0];
  }
  return walk(startId, new Set()).path;
}

async function startDungeon(page) {
  await page.context().setOffline(true);
  await page.addInitScript(() => {
    let value = 2971485;
    Math.random = () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  });
  await page.goto(gameUrl);
  await page.locator("#view").waitFor({ state: "visible" });
  await expect.poll(() => page.evaluate(() => ({
    online: navigator.onLine,
    dzmm: typeof window.dzmm,
  }))).toEqual({ online: false, dzmm: "undefined" });
  await page.locator("[data-start-game]").click();
  await expect(page.locator(".villa-hall")).toBeVisible();
  await page.evaluate(() => Promise.all([
    window.GameBundles.load("battle"),
    window.GameBundles.load("dungeon"),
  ]));
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    const originalCall = window.ServerCore.call;
    window.__dungeonCoreCalls = [];
    window.ServerCore.call = async (method, args, state) => {
      window.__dungeonCoreCalls.push({ method, nodeId: args?.nodeId || null });
      return originalCall(method, args, state);
    };
  });
  await page.locator("[data-open-modal='team']").first().click();
  await page.locator("[data-start='machine_factory'][data-difficulty='normal']").click();
  await expect(page.locator(".dungeon-screen")).toBeVisible();
}

async function clickTwice(page, selector) {
  await page.locator(selector).evaluate(element => {
    element.click();
    element.click();
  });
}

module.exports = {
  collectErrors,
  relevantErrors,
  bestCoveragePath,
  startDungeon,
  clickTwice,
};
