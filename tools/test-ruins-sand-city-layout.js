const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();

// 加载副本地图 + 敌人编组 + 废墟沙城数据
[
  "dungeon-map.js",
  "dungeon-enemies.js",
  "data-ruins-sand-city-enemies.js",
  "data-ruins-content.js",
  "data-ruins-sand-city.js",
].forEach(f => vm.runInThisContext(
  fs.readFileSync(`./src/original/${f}`, "utf8"), { filename: f },
));

// 让 GameData.enemies / difficulties 可见
if (!GameData.enemies.ruins_sand_city) {
  GameData.enemies.ruins_sand_city = window.GameDataRuinsSandCity.enemies;
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`✅ ${name}${extra ? "  " + extra : ""}`); }
  else { fail++; console.log(`❌ ${name}${extra ? "  " + extra : ""}`); }
};

const route = window.GameDataRuinsSandCity.mission.route;
console.log("===== 副本配置 route =====");
console.log(JSON.stringify(route));
console.log("");

// ---------- 1. 层数 / 固定节点 ----------
console.log("===== 1. 地图结构：15 层 + 固定节点 =====");
const run = { missionId: "ruins_sand_city", difficultyId: "normal" };
const diff = GameData.difficulties.normal || GameData.difficulties[Object.keys(GameData.difficulties)[0]];
const layers = window.DungeonMap.buildLayers(
  window.GameDataRuinsSandCity.mission, diff, window.state,
);

ok("共 15 层", layers.length === 15, `实际 ${layers.length}`);
const typeAt = n => layers[n - 1].map(x => x.type).join(",");
// 固定层以 mission.route 为唯一真相源（此前写死第 4/9 层篝火，route 改到 rest[14] 后一直滞后）。
const fixedRest = route.rest || [], fixedChest = route.chest || [], fixedBoss = route.boss || [];
ok("第 1 层 = 起点(start)", typeAt(1) === "start", typeAt(1));
ok("固定休整层 = route.rest", fixedRest.length > 0 && fixedRest.every(n => typeAt(n) === "rest"), JSON.stringify(fixedRest));
ok("固定宝箱层 = route.chest", fixedChest.length > 0 && fixedChest.every(n => typeAt(n) === "chest"), JSON.stringify(fixedChest));
ok("固定BOSS层 = route.boss", fixedBoss.length > 0 && fixedBoss.every(n => typeAt(n) === "boss"), JSON.stringify(fixedBoss));

// 固定层各只有一个节点
ok("固定层均仅 1 个节点", [...fixedRest, ...fixedChest, ...fixedBoss].every(n => layers[n-1].length === 1),
  [...fixedRest, ...fixedChest, ...fixedBoss].map(n => `${n}:${layers[n-1].length}`).join(","));

// 其余层是战斗节点（普通或精英；精英按难度 eliteRate 掷点，与 machine_factory 一致）
const fixed = new Set([1, ...fixedRest, ...fixedChest, ...fixedBoss]);
const normalLayers = Array.from({ length: layers.length }, (_, i) => i + 1).filter(n => !fixed.has(n));
const allBattle = normalLayers.every(n => layers[n-1].every(x => x.type === "normal" || x.type === "elite"));
ok(`其余 ${normalLayers.length} 层均为战斗节点(normal/elite)`, allBattle);
// 精英必须真的会出现，否则依赖精英掉落的卡牌永远解锁不了
let eliteSeen = 0, battleTotal = 0;
for (let i = 0; i < 200; i++) {
  const ls = window.DungeonMap.buildLayers(window.GameDataRuinsSandCity.mission, GameData.difficulties.normal, window.state);
  ls.flat().forEach(x => { if (x.type === "elite") eliteSeen++; if (x.type === "elite" || x.type === "normal") battleTotal++; });
}
ok("精英节点会出现(200局)", eliteSeen > 0, `共 ${eliteSeen} 个精英节点 / ${battleTotal} 战斗节点`);
const branchCounts = normalLayers.map(n => layers[n-1].length);
ok("普通层节点数随机(3~5)", branchCounts.every(c => c >= 3 && c <= 5), `各层节点数 ${branchCounts.join(",")}`);

// ---------- 2. 普通战斗敌人 1~4 只 ----------
console.log("\n===== 2. 普通战斗：随机 1~4 只普通怪 =====");
const pool = GameData.enemies.ruins_sand_city || [];
const normalPool = pool.filter(e => e.type === "normal");
console.log(`普通怪种类: ${normalPool.length} 种 → ${normalPool.map(e => e.id).join(", ")}`);

const counts = {}, labelsSeen = new Set(), groupSamples = [];
let allNormalType = true, outOfRange = 0;
for (let i = 0; i < 400; i++) {
  const g = window.DungeonEnemyGroups.enemiesFor(run, "normal", window.state);
  const n = g.length;
  counts[n] = (counts[n] || 0) + 1;
  if (n < 1 || n > 4) outOfRange++;
  if (!g.every(e => e.type === "normal")) allNormalType = false;
  g.forEach(e => { if (e.label) labelsSeen.add(e.label); });
  if (i < 5) groupSamples.push(g.map(e => e.id + (e.label || "")).join(" + "));
}
console.log("样本:");
groupSamples.forEach(s => console.log("  " + s));
console.log("数量分布:", JSON.stringify(counts));
console.log("出现过的编号:", [...labelsSeen].sort().join(","));

ok("只出普通怪(不含精英/BOSS)", allNormalType);
ok("数量恒在 1~4 之间", outOfRange === 0, `越界 ${outOfRange} 次`);
ok("1 只会出现", (counts[1] || 0) > 0);
ok("2 只会出现", (counts[2] || 0) > 0);
ok("3 只会出现", (counts[3] || 0) > 0);
ok("4 只会出现", (counts[4] || 0) > 0, `4 只出现 ${counts[4] || 0}/400 次`);

// ---------- 3. 4 个相同怪物 + ABCD ----------
console.log("\n===== 3. 可以出现 4 个相同怪物，ABCD 编号 =====");
let fourSame = 0, sampleFour = null;
for (let i = 0; i < 3000; i++) {
  const g = window.DungeonEnemyGroups.enemiesFor(run, "normal", window.state);
  g.forEach(e => { if (e.label) labelsSeen.add(e.label); });
  if (g.length === 4 && new Set(g.map(e => e.id)).size === 1) {
    fourSame++;
    if (!sampleFour) sampleFour = g.map(e => `${e.name}${e.label}`).join(" / ");
  }
}
ok("能抽出 4 个完全相同的怪", fourSame > 0, `${fourSame}/3000 次`);
console.log("   示例:", sampleFour || "(未出现)");

const labelSet = [...labelsSeen].sort().join("");
ok("同种类用 A/B/C/D 编号(自然抽样)", ["A","B","C","D"].every(l => labelsSeen.has(l)), `实见 ${labelSet}`);

// 手动构造 4 同，验证编号
{
  const ids = Array(4).fill(normalPool[0].id);
  const g = window.DungeonEnemyGroups.fromIds(run, "normal", ids, window.state);
  const got = g.map(e => e.label).join("");
  ok("4 相同 → 编号 A B C D", got === "ABCD", `实际 ${got}`);
  console.log("   显示名:", g.map(e => `${e.name}${e.label}`).join(" / "));
}

// ---------- 4. BOSS / 精英 ----------
console.log("\n===== 4. 精英与 BOSS 组 =====");
const bossG = window.DungeonEnemyGroups.enemiesFor(run, "boss", window.state);
console.log("BOSS 组:", bossG.map(e => `${e.name}${e.label || ""}`).join(" / "));
ok("BOSS 组非空", bossG.length > 0);
const eliteG = window.DungeonEnemyGroups.enemiesFor(run, "elite", window.state);
console.log("精英组:", eliteG.map(e => `${e.name}${e.label || ""}`).join(" / "));
ok("精英组非空", eliteG.length > 0);

console.log(`\n===== 汇总：${pass}/${pass + fail} 通过 =====`);
process.exit(fail ? 1 : 0);
