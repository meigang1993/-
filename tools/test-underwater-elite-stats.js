// 水下列车精英出现统计（真实 DungeonMap.buildLayers，非模拟）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
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
    for (const diffId of ["normal", "hell"]) {
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

  // 断言：此前本脚本只打印统计、恒退出 0（无拦截力），现补齐真实校验
  const fails = [];
  const t = (name, ok, info) => {
    if (!ok) fails.push(`${name}${info ? " | " + info : ""}`);
    console.log(`${ok ? "✅" : "❌"} ${name}${info ? " | " + info : ""}`);
  };
  t("无页面错误", errors.length === 0, errors.slice(0, 3).join("; "));
  t("两个难度都统计到", Object.keys(out).length === 2, `实际 ${Object.keys(out).join(",")}`);
  const mids = Object.keys(out.normal || {});
  t("副本全部统计到", mids.length >= 4, `实际 ${mids.length} 个: ${mids.join(",")}`);
  for (const mid of mids) {
    const n = out.normal[mid], h = out.hell?.[mid];
    t(`${mid} 普通级存在精英节点`, n && n.avg > 0, `avg=${n?.avg}`);
    t(`${mid} 英雄级精英不少于普通级`, h && n && h.avg >= n.avg,
      `normal=${n?.avg} hell=${h?.avg}`);
  }

  console.log(`\n结果: ${fails.length ? "失败 " + fails.length + " 项" : "全部通过"}`);
  await browser.close();
  process.exitCode = fails.length ? 1 : 0;
})();
