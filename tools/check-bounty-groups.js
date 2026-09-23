/* global GameData */

// 赏金任务路径（bossGroup / eliteGroup）与正常路径（enemiesFor）的组合一致性对比。
// dungeon-events.js 的 forceBossNode / forceEliteNode 走的是 bossGroup / eliteGroup，
// 与 enemyGroups.enemiesFor 是【两套独立映射】，enemiesFor 正确不代表赏金路径正确。
// 风险：bossGroup 兜底组合 ["mecha_minotaur", boss.id, "skeleton_patrol"] 中的
//   mecha_minotaur / skeleton_patrol 若不属于该副本池，fixedGroup 会
//   pool.find(...) || sample(pool) 静默回退成随机怪 —— 组合错乱但不报错。
const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();

[
  "dungeon-map.js", "dungeon-enemies.js",
  "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
  "data-ruins-sand-city-enemies.js", "data-future-enemies.js", "data-future-orc-enemies.js",
  "data-future-dungeons.js", "data-guard-kelly.js", "data-orc-bondi.js",
  "data-sakura-risa.js", "data-bakar-enemy.js",
  "data-ruins-content.js", "data-ruins-sand-city.js",
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
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? "  " + extra : ""}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? "  " + extra : ""}`); }
};

const origSample = window.GameRandom.sample.bind(window.GameRandom);
const diff = GameData.difficulties.normal;

for (const m of GameData.missions.filter(x => x.kind === "dungeon")) {
  const mid = m.id, pool = GameData.enemies[mid] || [];
  console.log(`\n===== ${mid} (${m.name || mid}) =====`);

  // 1) 采样正常路径 enemiesFor，得到该副本所有合法 boss / elite 组合
  const normalCombos = { boss: new Set(), elite: new Set() };
  for (const type of ["boss", "elite"]) {
    for (let i = 0; i < 3000; i++) {
      const g = window.DungeonEnemyGroups.enemiesFor({ missionId: mid, difficultyId: "normal" }, type, window.state);
      normalCombos[type].add((g || []).map(e => e.id).join("+"));
    }
  }
  console.log(`  正常 boss 组合: ${[...normalCombos.boss].join("  |  ")}`);
  console.log(`  正常 elite 组合: ${[...normalCombos.elite].join("  |  ")}`);

  let fallback = 0;
  window.GameRandom.sample = function (list, st) {
    if (list === pool) fallback++;
    return origSample(list, st);
  };

  const nm = id => pool.find(x => x.id === id)?.name || `⚠${id}`;
  const show = ids => ids.map(nm).join("+");
  const showKey = k => k.split("+").map(nm).join("+");

  // 2) 赏金 BOSS
  for (const b of pool.filter(e => e.type === "boss")) {
    const before = fallback;
    const ids = (window.DungeonEnemyGroups.bossGroup(pool, diff, [{ id: b.id }], window.state) || []).map(e => e.id);
    const reverted = fallback > before;
    const legit = [...normalCombos.boss].filter(k => k.split("+").includes(b.id));
    const consistent = legit.includes(ids.join("+"));
    const multiBoss = ids.filter(i => pool.find(x => x.id === i)?.type === "boss").length > 1;
    ok(`boss赏金 ${b.name}`,
      !reverted && consistent && !multiBoss,
      reverted ? `⚠静默回退 实际=${show(ids)} 应为=${legit.map(showKey).join(" 或 ")}`
        : multiBoss ? `⚠多BOSS 实际=${show(ids)}`
          : consistent ? `实际=${show(ids)}` : `⚠与正常组合不符 实际=${show(ids)} 正常=${legit.map(showKey).join(" 或 ")}`);
  }

  // 3) 赏金 ELITE
  for (const e0 of pool.filter(e => e.type === "elite")) {
    const before = fallback;
    const ids = (window.DungeonEnemyGroups.eliteGroup(pool, diff, e0.id, window.state) || []).map(e => e.id);
    const reverted = fallback > before;
    const legit = [...normalCombos.elite].filter(k => k.split("+").includes(e0.id));
    const consistent = legit.includes(ids.join("+"));
    ok(`elite赏金 ${e0.name}`,
      !reverted && consistent,
      reverted ? `⚠静默回退 实际=${show(ids)}`
        : consistent ? `实际=${show(ids)}`
          : `实际=${show(ids)}  正常=${legit.map(showKey).join(" 或 ")}`);
  }

  window.GameRandom.sample = origSample;
}

console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
