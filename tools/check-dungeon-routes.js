/* global GameData */

// 检查四个副本的路线节点是否正常：
//  1. 层数 / 固定节点（起点、休整、宝箱、BOSS）落位是否与配置一致
//  2. 连通性：每个节点都能从起点走到（可达），且都能走到 BOSS（无死路）
//  3. next 引用的 id 必须真实存在（悬空引用会让 canChoose 永远为 false）
//  4. 节点类型合法、起点与 BOSS 唯一
// 路线是随机的，故每个副本 x 每个难度重复采样多轮，而不是只看一次结果。
const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();

[
  "data-world.js",
  "dungeon-map.js",
  "dungeon-enemies.js",
  "data-machine-factory-enemies.js",
  "data-underwater-train-enemies.js",
  "data-ruins-sand-city-enemies.js",
  "data-future-enemies.js",
  "data-future-orc-enemies.js",
  "data-future-dungeons.js",
  "data-guard-kelly.js",
  "data-orc-bondi.js",
  "data-sakura-risa.js",
  "data-bakar-enemy.js",
  "data-ruins-content.js",
  "data-ruins-sand-city.js",
].forEach(f => vm.runInThisContext(fs.readFileSync(`./src/original/${f}`, "utf8"), { filename: f }));

for (const m of (window.GameDataFutureDungeons || [])) {
  if (!GameData.missions.some(x => x.id === m.id)) GameData.missions.push(m);
}
Object.assign(GameData.enemies, window.GameDataFutureEnemies || {});
if (window.GameDataRuinsSandCity?.mission && !GameData.missions.some(x => x.id === "ruins_sand_city")) {
  GameData.missions.push(window.GameDataRuinsSandCity.mission);
}

const ROUNDS = 120;
const VALID = ["start", "normal", "elite", "rest", "chest", "boss"];
const results = [];
const findings = [];
const check = (name, ok, evidence = "") => results.push({ name, ok, evidence });

// 期望的路线配置：与 data-world.js / data-future-dungeons.js / data-ruins-sand-city.js 对齐
const EXPECT = {
  machine_factory: { layers: 10, rest: [5], chest: [8], type: "fixed-random" },
  underwater_train: { layers: 15, rest: [10], chest: [8], type: "linear" },
  orc_dungeon: { layers: 13, rest: [9], chest: [7], type: "fixed-random" },
  ruins_sand_city: { layers: 15, rest: [4, 9], chest: [7], type: "fixed-random" },
};

const MISSIONS = ["machine_factory", "underwater_train", "orc_dungeon", "ruins_sand_city"];
const DIFFS = ["normal", "adventure", "warrior", "king", "hell"];

// ---------- 辅助 ----------
const flat = layers => layers.flat();
function reachSet(layers, fromId) {
  // 正向可达：从 fromId 出发沿 next 能走到的全部节点
  const all = flat(layers), byId = new Map(all.map(n => [n.id, n]));
  const seen = new Set([fromId]), stack = [fromId];
  while (stack.length) {
    const cur = byId.get(stack.pop());
    for (const id of (cur?.next || [])) if (!seen.has(id)) { seen.add(id); stack.push(id); }
  }
  return seen;
}
function forwardToBoss(layers) {
  // 反向可达：能走到 BOSS 的节点集合（在反向图上从 BOSS 出发）
  const all = flat(layers), rev = new Map(all.map(n => [n.id, []]));
  all.forEach(n => (n.next || []).forEach(id => { if (rev.has(id)) rev.get(id).push(n.id); }));
  const boss = all.find(n => n.type === "boss");
  const seen = new Set([boss.id]), stack = [boss.id];
  while (stack.length) {
    for (const id of (rev.get(stack.pop()) || [])) if (!seen.has(id)) { seen.add(id); stack.push(id); }
  }
  return seen;
}

// ---------- 逐副本 x 逐难度采样 ----------
for (const missionId of MISSIONS) {
  const mission = GameData.missions.find(m => m.id === missionId);
  const exp = EXPECT[missionId];
  check(`${missionId}: 副本存在且路线配置与期望一致`,
    !!mission && (mission.route?.layers || 10) === exp.layers && (mission.route?.type || "default") === exp.type,
    `route=${JSON.stringify(mission?.route || null)}`);

  for (const diffId of DIFFS) {
    const diff = GameData.difficulties[diffId];
    const tag = `${missionId}/${diffId}`;
    let badLayerCount = 0, badStart = 0, badBoss = 0, badRest = 0, badChest = 0;
    let badType = 0, dangling = 0, unreachable = 0, deadEnd = 0, orphans = 0;
    let eliteSeen = 0, totalNonFixed = 0, noRestRuns = 0, restTotal = 0;
    // 期望精英占比：linear 路线有 mixedEliteFrom 限制，精英只出现在该层及之后，
    // 所以全局占比天然低于 eliteRate，不能拿 eliteRate 直接比。
    const eliteFrom = exp.type === "linear" ? (mission.route?.mixedEliteFrom || 99) : 1;
    const last = exp.layers;
    let eliteCapable = 0, candidates = 0;
    for (let L = 2; L < last; L++) {
      if (exp.rest.includes(L) || exp.chest.includes(L)) continue;
      candidates += exp.type === "default" ? 4 : 1; // default 每层 3~5 个节点，按 4 估算
      if (L >= eliteFrom) eliteCapable += exp.type === "default" ? 4 : 1;
    }
    const expectRate = candidates ? (eliteCapable / candidates) * diff.eliteRate : 0;

    for (let r = 0; r < ROUNDS; r++) {
      const state = { party: [], log: [], unlockedDifficulties: DIFFS };
      const layers = window.DungeonMap.buildLayers(mission, diff, state);
      window.DungeonMap.connect(layers, state);
      const all = flat(layers), ids = new Set(all.map(n => n.id));

      if (layers.length !== exp.layers) badLayerCount++;
      // 每层的 col 必须从 0 连续，否则 connect 的索引对齐会错位
      layers.forEach((L, i) => L.forEach((n, c) => { if (n.layer !== i + 1 || n.col !== c) orphans++; }));

      // 起点 / BOSS 唯一且落位
      if (!(layers[0].length === 1 && layers[0][0].type === "start")) badStart++;
      const bosses = all.filter(n => n.type === "boss");
      if (!(bosses.length === 1 && bosses[0].layer === exp.layers)) badBoss++;

      // 固定层落位
      for (const L of exp.rest) {
        const layer = layers[L - 1];
        if (!layer || layer.length !== 1 || layer[0].type !== "rest") badRest++;
      }
      for (const L of exp.chest) {
        const layer = layers[L - 1];
        if (!layer || layer.length !== 1 || layer[0].type !== "chest") badChest++;
      }
      // 节点类型合法。
      // 注意：machine_factory 无 route 配置，走 defaultLayers，休整/宝箱按 weights 随机出现（设计如此）；
      // 另三个副本有 route 配置，休整/宝箱只能落在配置层，随机冒出来才是异常。
      for (const n of all) {
        if (!VALID.includes(n.type)) badType++;
        if (exp.type !== "default" && (n.type === "rest" || n.type === "chest")
          && !exp.rest.includes(n.layer) && !exp.chest.includes(n.layer)) badType++;
      }

      // 休整节点数量：有 route 的副本靠固定层保证，default 副本靠权重随机，可能一轮都没有
      const restCount = all.filter(n => n.type === "rest").length;
      if (restCount === 0) noRestRuns++;
      restTotal += restCount;

      // next 悬空
      for (const n of all) for (const id of (n.next || [])) if (!ids.has(id)) dangling++;
      // 出度：非 BOSS 层节点必须有出路，否则走到就卡死
      for (const n of all) if (n.layer < layers.length && !(n.next || []).length) orphans++;

      // 连通性
      const start = layers[0][0].id;
      const reach = reachSet(layers, start);
      if (reach.size !== all.length) unreachable++;
      const toBoss = forwardToBoss(layers);
      if (toBoss.size !== all.length) deadEnd++;

      // 精英比例采样
      for (const n of all) if (n.type === "normal" || n.type === "elite") { totalNonFixed++; if (n.type === "elite") eliteSeen++; }
    }

    check(`${tag}: 层数恒为 ${exp.layers}`, badLayerCount === 0, `异常 ${badLayerCount}/${ROUNDS}`);
    check(`${tag}: 起点唯一且在第 1 层`, badStart === 0, `异常 ${badStart}/${ROUNDS}`);
    check(`${tag}: BOSS 唯一且在最后一层`, badBoss === 0, `异常 ${badBoss}/${ROUNDS}`);
    if (exp.rest.length) check(`${tag}: 休整层落位 ${JSON.stringify(exp.rest)}`, badRest === 0, `异常 ${badRest}/${ROUNDS}`);
    if (exp.chest.length) check(`${tag}: 宝箱层落位 ${JSON.stringify(exp.chest)}`, badChest === 0, `异常 ${badChest}/${ROUNDS}`);
    check(`${tag}: 节点类型合法且非固定层无随机休整/宝箱`, badType === 0, `异常 ${badType}/${ROUNDS}`);
    check(`${tag}: next 无悬空引用且每层节点 col 连续`, dangling === 0 && orphans === 0, `悬空 ${dangling} / 结构异常 ${orphans}`);
    check(`${tag}: 全部节点从起点可达`, unreachable === 0, `不可达 ${unreachable}/${ROUNDS}`);
    check(`${tag}: 无死路（全部节点都能走到 BOSS）`, deadEnd === 0, `死路 ${deadEnd}/${ROUNDS}`);
    if (exp.type !== "default") {
      // 有 route 配置的副本：休整层固定，每轮必然存在
      check(`${tag}: 每轮都存在休整节点（固定层保证）`, noRestRuns === 0, `无休整 ${noRestRuns}/${ROUNDS}`);
    }
    const rate = totalNonFixed ? eliteSeen / totalNonFixed : 0;
    check(`${tag}: 精英占比符合路线约束`, Math.abs(rate - expectRate) < 0.15,
      `实测 ${(rate * 100).toFixed(1)}% 期望 ~${(expectRate * 100).toFixed(1)}%（eliteRate ${diff.eliteRate}, eliteFrom ${eliteFrom}）`);
    if (exp.type === "default") {
      const pct = (noRestRuns / ROUNDS * 100).toFixed(1);
      findings.push(`${tag}: 无休整路线占比 ${pct}%（${noRestRuns}/${ROUNDS}），平均每轮 ${(restTotal / ROUNDS).toFixed(2)} 个休整点`);
    }
  }
}

// ---------- 全局：每个副本都必须有固定休整层 ----------
// 休整是唯一的回血手段。此前 machine_factory 没有 route 配置，走 defaultLayers，
// 休整靠权重随机；英雄级 eliteRate .6 挤占掷点，约 27% 的路线整张图都没有休整点。
for (const missionId of MISSIONS) {
  const mission = GameData.missions.find(m => m.id === missionId);
  const rest = mission?.route?.rest || [];
  check(`${missionId}: 配置了固定休整层（保证有回血点）`,
    (mission?.route?.type === "fixed-random" || mission?.route?.type === "linear") && rest.length > 0,
    `route=${JSON.stringify(mission?.route || null)}`);
}

// ---------- 输出 ----------
const fail = results.filter(r => !r.ok);
results.forEach(r => console.log(`${r.ok ? "✅" : "❌"} ${r.name}${r.evidence ? `  ← ${r.evidence}` : ""}`));
if (findings.length) { console.log("\n⚠️  待决发现（不计成败）："); findings.forEach(f => console.log(`   - ${f}`)); }
console.log(`\n合计 ${results.length} 项，通过 ${results.length - fail.length}，失败 ${fail.length}`);
process.exit(fail.length ? 1 : 0);
