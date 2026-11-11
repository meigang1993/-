// 实机检查：伊迪斯去水印立绘真实加载 + 四副本篝火落位 + 水下列车精英层随机
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const { openGame, startFreshGame } = require("../tests/helpers/preview-game.js");

let pass = 0, total = 0;
const T = (name, ok, extra) => {
  total++;
  if (ok) { pass++; console.log(`✅ ${name}`); }
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!ok;
};
const IDS = ["machine_factory", "underwater_train", "orc_dungeon", "ruins_sand_city"];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await openGame(page);
    await startFreshGame(page);
    const out = await page.evaluate(async () => {
      await Promise.all([window.GameBundles.load("battle"), window.GameBundles.load("dungeon")]);
      const edis = (window.GameData.enemies.machine_factory || []).find(e => e.id === "pursuer_edis");
      const art = edis?.art || "";
      const img = new Image(); img.src = art;
      let decoded = true;
      try { await img.decode(); } catch (err) { decoded = false; }
      const missions = window.GameData.missions;
      const diff = window.GameData.difficulties.normal;
      const routes = {};
      for (const id of ["machine_factory", "underwater_train", "orc_dungeon", "ruins_sand_city"]) {
        const m = missions.find(x => x.id === id);
        const layers = window.DungeonMap.buildLayers(m, diff, window.state);
        const flat = layers.flat();
        routes[id] = {
          rest: flat.filter(n => n.type === "rest").map(n => n.layer),
          boss: flat.filter(n => n.type === "boss").map(n => n.layer),
          chest: flat.filter(n => n.type === "chest").map(n => n.layer),
          routeRest: m.route.rest,
          mixedEliteFrom: m.route.mixedEliteFrom ?? null,
        };
      }
      const uw = missions.find(x => x.id === "underwater_train");
      const sets = [], union = new Set();
      for (let i = 0; i < 40; i++) {
        window.state.random = { version: 1, seed: (1000 + i * 7919) >>> 0, cursor: 0 };
        const layers = window.DungeonMap.buildLayers(uw, diff, window.state);
        const e = layers.flat().filter(n => n.type === "elite").map(n => n.layer);
        sets.push(e); e.forEach(L => union.add(L));
      }
      return {
        art, decoded, complete: img.complete, w: img.naturalWidth, h: img.naturalHeight,
        routes, eliteUnion: [...union].sort((a, b) => a - b),
        eliteDistinct: new Set(sets.map(s => s.join(","))).size,
      };
    }, {});

    T("A1 伊迪斯 art 指向新图且旧名清零",
      /pursuer-edis\.[a-f0-9]{8}\.webp/.test(out.art) && !out.art.includes("8062b085"), out.art);
    T("A2 新立绘在浏览器真实解码为 1536×1536",
      out.decoded && out.complete && out.w === 1536 && out.h === 1536,
      { decoded: out.decoded, complete: out.complete, w: out.w, h: out.h });
    for (const id of IDS) {
      const r = out.routes[id];
      T(`B ${id}: 篝火全部落在 BOSS 前一层`,
        r.rest.length > 0 && r.rest.every(L => L === r.boss[0] - 1),
        { rest: r.rest, boss: r.boss, chest: r.chest });
      T(`B ${id}: 篝火不压宝箱`, !r.chest.some(L => r.rest.includes(L)), r);
    }
    T("C1 水下列车不再配置 mixedEliteFrom",
      out.routes.underwater_train.mixedEliteFrom === null, out.routes.underwater_train);
    T("C2 水下列车精英覆盖 11 层之前", out.eliteUnion.some(L => L < 11), out.eliteUnion);
    T("C3 水下列车精英覆盖 11 层及之后", out.eliteUnion.some(L => L >= 11), out.eliteUnion);
    T("C4 水下列车精英位置随种子变化", out.eliteDistinct > 1, { distinct: out.eliteDistinct });
    T("D 无页面错误", errors.length === 0, errors.slice(0, 3));
    console.log(`\n通过 ${pass}/${total}`);
    if (pass !== total) process.exitCode = 1;
  } catch (err) {
    console.error("运行失败:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
