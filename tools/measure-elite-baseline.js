/* global GameData */

// 量化 4 个副本每次生成的精英节点数（修复前基线）
const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();

[
  "dungeon-map.js",
  "dungeon-enemies.js",
  "data-ruins-sand-city-enemies.js",
  "data-ruins-content.js",
  "data-ruins-sand-city.js",
  "data-future-dungeons.js",
].forEach(f => vm.runInThisContext(
  fs.readFileSync(`./src/original/${f}`, "utf8"), { filename: f },
));
if (!GameData.enemies.ruins_sand_city) {
  GameData.enemies.ruins_sand_city = window.GameDataRuinsSandCity.enemies;
}

// 4 个副本的 mission 对象
const missions = {
  machine_factory: GameData.missions.find(m => m.id === "machine_factory"),
  underwater_train: GameData.missions.find(m => m.id === "underwater_train"),
  orc_dungeon: (window.GameDataFutureDungeons || []).find(m => m.id === "orc_dungeon"),
  ruins_sand_city: window.GameDataRuinsSandCity.mission,
};

const DIFFS = ["normal", "adventure", "warrior", "king", "hell"];
const N = 200;

function countRun(mission, diffId) {
  const diff = GameData.difficulties[diffId];
  const layers = window.DungeonMap.buildLayers(mission, diff, window.state);
  const nodes = layers.flat();
  const counts = {};
  nodes.forEach(n => { counts[n.type] = (counts[n.type] || 0) + 1; });
  return { total: nodes.length, elite: counts.elite || 0, normal: counts.normal || 0, layers: layers.length };
}

console.log("===== 每个副本 × 每个难度，200 次生成的平均精英节点数 =====");
console.log("副本                 路由            难度        节点/局   精英/局   普通/局");
const results = {};
for (const [id, mission] of Object.entries(missions)) {
  if (!mission) { console.log(`${id}: mission 未找到`); continue; }
  const rtype = mission.route?.type || "(default)";
  results[id] = {};
  for (const d of DIFFS) {
    let sumTotal = 0, sumElite = 0, sumNormal = 0, layers = 0;
    for (let i = 0; i < N; i++) {
      const r = countRun(mission, d);
      sumTotal += r.total; sumElite += r.elite; sumNormal += r.normal; layers = r.layers;
    }
    results[id][d] = { total: sumTotal / N, elite: sumElite / N, normal: sumNormal / N, layers };
    console.log(
      `${id.padEnd(20)} ${rtype.padEnd(14)} ${d.padEnd(10)} ` +
      `${(sumTotal / N).toFixed(1).padStart(7)} ${(sumElite / N).toFixed(2).padStart(9)} ${(sumNormal / N).toFixed(1).padStart(9)}`
    );
  }
  console.log("");
}

console.log("===== 结论 =====");
for (const [id, r] of Object.entries(results)) {
  const e = Object.entries(r).map(([d, v]) => `${d}:${v.elite.toFixed(1)}`).join(" ");
  console.log(`${id.padEnd(20)} 精英/局  ${e}`);
}
