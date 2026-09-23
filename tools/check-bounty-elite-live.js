// 端到端：模拟玩家接受了"讨伐精英怪"的赏金后进入副本，
// 检查被强制安排的精英节点实际生成了哪些敌人。
// 路径：DungeonEvents.start -> applyBountyTargets -> forceEliteNode -> eliteGroup
// 关注点：赏金精英战不能退化成"只有目标自己一只"（B 类问题）。
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

// 每个副本正常精英战的组合（与 enemiesFor(...,"elite") 保持一致）
const NORMAL_ELITE = {
  ruins_sand_city: {
    attack_helicopter: ["merca_tank", "attack_helicopter"],
    armored_carrier: ["merca_tank", "armored_carrier", "noble_soldier", "noble_soldier"],
    hilde: ["hilde"],
  },
  orc_dungeon: {
    witherer_1124_split: ["witherer_1124_split", "witherer_1124_split"],
    assassin_sakura_risa: ["demon_witch", "assassin_sakura_risa", "demon_witch"],
    guard_kelly: ["demon_beast_unit", "guard_kelly", "demon_witch"],
    orc_king_bondi: ["orc_king_bondi"],
  },
  machine_factory: {
    elrana_clone: ["skeleton_patrol", "elrana_clone", "skeleton_patrol"],
    krow_doctor: ["krow_doctor", "machine_succubus", "machine_succubus", "machine_succubus"],
    invader_chiyo: ["invader_chiyo"],
  },
};

console.log("===== 实战：接受精英赏金后进入副本，检查精英节点 =====");
for (const [mid, eliteId] of [
  ["ruins_sand_city", "attack_helicopter"],
  ["ruins_sand_city", "armored_carrier"],
  ["ruins_sand_city", "hilde"],
  ["orc_dungeon", "witherer_1124_split"],
  ["orc_dungeon", "assassin_sakura_risa"],
  ["orc_dungeon", "guard_kelly"],
  ["machine_factory", "krow_doctor"],
]) {
  st.bounties = [{ id: "t1", accepted: true, type: "hunt", missionId: mid, targetId: eliteId }];
  window.DungeonEvents.start(st, mid, "normal");
  const run = st.explore;
  const eliteNodes = run.layers.flat().filter(n => n.type === "elite");
  const targetNode = eliteNodes.find(n => (n.enemies || []).some(e => e.id === eliteId));
  const got = (targetNode?.enemies || []).map(e => e.id);
  const want = NORMAL_ELITE[mid][eliteId];
  const gotNames = got.map(id => nameOf(mid, id)).join("+") || "(无)";
  const okIds = got.length === want.length && want.every(id => got.includes(id));
  ok(`精英赏金 ${nameOf(mid, eliteId)}`, okIds, `实际=${gotNames}`);
  ok(`  含目标本体`, got.includes(eliteId), "");
  ok(`  与正常精英战同组合`, JSON.stringify([...got].sort()) === JSON.stringify([...want].sort()),
    `期望=${want.map(id => nameOf(mid, id)).join("+")}`);
}

console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
