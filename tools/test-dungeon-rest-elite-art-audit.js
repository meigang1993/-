// 本轮三项修复的严格检查：
//   A) 四个副本固定篝火节点统一落在 BOSS 前一层
//   B) 水下列车精英不再被 mixedEliteFrom=11 锁死在后段固定层数
//   C) 伊迪斯立绘已换成去水印的新图，引用唯一、旧图已清、bundle 同步
// 含运行时反向验证：把旧配置加回去应精准打红，断言不是空转。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const crypto = require("crypto");

global.window = global;
const ROOT = path.resolve(__dirname, "..");
const load = f => vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), "utf8"), { filename: f });
const read = f => fs.readFileSync(path.join(ROOT, f), "utf8");

let pass = 0, total = 0;
const T = (name, ok, extra) => {
  total++;
  if (ok) { pass++; console.log(`✅ ${name}`); }
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!ok;
};

// ---------- 最小依赖装配（与 check-dungeon-routes / test-economy-balance 同口径） ----------
load("src/original/game-random.js");
load("src/original/economy-config.js");
load("src/original/data-ruins-sand-city.js");
load("src/original/data-future-dungeons.js");
window.GameDataMachineFactoryEnemies = [{ id: "machine" }];
window.GameDataUnderwaterTrainEnemies = [{ id: "train" }];
window.GameDataRuinsSandCityEnemies = [{ id: "ruins" }];
window.GameDataFutureEnemies = {};
load("src/original/data-world.js");
load("src/original/dungeon-map.js");
const missions = GameDataWorld.missions;
const mission = id => missions.find(m => m.id === id);
const MISSIONS = ["machine_factory", "underwater_train", "orc_dungeon", "ruins_sand_city"];
const bossOf = m => (m.route?.boss || [m.route?.layers])[0];

// ---------- A. 四个副本固定篝火 = BOSS 前一层 ----------
function restOk(m) {
  const r = m.route, boss = bossOf(m), rest = r.rest || [];
  if (!rest.length) return false;
  if (!rest.every(L => L === boss - 1)) return false;
  if ((r.chest || []).some(L => rest.includes(L))) return false;
  if (rest.some(L => L < 2 || L >= boss)) return false;
  return true;
}
for (const id of MISSIONS) {
  const m = mission(id);
  T(`A1 ${id}: 4 副本均已注册`, !!m, { id });
  T(`A2 ${id}: 篝火落在 BOSS 前一层`, restOk(m),
    { rest: m?.route?.rest, boss: bossOf(m), chest: m?.route?.chest });
  T(`A3 ${id}: 篝火只有一组且不压宝箱`, (m.route.rest || []).length >= 1
    && !(m.route.chest || []).some(L => m.route.rest.includes(L)), m.route);
}
// 反向：把旧篝火层加回去，新口径应判失败
const oldRests = { machine_factory: [5], underwater_train: [10], orc_dungeon: [9], ruins_sand_city: [4, 9] };
for (const id of MISSIONS) {
  const m = mission(id);
  const reverted = { route: { ...m.route, rest: oldRests[id] } };
  T(`A4-REVERT ${id}: 旧篝火层不满足新口径`, !restOk(reverted), { old: oldRests[id], boss: bossOf(m) });
}

// ---------- B. 水下列车精英层不再固定 ----------
const uw = mission("underwater_train");
const diff = GameDataWorld.difficulties.normal;
const fixedLayers = new Set([1, ...(uw.route.rest || []), ...(uw.route.chest || []), ...(uw.route.boss || [bossOf(uw)])]);
function eliteLayers(m, seed) {
  const st = { random: { version: 1, seed: seed >>> 0, cursor: 0 } };
  return window.DungeonMap.buildLayers(m, diff, st).flat()
    .filter(n => n.type === "elite").map(n => n.layer);
}
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 7919);
const runs = SEEDS.map(s => eliteLayers(uw, s));
const union = [...new Set(runs.flat())].sort((a, b) => a - b);
T("B1 水下列车不再配置 mixedEliteFrom", uw.route.mixedEliteFrom === undefined, uw.route);
T("B2 精英层覆盖 11 层之前（前中段）", union.some(L => L < 11), union);
T("B3 精英层覆盖 11 层及之后", union.some(L => L >= 11), union);
T("B4 精英位置随种子变化", new Set(runs.map(r => r.join(","))).size > 1,
  { distinct: new Set(runs.map(r => r.join(","))).size });
T("B5 固定层（起点/篝火/宝箱/BOSS）不出精英", union.every(L => !fixedLayers.has(L)),
  { union, fixed: [...fixedLayers] });
T("B6 至少部分局出现精英", runs.some(r => r.length > 0), { withElite: runs.filter(r => r.length).length });
// 反向：运行时加回 mixedEliteFrom=11，前中段应重新消失
const uwReverted = { ...uw, route: { ...uw.route, mixedEliteFrom: 11 } };
const revUnion = [...new Set(SEEDS.flatMap(s => eliteLayers(uwReverted, s)))].sort((a, b) => a - b);
T("B7-REVERT 加回 11 层限制后精英只落在后段", revUnion.length > 0 && revUnion.every(L => L >= 11), revUnion);

// ---------- C. 伊迪斯立绘替换 ----------
const enemySrc = read("src/original/data-machine-factory-enemies.js");
const artMatch = /art:\s*"\.\/assets\/images\/(pursuer-edis\.([a-f0-9]{8})\.webp)"/.exec(enemySrc);
T("C1 伊迪斯 art 引用为规范命名", !!artMatch, { hit: (enemySrc.match(/pursuer-edis\./g) || []).length });
const artName = artMatch ? artMatch[1] : "";
const artPath = path.join(ROOT, "publish/assets/images", artName);
T("C2 新立绘文件存在", !!artName && fs.existsSync(artPath), { artName });
if (artName && fs.existsSync(artPath)) {
  const data = fs.readFileSync(artPath);
  const sha8 = crypto.createHash("sha256").update(data).digest("hex").slice(0, 8);
  T("C3 文件名 sha8 与内容一致", artName.includes(sha8), { artName, sha8 });
  T("C4 新图为高清原图（>200KB）", data.length > 200000, { bytes: data.length });
}
T("C5 旧立绘已从资源目录清除",
  !fs.existsSync(path.join(ROOT, "publish/assets/images/pursuer-edis.8062b085.webp")));
T("C6 源码中伊迪斯图片引用唯一", (enemySrc.match(/pursuer-edis\.[a-f0-9]{8}\.webp/g) || []).length === 1,
  (enemySrc.match(/pursuer-edis\.[a-f0-9]{8}\.webp/g) || []));
const bundles = fs.readdirSync(path.join(ROOT, "publish/bundles"))
  .filter(f => f.endsWith(".js"));
const synced = bundles.filter(f => read(`publish/bundles/${f}`).includes(artName));
T("C7 bundle 已同步新立绘引用", synced.length > 0, { synced });
T("C8 旧文件名不在任何 bundle 内",
  !bundles.some(f => read(`publish/bundles/${f}`).includes("pursuer-edis.8062b085.webp")));

console.log(`\n通过 ${pass}/${total}`);
process.exitCode = pass === total ? 0 : 1;
