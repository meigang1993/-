/* global GameData */

// 验证：1) 用户描述的 5 条规则仍成立  2) 3 个精英怪会出现 → 6 张卡可解锁
const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();

[
  "dungeon-map.js", "dungeon-enemies.js", "data-ruins-sand-city-enemies.js",
  "data-ruins-content.js", "data-ruins-sand-city.js", "data-future-dungeons.js",
].forEach(f => vm.runInThisContext(fs.readFileSync(`./src/original/${f}`, "utf8"), { filename: f }));
if (!GameData.enemies.ruins_sand_city) GameData.enemies.ruins_sand_city = window.GameDataRuinsSandCity.enemies;

let pass = 0, fail = 0;
const ok = (n, c, extra = "") => { c ? (pass++, console.log(`✅ ${n}${extra ? "  " + extra : ""}`)) : (fail++, console.log(`❌ ${n}${extra ? "  " + extra : ""}`)); };

const mission = window.GameDataRuinsSandCity.mission;
const route = mission.route;

// ---------- 1. 用户描述的 5 条规则 ----------
console.log("===== 1. 用户规则的 5 条（200 局） =====");
const N = 200;
let layersOk = true, startOk = true, bossOk = true, restOk = true, chestOk = true, layouts = new Set();
let cntMin = 9, cntMax = 0, dup4 = 0, labelOk = true;

for (let i = 0; i < N; i++) {
  const diff = GameData.difficulties.normal;
  const layers = window.DungeonMap.buildLayers(mission, diff, window.state);
  const nodes = layers.flat();
  if (layers.length !== 15) layersOk = false;
  const byLayer = {};
  nodes.forEach(n => { (byLayer[n.layer] ||= []).push(n); });
  if (!(byLayer[1]?.length === 1 && byLayer[1][0].type === "start")) startOk = false;
  if (!(byLayer[15]?.length === 1 && byLayer[15][0].type === "boss")) bossOk = false;
  if (!(byLayer[4]?.length === 1 && byLayer[4][0].type === "rest")) restOk = false;
  if (!(byLayer[9]?.length === 1 && byLayer[9][0].type === "rest")) restOk = false;
  if (!(byLayer[7]?.length === 1 && byLayer[7][0].type === "chest")) chestOk = false;
  layouts.add(nodes.map(n => n.type).join(""));

  // 普通节点怪物数 1~4 + ABCD
  nodes.filter(n => n.type === "normal").forEach(n => {
    const g = window.DungeonEnemyGroups.enemiesFor({ missionId: "ruins_sand_city", difficultyId: "normal" }, "normal", window.state);
    if (g.length < 1 || g.length > 4) labelOk = false;
    cntMin = Math.min(cntMin, g.length); cntMax = Math.max(cntMax, g.length);
    if (g.length === 4 && new Set(g.map(e => e.id)).size === 1) dup4++;
    const labels = g.filter(e => e.label).map(e => e.label);
    if (labels.length && !labels.every(l => "ABCD".includes(l))) labelOk = false;
  });
}
ok("15 层", layersOk);
ok("第 1 层起点", startOk);
ok("第 15 层 BOSS", bossOk);
ok("篝火固定在第 4、9 层各一个", restOk);
ok("宝箱固定在第 7 层一个", chestOk);
ok("节点随机（布局多样性）", layouts.size > 50, `${layouts.size}/200 种`);
ok("普通战斗 1~4 只", labelOk && cntMin >= 1 && cntMax <= 4, `实测 ${cntMin}~${cntMax}`);
ok("可出现 4 个相同怪", dup4 > 0, `${dup4} 次`);

// ---------- 2. 3 个精英怪是否出现 ----------
console.log("\n===== 2. 精英节点敌人编组覆盖（3000 次抽样） =====");
const seen = {};
for (let i = 0; i < 3000; i++) {
  const g = window.DungeonEnemyGroups.enemiesFor({ missionId: "ruins_sand_city", difficultyId: "normal" }, "elite", window.state);
  g.forEach(e => { seen[e.id] = (seen[e.id] || 0) + 1; });
}
console.log("精英节点出现过的敌人:", JSON.stringify(seen));
const TARGETS = ["hilde", "attack_helicopter", "armored_carrier"];
TARGETS.forEach(t => ok(`精英怪 ${t} 会出现`, !!seen[t], `${seen[t] || 0} 次`));

// ---------- 3. 6 张卡的解锁链 ----------
console.log("\n===== 3. 依赖精英掉落的 6 张卡 =====");
const unlocks = GameData.eliteUnlocks || {};
const need = { hilde: ["偷袭", "冰冻术"], attack_helicopter: ["流星杀", "吸魔杀"], armored_carrier: ["物资私分", "枪林弹雨"] };
for (const [enemy, cards] of Object.entries(need)) {
  const have = unlocks[enemy] || [];
  const missing = cards.filter(c => !have.includes(c));
  ok(`${enemy} 掉落表含 ${cards.join("/")}`, missing.length === 0, missing.length ? `缺 ${missing}` : "");
}
ok("hilde 是 elite 类型", (GameData.enemies.ruins_sand_city || []).find(e => e.id === "hilde")?.type === "elite");
ok("attack_helicopter 是 elite 类型", (GameData.enemies.ruins_sand_city || []).find(e => e.id === "attack_helicopter")?.type === "elite");
ok("armored_carrier 是 elite 类型", (GameData.enemies.ruins_sand_city || []).find(e => e.id === "armored_carrier")?.type === "elite");

console.log(`\n===== 汇总：${pass}/${pass + fail} 通过 =====`);
process.exit(fail ? 1 : 0);
