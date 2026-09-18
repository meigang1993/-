// 水下列车精英出现统计（真实 DungeonMap.buildLayers，非模拟）
const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto("file://" + path.resolve(__dirname, "..", "publish/index.html"));
  await page.locator("#view").waitFor({ state: "visible" });
  await page.waitForTimeout(2500);
  await page.locator("[data-start-game]").click();
  await page.locator(".villa-hall").waitFor({ state: "visible" });
  await page.evaluate(() => Promise.all([window.GameBundles.load("battle"), window.GameBundles.load("dungeon")]));
  await page.waitForTimeout(500);

  const out = await page.evaluate(() => {
    const w = window;
    const missions = w.GameData.missions.filter(m => m.kind === "dungeon");
    const report = {};
    for (const diffId of ["normal", "hero"]) {
      const diff = w.GameData.difficulties[diffId];
      if (!diff) continue;
      report[diffId] = {};
      for (const m of missions) {
        let eliteTotal = 0, zeroRuns = 0, eliteLayers = {};
        const RUNS = 200;
        for (let i = 0; i < RUNS; i++) {
          const layers = w.DungeonMap.buildLayers(m, diff, w.state);
          const all = layers.flat();
          const e = all.filter(n => n.type === "elite");
          if (!e.length) zeroRuns++;
          e.forEach(n => { eliteLayers[n.layer] = (eliteLayers[n.layer] || 0) + 1; });
          eliteTotal += e.length;
        }
        report[diffId][m.id] = {
          avg: +(eliteTotal / RUNS).toFixed(2),
          zeroRuns,
          rate: diff.eliteRate,
          layers: Object.keys(eliteLayers).sort((a, b) => a - b).join(","),
        };
      }
    }
    return report;
  });

  console.log("=== 各副本精英节点统计（200 局/格）===");
  for (const [diffId, data] of Object.entries(out)) {
    console.log(`\n[${diffId}] eliteRate=${Object.values(data)[0]?.rate}`);
    for (const [mid, v] of Object.entries(data)) {
      console.log(`  ${mid.padEnd(20)} 平均 ${String(v.avg).padStart(5)} 个/局   0精英局数 ${String(v.zeroRuns).padStart(3)}/200   精英出现层: ${v.layers || "无"}`);
    }
  }
  console.log(`\n页面错误: ${errors.length ? errors.join("; ") : "无"}`);
  await browser.close();
})();
