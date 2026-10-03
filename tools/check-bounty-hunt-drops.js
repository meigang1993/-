/* global GameData */
/* 校验每个副本的精英/BOSS 都能出现在悬赏讨伐任务里并发出奖励。
   讨伐任务只发两类：目标专属卡牌（eliteUnlocks ∩ eliteCards）与目标专属饰品
   （RelicSystem.enemyRelics）。两者皆空则该敌人永远不会成为讨伐目标，
   且英雄级「精英与BOSS携带掉落饰品技能」在该敌人身上不生效。
   注意加载顺序：data-ruins-content.js 必须先于 relics.js 求值，
   relics.js 会展开快照 GameDataRuinsContent.relics（真实 bundle 顺序即如此，
   故此处末尾重新求值一次 relics.js 以忠实还原）。 */
const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();
["dungeon-map.js", "dungeon-enemies.js", "data-future-dungeons.js",
  "data-ruins-content.js", "data-ruins-sand-city.js", "bounty-rewards.js", "relics.js"]
  .forEach(f => vm.runInThisContext(fs.readFileSync(`./src/original/${f}`, "utf8"), { filename: f }));

for (const m of (window.GameDataFutureDungeons || [])) {
  if (!GameData.missions.some(x => x.id === m.id)) GameData.missions.push(m);
}
Object.assign(GameData.enemies, window.GameDataFutureEnemies || {});
Object.assign(GameData.enemies, window.GameDataFutureOrcEnemies || {});
if (window.GameDataRuinsSandCity?.mission && !GameData.missions.some(x => x.id === "ruins_sand_city")) {
  GameData.missions.push(window.GameDataRuinsSandCity.mission);
}

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? "  " + extra : ""}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? "  " + extra : ""}`); }
};

const eliteCards = GameData.eliteCards || [];
const cardNames = id => (GameData.eliteUnlocks?.[id] || []);
const hasCard = id => { const n = new Set(cardNames(id)); return eliteCards.some(c => n.has(c.name)); };
const hasRelic = id => (window.RelicSystem?.enemyRelics?.(id) || []).length > 0;

const missions = GameData.missions.filter(x => x.kind === "dungeon");
const targets = missions.flatMap(m => (GameData.enemies[m.id] || [])
  .filter(e => ["elite", "boss"].includes(e.type)).map(e => ({ ...e, missionId: m.id })));

console.log(`副本 ${missions.length} 个，精英/BOSS 目标 ${targets.length} 个\n`);
ok("存在精英/BOSS 目标", targets.length > 0, `${targets.length} 个`);

for (const m of missions) {
  const pool = targets.filter(t => t.missionId === m.id);
  console.log(`\n===== ${m.id} (${m.name || m.id}) =====`);
  ok(`${m.id} 有精英/BOSS 目标`, pool.length > 0, `${pool.length} 个`);
  for (const e of pool) {
    const c = hasCard(e.id), r = hasRelic(e.id);
    ok(`${e.type} ${e.name || e.id}`,
      c && r && window.BountyRewards.hasHuntDrop(e.id),
      `卡:${c ? "有" : "无"} 饰品:${r ? "有" : "无"}`);
  }
}

// 卡牌名必须能在 eliteCards 里找到实体，否则 rollReward 采样返回 null。
console.log("\n===== 解锁名 → 实体卡一致性 =====");
const cardSet = new Set(eliteCards.map(c => c.name));
let phantom = 0;
Object.entries(GameData.eliteUnlocks || {}).forEach(([id, names]) => {
  names.forEach(name => {
    if (!cardSet.has(name)) { phantom++; console.log(`  ❌ ${id} 的「${name}」在 eliteCards 无实体`); }
  });
});
ok("eliteUnlocks 全部有实体卡", phantom === 0, phantom ? `${phantom} 个空名` : "无空名");

// 废墟沙城饰品此前从未并入 RelicSystem，单独钉死。
console.log("\n===== 废墟沙城饰品可见性 =====");
const ruinsRelics = Object.keys(window.GameDataRuinsContent?.relics || {});
ok("废墟饰品已定义", ruinsRelics.length > 0, `${ruinsRelics.length} 个`);
ruinsRelics.forEach(name => ok(`饰品 ${name}`, !!window.RelicSystem.data(name)));

console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
process.exit(fail ? 1 : 0);
