const fs = require("fs");
const path = require("path");
require("./repository-toolchain");
const { chromium } = require("@playwright/test");

const root = path.resolve(__dirname, "..");
const rounds = Math.max(1, Number(process.env.SOAK_ROUNDS || 20));
const output = path.join(root, ".qa-artifacts", "soak", "battle.json");

async function heapSize(session) {
  await session.send("HeapProfiler.collectGarbage");
  await session.send("Performance.enable");
  const result = await session.send("Performance.getMetrics");
  return Object.fromEntries(result.metrics.map(item => [item.name, item.value]));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", error => errors.push(error.message));
  await page.context().setOffline(true);
  await page.addInitScript(() => {
    let seed = 2971485;
    Math.random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  });
  await page.goto(`file://${path.join(root, "publish", "index.html")}`);
  await page.locator("[data-start-game]").click();
  await page.locator(".villa-hall").waitFor({ state: "visible" });
  await page.evaluate(() => window.GameBundles.load("battle"));
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
  });
  const session = await page.context().newCDPSession(page);
  const initial = await heapSize(session);
  const samples = [];
  for (let round = 1; round <= rounds; round += 1) {
    const state = await page.evaluate(async () => {
      const enemy = { ...window.GameData.enemies.machine_factory[0], speed: -1000 };
      await window.BattleSystem.start(window.state, "machine_factory", window.render, {
        test: true,
        allyIds: ["lokar", "besta_doll"],
        enemies: [enemy],
      });
      window.render();
      const battle = window.state.battle;
      const result = {
        view: window.state.view,
        allies: battle?.allies.length,
        enemies: battle?.enemies.length,
        activeUid: battle?.activeUid,
        locked: battle?.locked,
        nodes: document.getElementsByTagName("*").length,
      };
      window.BattleSystem.retreat(window.state);
      window.BattleEffects.recover?.(window.state);
      window.render();
      return result;
    });
    if (state.view !== "battle" || state.allies !== 2 || state.enemies !== 1 || state.locked) {
      throw new Error(`soak round ${round} produced invalid battle state: ${JSON.stringify(state)}`);
    }
    const metrics = await heapSize(session);
    samples.push({ round, heap: metrics.JSHeapUsedSize || 0, nodes: state.nodes });
  }
  const final = samples[samples.length - 1];
  const heapGrowth = final.heap - (initial.JSHeapUsedSize || 0);
  const maxNodes = Math.max(...samples.map(sample => sample.nodes));
  await browser.close();
  if (errors.length) throw new Error(`battle soak emitted errors: ${errors.join(" | ")}`);
  if (heapGrowth > 24 * 1024 * 1024) throw new Error(`battle soak heap grew ${(heapGrowth / 1048576).toFixed(1)} MiB`);
  if (maxNodes > 6000) throw new Error(`battle soak DOM grew to ${maxNodes} nodes`);
  const report = {
    measuredAt: new Date().toISOString(),
    rounds,
    initialHeap: initial.JSHeapUsedSize || 0,
    finalHeap: final.heap,
    heapGrowth,
    maxNodes,
    samples,
  };
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Battle soak passed: ${rounds} rounds, heap growth ${(heapGrowth / 1048576).toFixed(1)} MiB`);
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
