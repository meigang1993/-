/* global GameData, window */

// 检查两件事：
//  1. 每个副本的经验值倍率是否正常（dungeonExpMultiplier 的 key 必须覆盖全部副本 missionId，
//     否则 rewardFor 的 || 1 兜底会让该副本经验退化成 1 倍 —— 静默失效，界面上看不出来）
//  2. 兽人地下城的怪物组合是否正常（fixedGroup 里 id 不在池中会静默回退成随机怪）
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
  "character-progression.js",
].forEach(f => vm.runInThisContext(fs.readFileSync(`./src/original/${f}`, "utf8"), { filename: f }));

for (const m of (window.GameDataFutureDungeons || [])) {
  if (!GameData.missions.some(x => x.id === m.id)) GameData.missions.push(m);
}
Object.assign(GameData.enemies, window.GameDataFutureEnemies || {});
if (window.GameDataRuinsSandCity?.mission && !GameData.missions.some(x => x.id === "ruins_sand_city")) {
  GameData.missions.push(window.GameDataRuinsSandCity.mission);
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`✅ ${name}${extra ? "  " + extra : ""}`); }
  else { fail++; console.log(`❌ ${name}${extra ? "  " + extra : ""}`); }
};

const CP = window.CharacterProgression;
const missions = GameData.missions.filter(m => m.kind === "dungeon");
const diffs = Object.keys(GameData.difficulties);

console.log("===== 一、副本经验倍率 =====");
console.log("副本数: " + missions.length + "   难度数: " + diffs.length);
console.log("");

// 1. dungeonExpMultiplier 必须覆盖全部副本
const mult = CP.dungeonExpMultiplier;
for (const m of missions) {
  const v = mult[m.id];
  ok(`倍率表覆盖 ${m.name}(${m.id})`, typeof v === "number", `= ${v}`);
}

console.log("");
console.log("===== 二、各副本 × 各难度 经验表 =====");
const base = { normal: 30, elite: 70, boss: 130 };
const header = ["副本\\难度", ...diffs.map(d => GameData.difficulties[d].name)].join("\t");
console.log(header);
for (const m of missions) {
  const row = [m.name];
  for (const d of diffs) {
    const diff = GameData.difficulties[d];
    row.push(`${CP.rewardFor("boss", diff, m.id)}`);
  }
  console.log(row.join("\t"));
}
console.log("（表内为 BOSS 节点经验；normal=30 / elite=70 / boss=130 为基数）");
console.log("");

// 2. 难度 xp 单调递增
for (let i = 1; i < diffs.length; i++) {
  const prev = GameData.difficulties[diffs[i - 1]].xp;
  const cur = GameData.difficulties[diffs[i]].xp;
  ok(`难度经验倍率递增 ${GameData.difficulties[diffs[i - 1]].name}→${GameData.difficulties[diffs[i]].name}`,
    cur > prev, `${prev} → ${cur}`);
}

// 3. 副本倍率必须递增（后面的副本经验更高），否则玩家打高级副本没有回报
const order = ["machine_factory", "underwater_train", "orc_dungeon", "ruins_sand_city"];
for (let i = 1; i < order.length; i++) {
  const prev = mult[order[i - 1]], cur = mult[order[i]];
  ok(`副本经验倍率递增 ${order[i - 1]}→${order[i]}`, cur > prev, `${prev} → ${cur}`);
}

// 4. 实际数值：每个副本每个难度都 > 0 且随难度递增
for (const m of missions) {
  let prev = 0, mono = true;
  for (const d of diffs) {
    const v = CP.rewardFor("boss", GameData.difficulties[d], m.id);
    if (!(v > prev)) mono = false;
    prev = v;
  }
  ok(`${m.name} 经验随难度递增且 > 0`, mono && CP.rewardFor("boss", GameData.difficulties[diffs[0]], m.id) > 0);
}

// 5. 三种节点类型的经验比例应保持 30:70:130 的相对关系
for (const m of missions) {
  const diff = GameData.difficulties.normal;
  const n = CP.rewardFor("normal", diff, m.id);
  const e = CP.rewardFor("elite", diff, m.id);
  const b = CP.rewardFor("boss", diff, m.id);
  ok(`${m.name} 节点类型经验比例 normal<elite<boss`, n < e && e < b, `${n}/${e}/${b}`);
}

console.log("");
console.log("===== 三、兽人地下城怪物组合 =====");
const orcPool = GameData.enemies.orc_dungeon || [];
const ids = new Set(orcPool.map(e => e.id));
console.log(`兽人地下城敌人数: ${orcPool.length}`);
console.log("  normal: " + orcPool.filter(e => e.type === "normal").map(e => e.name).join("、"));
console.log("  elite : " + orcPool.filter(e => e.type === "elite").map(e => e.name).join("、"));
console.log("  boss  : " + orcPool.filter(e => e.type === "boss").map(e => e.name).join("、"));
console.log("");

// hook sample：若收到的数组与完整池引用相等，说明走了 fixedGroup 的回退分支
const origSample = window.GameRandom.sample.bind(window.GameRandom);
let fallbackHits = [];
window.GameRandom.sample = function (arr, state) {
  if (arr === orcPool) fallbackHits.push(arr.length);
  return origSample(arr, state);
};

const DE = window.DungeonEnemyGroups;
const N = 3000;
const bossSeen = {}, eliteSeen = {}, normalSeen = {};
for (let i = 0; i < N; i++) {
  const run = { missionId: "orc_dungeon", difficultyId: "normal" };
  for (const e of DE.enemiesFor(run, "boss", window.state)) bossSeen[e.id] = (bossSeen[e.id] || 0) + 1;
  for (const e of DE.enemiesFor(run, "elite", window.state)) eliteSeen[e.id] = (eliteSeen[e.id] || 0) + 1;
  for (const e of DE.enemiesFor(run, "normal", window.state)) normalSeen[e.id] = (normalSeen[e.id] || 0) + 1;
}
window.GameRandom.sample = origSample;

ok("兽人地下城 BOSS 组合无静默回退", fallbackHits.length === 0, `回退次数 ${fallbackHits.length}`);
console.log("  BOSS 出现过的怪: " + Object.keys(bossSeen).map(id => orcPool.find(e => e.id === id)?.name || id).join("、"));
console.log("  ELITE出现过的怪: " + Object.keys(eliteSeen).map(id => orcPool.find(e => e.id === id)?.name || id).join("、"));
console.log("  NORMAL出现过的怪: " + Object.keys(normalSeen).map(id => orcPool.find(e => e.id === id)?.name || id).join("、"));
console.log("");

// BOSS 组合：两组都要能出现，且成员正确
const bossGroups = [["xx_witherer_1124"], ["demon_mecha_cerberus", "demon_king_bakaar"]];
for (const g of bossGroups) {
  ok(`BOSS 组合成员齐全 [${g.join("+")}]`, g.every(id => ids.has(id)),
    g.map(id => orcPool.find(e => e.id === id)?.name || `缺失:${id}`).join(" + "));
}

// ELITE 组合：四组都要能出现
const eliteGroups = [
  ["witherer_1124_split", "witherer_1124_split"],
  ["orc_king_bondi"],
  ["demon_beast_unit", "guard_kelly", "demon_witch"],
  ["demon_witch", "assassin_sakura_risa", "demon_witch"],
];
for (const g of eliteGroups) {
  const missing = [...new Set(g)].filter(id => !ids.has(id));
  ok(`ELITE 组合成员齐全 [${g.join("+")}]`, missing.length === 0,
    missing.length ? `缺失: ${missing.join(",")}` : [...new Set(g)].map(id => orcPool.find(e => e.id === id)?.name).join(" + "));
}

// 精英清单里的 4 名兽人地下城精英必须都能出场
const orcElites = orcPool.filter(e => e.type === "elite").map(e => e.id);
for (const id of orcElites) {
  ok(`精英 ${orcPool.find(e => e.id === id)?.name} 能出场`, !!eliteSeen[id]);
}
// BOSS 清单里的 2 名必须都能出场
for (const id of orcPool.filter(e => e.type === "boss").map(e => e.id)) {
  ok(`BOSS ${orcPool.find(e => e.id === id)?.name} 能出场`, !!bossSeen[id]);
}
// 普通怪全部可达
for (const id of orcPool.filter(e => e.type === "normal").map(e => e.id)) {
  ok(`普通怪 ${orcPool.find(e => e.id === id)?.name} 可达`, !!normalSeen[id]);
}

console.log("");
console.log("===== 四、兽人地下城 讨伐路径 vs 正常路径 一致性 =====");
// enemiesFor 是正常副本路径，bossGroup / eliteGroup 是讨伐任务路径，两套独立映射。
// 若两边不一致，会出现"打副本是一种组合、接讨伐是另一种"。
const diff = GameData.difficulties.normal;
const nameOf = id => orcPool.find(e => e.id === id)?.name || id;

for (const b of orcPool.filter(e => e.type === "boss")) {
  const viaBounty = DE.bossGroup(orcPool, diff, [b], window.state).map(e => e.id);
  // 正常路径采样多次，收集该 BOSS 参与过的所有组合
  const viaNormal = new Set();
  for (let i = 0; i < 400; i++) {
    const list = DE.enemiesFor({ missionId: "orc_dungeon", difficultyId: "normal" }, "boss", window.state);
    if (list.some(e => e.id === b.id)) viaNormal.add(list.map(e => e.id).join("+"));
  }
  const bountyStr = viaBounty.join("+");
  ok(`BOSS ${nameOf(b.id)} 讨伐/正常组合一致`, viaNormal.has(bountyStr),
    `讨伐=[${viaBounty.map(nameOf).join("+")}] 正常=[${[...viaNormal].map(s => s.split("+").map(nameOf).join("+")).join(" | ")}]`);
}

for (const el of orcPool.filter(e => e.type === "elite")) {
  const viaBounty = DE.eliteGroup(orcPool, diff, el.id, window.state).map(e => e.id);
  const viaNormal = new Set();
  for (let i = 0; i < 400; i++) {
    const list = DE.enemiesFor({ missionId: "orc_dungeon", difficultyId: "normal" }, "elite", window.state);
    if (list.some(e => e.id === el.id)) viaNormal.add(list.map(e => e.id).join("+"));
  }
  const bountyStr = viaBounty.join("+");
  ok(`精英 ${nameOf(el.id)} 讨伐/正常组合一致`, viaNormal.has(bountyStr),
    `讨伐=[${viaBounty.map(nameOf).join("+")}] 正常=[${[...viaNormal].map(s => s.split("+").map(nameOf).join("+")).join(" | ")}]`);
}

console.log("");
console.log(`===== ${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
