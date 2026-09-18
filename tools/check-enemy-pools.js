// 检查所有副本的精英怪 / BOSS 怪物池（怪物组合）是否生效
// 核心风险点：dungeon-enemies.js 的 fixedGroup 使用
//   pool.find(e => e.id === id) || sample(pool, state)
// 当组合里引用的 id 不在该副本敌人池中时，会【静默回退】成随机抽取一只怪，
// 表现为"组合看起来生效了，但怪是错的"，极难发现。
// 检测手法：hook GameRandom.sample，若收到的数组 === 该副本完整池（引用相等），
// 则必定是 fixedGroup 的回退分支（正常路径传的都是 filter 后的新数组）。
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

// data-world.js 在自身加载时就展开了 FutureDungeons / FutureEnemies，
// 而这些文件是之后才 runInThisContext 的，所以必须手动补进 GameData，
// 否则兽人地下城等副本会被整个漏掉（上一版脚本就踩了这个坑）。
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

const missions = (window.GameDataWorld?.missions || GameData.missions || [])
  .filter(m => m.kind === "dungeon");
const missionName = m => m.name || m.id;

console.log("===== 副本清单 =====");
console.log(missions.map(m => `${m.id}(${missionName(m)})`).join(" / "));
console.log("");

const origSample = window.GameRandom.sample.bind(window.GameRandom);
const N = 4000;

for (const m of missions) {
  const mid = m.id;
  const pool = (GameData.enemies || {})[mid];
  console.log(`\n===== ${mid} (${missionName(m)}) =====`);
  if (!Array.isArray(pool) || !pool.length) {
    ok(`${mid}: 敌人池非空`, false, "池为空");
    continue;
  }
  const byType = t => pool.filter(e => e.type === t);
  console.log(`  池: 共 ${pool.length} 只 | normal ${byType("normal").length} / elite ${byType("elite").length} / boss ${byType("boss").length}`);

  // hook：统计 fixedGroup 静默回退次数
  let fallback = 0;
  window.GameRandom.sample = function (list, st) {
    if (list === pool) fallback++;
    return origSample(list, st);
  };

  const combos = { elite: new Map(), boss: new Map() };
  const seenIds = { elite: new Set(), boss: new Set() };
  for (const type of ["elite", "boss"]) {
    for (let i = 0; i < N; i++) {
      const st = window.GameRandom.fork ? window.GameRandom.fork(mid + type + i) : window.state;
      const group = window.DungeonEnemyGroups.enemiesFor({ missionId: mid, difficultyId: "normal" }, type, st);
      const ids = (group || []).map(e => e.id);
      const key = ids.join("+");
      combos[type].set(key, (combos[type].get(key) || 0) + 1);
      ids.forEach(id => seenIds[type].add(id));
    }
  }
  window.GameRandom.sample = origSample;

  ok(`${mid}: 组合引用ID全部命中池（无静默回退）`, fallback === 0,
    fallback === 0 ? `回退 0 次` : `回退 ${fallback} 次 ← 有ID不在池中`);

  for (const type of ["elite", "boss"]) {
    const defined = byType(type);
    const seen = seenIds[type];
    const missing = defined.filter(e => !seen.has(e.id)).map(e => `${e.name}(${e.id})`);
    ok(`${mid}: ${type} 池全覆盖`, missing.length === 0,
      missing.length ? `不可达: ${missing.join(", ")}` : `${defined.length}/${defined.length} 均可出现`);

    console.log(`  ${type} 组合 ${combos[type].size} 种:`);
    [...combos[type].entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      const names = k.split("+").map(id => {
        const e = pool.find(x => x.id === id);
        return e ? e.name : `⚠${id}`;
      }).join("+");
      console.log(`    ${(v / N * 100).toFixed(1).padStart(5)}%  ${names}`);
    });
  }

  // 组合内出现的 ID 是否都在池中（直接判定，兜底于上面的 hook）
  const badIds = new Set();
  for (const type of ["elite", "boss"]) {
    for (const e of seenIds[type]) if (!pool.find(x => x.id === e)) badIds.add(e);
  }
  ok(`${mid}: 实际出现ID均在池中`, badIds.size === 0,
    badIds.size ? `未知ID: ${[...badIds].join(", ")}` : "");
}

// 死代码检查：bossGroup / eliteGroup 是否被内部 enemiesFor 使用
const src = fs.readFileSync("./src/original/dungeon-enemies.js", "utf8");
const usesBossGroup = /enemiesFor[\s\S]*?bossGroup\(/.test(src.slice(src.indexOf("function enemiesFor")));
console.log("\n===== 导出函数使用情况 =====");
ok("bossGroup 未被 enemiesFor 内部调用（默认副本走内联逻辑）", !usesBossGroup,
  usesBossGroup ? "已调用" : "未调用 — 属正常，内联分支覆盖了 machine_factory");
console.log("  （bossGroup/eliteGroup 仍对外导出，供外部/测试调用）");

console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
