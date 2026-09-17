const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto("file://" + path.resolve("publish/index.html"));
  await page.waitForTimeout(3000);

  // dungeon bundle 是进入副本时才加载的，这里注入真实发布产物（非模拟）
  await page.addScriptTag({ path: path.resolve("publish/bundles/dungeon.min.js") });
  await page.waitForTimeout(500);
  const loaded = await page.evaluate(() => ({
    map: typeof window.DungeonMap,
    grp: typeof window.DungeonEnemyGroups,
    city: typeof window.GameDataRuinsSandCity,
  }));
  console.log("bundle 注入后:", JSON.stringify(loaded));

  // 直接调地图生成，读真实运行时的结构
  const result = await page.evaluate(() => {
    const w = window;
    const mission = w.GameDataRuinsSandCity?.mission;
    if (!mission) return { err: "GameDataRuinsSandCity 未加载" };
    const diff = w.GameData?.difficulties?.normal || Object.values(w.GameData?.difficulties || {})[0];
    const layers = w.DungeonMap.buildLayers(mission, diff, w.state);
    const typeAt = n => layers[n - 1].map(x => x.type).join(",");
    // 生成普通战斗敌人
    const run = { missionId: "ruins_sand_city", difficultyId: "normal" };
    const samples = [];
    for (let i = 0; i < 30; i++) {
      const g = w.DungeonEnemyGroups.enemiesFor(run, "normal", w.state);
      samples.push(g.map(e => `${e.name}${e.label || ""}`).join("+"));
    }
    return {
      layerCount: layers.length,
      l1: typeAt(1), l4: typeAt(4), l7: typeAt(7), l9: typeAt(9), l15: typeAt(15),
      shape: layers.map(l => l.length).join("-"),
      samples: samples.slice(0, 8),
      maxLen: Math.max(...samples.map(s => s.split("+").length)),
    };
  });

  console.log("=== 浏览器内实测 ===");
  if (result.err) { console.log("❌", result.err); await browser.close(); process.exit(1); }
  console.log(`层数: ${result.layerCount}`);
  console.log(`第1层=${result.l1}  第4层=${result.l4}  第7层=${result.l7}  第9层=${result.l9}  第15层=${result.l15}`);
  console.log(`节点布局: ${result.shape}`);
  console.log("普通战斗样本:");
  result.samples.forEach(s => console.log("  " + s));
  console.log(`页面错误: ${errors.length ? errors.join("; ") : "无"}`);
  await browser.close();
  const ok15 = result.layerCount === 15;
  const okFixed = result.l1==="start"&&result.l4==="rest"&&result.l7==="chest"&&result.l9==="rest"&&result.l15==="boss";
  console.log(ok15 && okFixed ? "\n✅ 浏览器实测与逻辑测试一致" : "\n❌ 不一致");
  process.exit(ok15 && okFixed && !errors.length ? 0 : 1);
})();
