// 实战核查：水下列车 / 兽人地下城 / 废墟沙城 是否会随机出现精英怪节点
//   A) 三个副本在多个随机种子下，精英节点是否出现、出现位置是否随种子变化
//   B) 精英节点只会落在非固定层（rest / chest / boss / start 不应出现精英）
//   C) 水下列车为 linear 路线，精英受 mixedEliteFrom 限制
//   D) 精英战的敌人组合是否在多个组合间随机（不是每次同一个）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const { openGame, startFreshGame } = require("../tests/helpers/preview-game.js");

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!cond;
};

const TARGETS = ["underwater_train", "orc_dungeon", "ruins_sand_city"];
const DIFFS = ["normal", "adventure", "warrior"];
const SEEDS = Array.from({ length: 40 }, (_, i) => 1000 + i * 7919);

// 用指定种子建图，返回精英节点的层号与节点数
const buildWithSeed = (page, missionId, difficultyId, seed) => page.evaluate(
  ({ missionId, difficultyId, seed }) => {
    const s = window.state;
    s.random = { version: 1, seed: seed >>> 0, cursor: 0 };
    const mission = window.GameData.missions.find(m => m.id === missionId);
    const diff = window.GameData.difficulties[difficultyId];
    const layers = window.DungeonMap.buildLayers(mission, diff, s);
    const eliteLayers = [];
    let eliteCount = 0;
    layers.forEach((layer, i) => {
      const n = layer.filter(x => x.type === "elite").length;
      if (n > 0) { eliteLayers.push(i + 1); eliteCount += n; }
    });
    return {
      layers: layers.length,
      eliteLayers, eliteCount,
      total: layers.flat().length,
      types: layers.flat().map(n => n.type),
      route: mission?.route?.type || "default",
      mixedEliteFrom: mission?.route?.mixedEliteFrom ?? null,
      rest: mission?.route?.rest || [], chest: mission?.route?.chest || [], boss: mission?.route?.boss || [],
    };
  }, { missionId, difficultyId, seed });

// 精英战敌人组合抽样
const eliteGroups = (page, missionId, difficultyId, times) => page.evaluate(
  ({ missionId, difficultyId, times }) => {
    const s = window.state;
    const run = { missionId, difficultyId };
    const seen = {};
    for (let i = 0; i < times; i++) {
      s.random = { version: 1, seed: (555 + i * 131) >>> 0, cursor: 0 };
      const list = window.DungeonEnemyGroups.enemiesFor(run, "elite", s);
      const key = (list || []).map(e => e.id || e.name).join("+");
      seen[key] = (seen[key] || 0) + 1;
    }
    return seen;
  }, { missionId, difficultyId, times });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await openGame(page);
    await startFreshGame(page);
    // 关闭新手保护：它会把第一可选层强制为普通战斗，干扰精英随机性统计
    await page.evaluate(() => {
      if (window.Onboarding?.complete) window.Onboarding.complete(window.state);
      else if (window.state?.flags) window.state.flags.onboarding = null;
    });

    const summary = {};
    for (const missionId of TARGETS) {
      summary[missionId] = {};
      for (const difficultyId of DIFFS) {
        const runs = [];
        for (const seed of SEEDS) {
          runs.push(await buildWithSeed(page, missionId, difficultyId, seed));
        }
        const withElite = runs.filter(r => r.eliteCount > 0);
        const layerSets = new Set(withElite.map(r => r.eliteLayers.join(",")));
        const counts = new Set(withElite.map(r => r.eliteCount));
        summary[missionId][difficultyId] = {
          route: runs[0].route,
          mixedEliteFrom: runs[0].mixedEliteFrom,
          mapsWithElite: withElite.length,
          totalMaps: runs.length,
          eliteCountRange: [Math.min(...runs.map(r => r.eliteCount)), Math.max(...runs.map(r => r.eliteCount))],
          distinctLayerSets: layerSets.size,
          distinctCounts: counts.size,
          eliteLayerUnion: [...new Set(withElite.flatMap(r => r.eliteLayers))].sort((a, b) => a - b),
          // 固定层不应出现精英
          fixedLayers: { rest: runs[0].rest, chest: runs[0].chest, boss: runs[0].boss },
          eliteOnFixed: [...new Set(withElite.flatMap(r => r.eliteLayers))]
            .filter(l => [1, ...runs[0].rest, ...runs[0].chest, ...runs[0].boss].includes(l)),
        };
      }
    }

    console.log("\n===== 精英节点统计 =====");
    for (const missionId of TARGETS) {
      for (const difficultyId of DIFFS) {
        const s = summary[missionId][difficultyId];
        console.log(`${missionId}/${difficultyId} route=${s.route} eliteFrom=${s.mixedEliteFrom} ` +
          `有精英地图=${s.mapsWithElite}/${s.totalMaps} 精英数=${s.eliteCountRange[0]}~${s.eliteCountRange[1]} ` +
          `层集合种类=${s.distinctLayerSets} 精英层并集=[${s.eliteLayerUnion}] 固定层=${JSON.stringify(s.fixedLayers)}`);
      }
    }

    console.log("\n===== 断言 =====");
    for (const missionId of TARGETS) {
      for (const difficultyId of DIFFS) {
        const s = summary[missionId][difficultyId];
        const tag = `${missionId}/${difficultyId}`;
        T(`${tag} 精英节点会出现`, s.mapsWithElite > 0, s);
        T(`${tag} 精英数量随种子变化（随机而非固定）`, s.distinctCounts > 1, s);
        T(`${tag} 精英位置随种子变化`, s.distinctLayerSets > 1, s);
        T(`${tag} 固定层(起点/休整/宝箱/BOSS)不出精英`, s.eliteOnFixed.length === 0, s);
      }
    }

    // 水下列车：linear 且限制 mixedEliteFrom=11，精英只应在 11 层及以后、BOSS 层之前
    const uw = summary.underwater_train.normal;
    T("水下列车 精英受 mixedEliteFrom(11) 限制，只出现在 11 层之后",
      uw.eliteLayerUnion.every(l => l >= 11), uw);
    T("水下列车 精英不出现在 BOSS 层(15)", !uw.eliteLayerUnion.includes(15), uw);

    console.log("\n===== 精英敌人组合 =====");
    for (const missionId of TARGETS) {
      const g = await eliteGroups(page, missionId, "normal", 24);
      const keys = Object.keys(g);
      console.log(`${missionId} 组合种类=${keys.length} ${JSON.stringify(g)}`);
      T(`${missionId} 精英敌人组合有多个（随机）`, keys.length > 1, g);
      T(`${missionId} 精英敌人在多个种子下都非空`, keys.every(k => k.length > 0), g);
    }

    console.log(`\n通过 ${pass}/${total}`);
    if (pass !== total) process.exitCode = 1;
  } catch (err) {
    console.error("运行失败:", err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
