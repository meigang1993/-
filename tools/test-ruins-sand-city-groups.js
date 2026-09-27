/* global GameData */

// 废墟沙城精英 / BOSS 固定组合的【绝对断言】检查。
//
// 与 check-enemy-pools.js / check-bounty-groups.js 的区别：
//   那两个脚本做的是【相对判断】——赏金路径与正常路径是否一致、
//   组合 ID 是否命中池。若两条路径同时错（例如组合表被整体改掉），
//   它们依然会全绿。本脚本直接对照用户给定的规格表做精确比对，
//   任何偏离（含成员顺序、重复次数变化）都会被抓住。
//
// 规格（用户给定）：
//   精英组合一：梅尔卡坦克 + 武装直升机
//   精英组合二：梅尔卡坦克 + 装甲运输车 + 贵族军士兵 + 贵族军士兵
//   精英组合三：内英组杀手希尔德 单独出场
//   BOSS 组合：机械AI龙 + 贵族军士兵 + 贵族军狙击手
//   BOSS 组合：XX型凋零者1312号 + 贵族军士兵 + 攻击型无人机

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
  // 讨伐掉落判定需要 RelicSystem 与 BountyRewards（否则第 5 项会退化成"未加载，跳过"的假通过）
  "data-relics.js",
  "data-future-relics.js",
  "relics.js",
  "bounty-rewards.js",
].forEach(f => vm.runInThisContext(fs.readFileSync(`./src/original/${f}`, "utf8"), { filename: f }));

// data-world.js 加载时 FutureDungeons / FutureEnemies 尚未展开，需手动补齐，
// 否则兽人地下城等副本会被整个漏掉。
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

const MID = "ruins_sand_city";
const pool = GameData.enemies[MID] || [];
const diff = GameData.difficulties.normal;
const nm = id => pool.find(x => x.id === id)?.name || `⚠未知(${id})`;
const show = ids => ids.map(nm).join(" + ");

// —— 规格表（顺序敏感，含重复成员）——
const SPEC = {
  elite: {
    attack_helicopter: ["merca_tank", "attack_helicopter"],
    armored_carrier: ["merca_tank", "armored_carrier", "noble_soldier", "noble_soldier"],
    hilde: ["hilde"],
  },
  boss: {
    mech_ai_dragon: ["mech_ai_dragon", "noble_soldier", "noble_sniper"],
    witherer_1312: ["witherer_1312", "noble_soldier", "attack_drone"],
  },
};

const origSample = window.GameRandom.sample.bind(window.GameRandom);
// fixedGroup 的回退分支是 pool.find(...) || sample(pool)，传的是池本身（引用相等），
// 正常分支传的都是 filter 后的新数组 —— 以此精确识别"静默回退成随机怪"。
let fallback = 0;
window.GameRandom.sample = function (list, st) {
  if (list === pool) fallback++;
  return origSample(list, st);
};

console.log("===== 0. 敌人池 =====");
ok(`${MID}: 池非空`, pool.length > 0, `共 ${pool.length} 只`);
["normal", "elite", "boss"].forEach(t => {
  console.log(`  ${t}: ${pool.filter(e => e.type === t).map(e => `${e.name}(${e.id})`).join("、") || "—"}`);
});
console.log("");

// —— 1. 讨伐路径（eliteGroup / bossGroup）：逐个目标的精确比对 ——
console.log("===== 1. 讨伐路径（bossGroup / eliteGroup）=====");
for (const [id, spec] of Object.entries(SPEC.boss)) {
  const ids = (window.DungeonEnemyGroups.bossGroup(pool, diff, [{ id }], window.state) || []).map(e => e.id);
  ok(`BOSS讨伐 ${nm(id)}`, ids.join("+") === spec.join("+"),
    ids.join("+") === spec.join("+") ? `实际=${show(ids)}` : `期望=${show(spec)} 实际=${show(ids)}`);
  // 组合内不得混入第二个 BOSS（历史上兜底分支曾把三头犬塞进 1312 战）
  const bossCount = ids.filter(i => pool.find(x => x.id === i)?.type === "boss").length;
  ok(`BOSS讨伐 ${nm(id)}: 仅1名BOSS`, bossCount === 1, `BOSS数=${bossCount}`);
}
for (const [id, spec] of Object.entries(SPEC.elite)) {
  const ids = (window.DungeonEnemyGroups.eliteGroup(pool, diff, id, window.state) || []).map(e => e.id);
  ok(`精英讨伐 ${nm(id)}`, ids.join("+") === spec.join("+"),
    ids.join("+") === spec.join("+") ? `实际=${show(ids)}` : `期望=${show(spec)} 实际=${show(ids)}`);
}
console.log("");

// —— 2. 正常路径（enemiesFor）：采样得到的组合集合必须恰好等于规格表 ——
console.log("===== 2. 正常路径（enemiesFor 采样）=====");
const N = 3000;
for (const type of ["elite", "boss"]) {
  const seen = new Map();
  for (let i = 0; i < N; i++) {
    const g = window.DungeonEnemyGroups.enemiesFor({ missionId: MID, difficultyId: "normal" }, type, window.state);
    const k = (g || []).map(e => e.id).join("+");
    seen.set(k, (seen.get(k) || 0) + 1);
  }
  const expected = new Set(Object.values(SPEC[type]).map(s => s.join("+")));
  const got = [...seen.keys()];
  const unexpected = got.filter(k => !expected.has(k));
  const missing = [...expected].filter(k => !seen.has(k));
  ok(`${type}: 采样组合无规格外组合`, unexpected.length === 0,
    unexpected.length ? `多出: ${unexpected.map(show2 => show2.split("+").map(nm).join("+")).join("  |  ")}` : `${got.length} 种`);
  ok(`${type}: 规格组合全部可达`, missing.length === 0,
    missing.length ? `未出现: ${missing.map(k => k.split("+").map(nm).join("+")).join("  |  ")}` : `${expected.size}/${expected.size}`);
  got.sort((a, b) => seen.get(b) - seen.get(a)).forEach(k => {
    console.log(`    ${(seen.get(k) / N * 100).toFixed(1).padStart(5)}%  ${k.split("+").map(nm).join(" + ")}`);
  });
}
console.log("");

// —— 3. 池覆盖率：每个 elite / boss 都必须能出现 ——
console.log("===== 3. 池覆盖与污染 =====");
const reachable = new Set();
for (const type of ["elite", "boss"]) {
  for (let i = 0; i < 2000; i++) {
    (window.DungeonEnemyGroups.enemiesFor({ missionId: MID, difficultyId: "normal" }, type, window.state) || [])
      .forEach(e => reachable.add(e.id));
  }
  pool.filter(e => e.type === type).forEach(e => {
    ok(`${type} ${e.name} 可达`, reachable.has(e.id), reachable.has(e.id) ? "" : "不可能出现在任何战斗中");
  });
}
// 组合里不得出现不属于本副本池的怪
const allIds = new Set(Object.values(SPEC).flatMap(o => Object.values(o).flat()));
const foreign = [...allIds].filter(id => !pool.find(x => x.id === id));
ok("规格引用ID全部属于本副本池", foreign.length === 0, foreign.length ? `外来ID: ${foreign.join(", ")}` : "无");
console.log("");

window.GameRandom.sample = origSample;

// —— 4. 静默回退（必须在还原 hook 后判定，值已统计）——
console.log("===== 4. 静默回退 =====");
ok("fixedGroup 无静默回退（组合ID全部命中池）", fallback === 0,
  fallback === 0 ? "回退 0 次" : `回退 ${fallback} 次 ← 有ID不在池中，会随机换成别的怪`);
console.log("");

// —— 5. 讨伐任务可生成性：目标必须能被 BountyTaskGenerator 选中 ——
console.log("===== 5. 讨伐任务可生成性 =====");
const targets = pool.filter(e => ["elite", "boss"].includes(e.type));
// 若 BountyRewards 没加载上，必须判失败而不是"跳过" —— 否则这条会永远绿，等于没检查。
const noDrop = targets.filter(e => !window.BountyRewards?.hasHuntDrop?.(e.id));
ok("elite/boss 均有讨伐掉落（否则永远接不到该目标）",
  !!window.BountyRewards?.hasHuntDrop && noDrop.length === 0,
  !window.BountyRewards?.hasHuntDrop ? "BountyRewards 未加载 — 检查失败（非跳过）"
    : noDrop.length ? `无掉落: ${noDrop.map(e => e.name).join("、")}`
      : targets.map(e => `${e.name}=true`).join(" "));
console.log("");

// —— 6. 普通战：不得混入 elite / boss ——
console.log("===== 6. 普通战组成 =====");
{
  const kinds = new Set(), sizes = new Set(), seenNormal = new Set();
  for (let i = 0; i < 2000; i++) {
    const g = window.DungeonEnemyGroups.enemiesFor({ missionId: MID, difficultyId: "normal" }, "normal", window.state) || [];
    sizes.add(g.length);
    g.forEach(e => { kinds.add(e.type); if (e.type === "normal") seenNormal.add(e.id); });
  }
  ok("普通战不混入 elite/boss", !kinds.has("elite") && !kinds.has("boss"),
    `出现类型=${[...kinds].join(",")}`);
  ok("普通战规模 1-4", [...sizes].every(n => n >= 1 && n <= 4), `出现规模=${[...sizes].sort().join(",")}`);
  const unreach = pool.filter(e => e.type === "normal" && !seenNormal.has(e.id));
  ok("normal 怪全部可达", unreach.length === 0, unreach.length ? `不可达: ${unreach.map(e => e.name).join("、")}` : `${seenNormal.size}/${pool.filter(e => e.type === "normal").length}`);
}
console.log("");

console.log(`===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
