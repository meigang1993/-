/* global GameData */

// 端到端：模拟玩家接受了"讨伐废墟沙城 BOSS"的赏金后进入副本，
// 检查最终 boss 节点实际生成了哪些敌人。
// 路径：DungeonEvents.start -> applyBountyTargets -> forceBossNode -> bossGroup
const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime, createState } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();

[
  "dungeon-map.js", "dungeon-enemies.js",
  "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
  "data-ruins-sand-city-enemies.js", "data-future-enemies.js", "data-future-orc-enemies.js",
  "data-future-dungeons.js", "data-guard-kelly.js", "data-orc-bondi.js",
  "data-sakura-risa.js", "data-bakar-enemy.js",
  "data-ruins-content.js", "data-ruins-sand-city.js",
  "bounty-rewards.js", "dungeon-events.js",
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

const st = window.state && typeof window.state === "object" && Array.isArray(window.state.log)
  ? window.state : (window.state = createState());
st.log = st.log || [];
if (!st.unlockedDifficulties?.length) st.unlockedDifficulties = ["normal"];
if (!st.party?.length) st.party = ["luokaer"];

const nameOf = (mid, id) => (GameData.enemies[mid] || []).find(e => e.id === id)?.name || `⚠${id}`;
const typeOf = (mid, id) => (GameData.enemies[mid] || []).find(e => e.id === id)?.type || "unknown";

console.log("===== 赏金是否会 targeting 废墟沙城 BOSS =====");
for (const id of ["mech_ai_dragon", "witherer_1312"]) {
  const has = window.BountyRewards?.hasHuntDrop?.(id);
  ok(`hasHuntDrop(${id})`, !!has, has ? "赏金可指定此BOSS → 会走 bossGroup" : "不会作为赏金目标");
}

console.log("\n===== 实战：接受赏金后进入副本，检查 BOSS 节点 =====");
for (const [mid, bossId] of [
  ["ruins_sand_city", "mech_ai_dragon"],
  ["ruins_sand_city", "witherer_1312"],
  ["orc_dungeon", "xx_witherer_1124"],
  ["machine_factory", "mechanical_bull_king"],
]) {
  st.bounties = [{ id: "t1", accepted: true, type: "hunt", missionId: mid, targetId: bossId }];
  window.DungeonEvents.start(st, mid, "normal");
  const run = st.explore;
  const bossNode = run.layers.flat().find(n => n.type === "boss");
  const ids = (bossNode?.enemies || []).map(e => e.id);
  const names = ids.map(i => nameOf(mid, i));
  const types = ids.map(i => typeOf(mid, i));
  const bossCount = types.filter(t => t === "boss").length;
  const hasNonBoss = types.some(t => t !== "boss");

  console.log(`  [${mid}] 赏金目标 ${nameOf(mid, bossId)}`);
  console.log(`    实际 BOSS 节点: ${names.join(" + ")}`);
  console.log(`    类型: ${types.join("/")}`);
  ok(`    ${mid}: BOSS 节点含赏金目标`, ids.includes(bossId));
  ok(`    ${mid}: 无重复BOSS`, bossCount <= 1, bossCount > 1 ? `出现 ${bossCount} 个BOSS` : "");
  ok(`    ${mid}: 无池外/降级怪混入`, !hasNonBoss && !ids.some(i => typeOf(mid, i) === "unknown"),
    hasNonBoss ? `混入非BOSS: ${names.join("+")}` : "");
}

console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
