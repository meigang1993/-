// 检查废墟沙城 BOSS 赏金战（bounty → forceBossNode → bossGroup）是否使用固定组合
//
// 背景：赏金任务走 bossGroup()，它与正常路径 enemiesFor() 是【两套独立映射】。
// bossGroup 里原本没有废墟沙城的特判，两个 BOSS 会落到兜底分支
//   ["mecha_minotaur", boss.id, "skeleton_patrol"]
// 而这两只是机械工厂的怪、不在废墟沙城池中 → fixedGroup 静默回退成随机抽取，
// 结果是 BOSS 战里可能塞进另一个 BOSS（实测出现过 3 个 BOSS）。
//
// 期望（用户给定）：
//   机械AI龙            → 机械AI龙 + 贵族军士兵 + 贵族军狙击手
//   XX型凋零者1312号    → 1312号  + 贵族军士兵 + 攻击型无人机
const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();

[
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

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`✅ ${name}${extra ? "  " + extra : ""}`); }
  else { fail++; console.log(`❌ ${name}${extra ? "  " + extra : ""}`); }
};

const pool = GameData.enemies.ruins_sand_city;
const diff = GameData.difficulties.normal;
const nameOf = id => (pool.find(e => e.id === id) || {}).name || `⚠${id}`;
const fmt = ids => ids.map(nameOf).join(" + ");

// bossGroup 接收的是目标 enemy 对象数组（dungeon-events.js: bosses.map(x => x.target)）
const call = id => window.DungeonEnemyGroups.bossGroup(pool, diff, [{ id }], window.state).map(e => e.id);

console.log("===== 废墟沙城 BOSS 赏金组合 =====");
ok("敌人池已加载", Array.isArray(pool) && pool.length > 0, `共 ${pool.length} 只`);

const expect = {
  mech_ai_dragon: ["mech_ai_dragon", "noble_soldier", "noble_sniper"],
  witherer_1312: ["witherer_1312", "noble_soldier", "attack_drone"],
};

for (const [id, want] of Object.entries(expect)) {
  const got = call(id);
  ok(`${nameOf(id)} 赏金组合正确`, got.join("+") === want.join("+"),
    `\n      期望: ${fmt(want)}\n      实际: ${fmt(got)}`);
}

// 稳定性：多次调用结果必须一致（固定组合，不能有随机回退）
for (const id of Object.keys(expect)) {
  const runs = new Set();
  for (let i = 0; i < 200; i++) runs.add(call(id).join("+"));
  ok(`${nameOf(id)} 200 次调用结果恒定`, runs.size === 1,
    runs.size === 1 ? `唯一组合` : `出现 ${runs.size} 种: ${[...runs].map(r => fmt(r.split("+"))).join(" | ")}`);
}

// 组合内不得出现其它副本的 BOSS（这是原 BUG 最危险的表现）
const allBossIds = new Set();
for (const m of (window.GameDataWorld?.missions || GameData.missions || [])) {
  for (const e of (GameData.enemies[m.id] || [])) if (e.type === "boss") allBossIds.add(e.id);
}
const ruinsBossIds = new Set(pool.filter(e => e.type === "boss").map(e => e.id));
for (const id of Object.keys(expect)) {
  // BUG 是随机回退，单次采样可能侥幸通过，必须按 200 次全量统计
  const samples = [];
  for (let i = 0; i < 200; i++) samples.push(call(id));
  const alien = [...new Set(samples.flat().filter(x => allBossIds.has(x) && !ruinsBossIds.has(x)))];
  ok(`${nameOf(id)} 组合无外来 BOSS（200 次）`, alien.length === 0,
    alien.length ? `混入: ${alien.map(nameOf).join(", ")}` : "");
  const counts = [...new Set(samples.map(g => g.filter(x => ruinsBossIds.has(x)).length))];
  ok(`${nameOf(id)} BOSS 数量恒为 1（200 次）`, counts.length === 1 && counts[0] === 1,
    `实际出现过的数量: ${counts.join(", ")}`);
}

// 回归：其它副本的 BOSS 赏金组合不能被这次改动影响
console.log("\n===== 回归：其它副本 BOSS 赏金 =====");
const others = [
  ["orc_dungeon", "xx_witherer_1124", ["xx_witherer_1124"]],
  ["orc_dungeon", "demon_king_bakaar", ["demon_mecha_cerberus", "demon_king_bakaar"]],
  ["underwater_train", "shark_captain_mordio", ["shark_pirate_raider", "shark_captain_mordio", "shark_pirate_crew", "shark_pirate_crew"]],
];
for (const [mid, id, want] of others) {
  const p = GameData.enemies[mid];
  if (!p) { ok(`${mid} 池存在`, false); continue; }
  const got = window.DungeonEnemyGroups.bossGroup(p, diff, [{ id }], window.state).map(e => e.id);
  ok(`${mid} / ${id} 组合未受影响`, got.join("+") === want.join("+"),
    got.join("+") === want.join("+") ? "" : `实际: ${got.join("+")}`);
}

console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
