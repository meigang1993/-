// 旧存档难度解锁回收测试：全局数组里外溢来的难度，必须按副本各自的通关记录锁回。
//
// 背景 BUG：老存档迁移让"已开放的副本"整体继承全局 unlockedDifficulties，
// 于是通关机械工厂·普通级得来的 adventure 会外溢到其余三个副本——
// 玩家从未打过水下列车·普通级，冒险级却显示已解锁。
// 修复后：普通级恒解锁，此后每档都必须有该副本自己的 clear 记录才保留。
//
// 注意加载顺序：ruins_sand_city 的 mission 由 data-future-dungeons.js 合并，
// 因此 data-ruins-sand-city.js 必须先于它加载（与生产 bundle 顺序一致），
// 否则第 4 个副本会缺席，测试只剩 3 个副本却仍然"全绿"。

const fs = require("fs");
const vm = require("vm");

global.window = global;
global.console = console;
function load(file) {
  vm.runInThisContext(fs.readFileSync(`./src/original/${file}`, "utf8"), { filename: file });
}
[
  "game-random.js",
  "economy-config.js", "data-cards.js", "card-utils.js",
  "data-characters-core.js", "data-characters-extra.js",
  "data-future-characters.js", "data-new-characters.js", "data-characters.js",
  "character-progression.js",
  "data-ruins-sand-city-enemies.js", "data-ruins-sand-city.js", "data-ruins-content.js",
  "data-future-dungeons.js", "data-future-orc-enemies.js", "data-bakar-enemy.js",
  "data-future-enemies.js",
  "data-orc-bondi.js", "data-guard-kelly.js", "data-sakura-risa.js",
  "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
  "data-ruins-sand-city-enemies.js",
  "data-world.js", "data.js", "data-future-relics.js", "data-relics.js",
  "dungeon-unlocks.js", "butler-manual-progress.js",
  "relics.js", "bounty-ledger.js", "receipt-ledger.js",
  "unlock-event-progress.js", "store-state-factory.js",
  "store-save-schema.js", "local-core-utils.js",
  "local-core-character.js", "local-core-commerce.js",
  "local-core-bounty.js", "local-core-dungeon.js", "local-core-events.js", "local-core.js",
  "server-core-apply.js", "server-core.js", "dungeon-enemies.js",
  "dungeon-map.js", "dungeon-events.js", "dungeon-reward-core.js", "dungeon-reward-payload.js",
  "settlement-recovery.js", "dungeon-settlement-actions.js",
  "orc-unlock-events.js", "new-character-unlock-events.js", "dungeon-node-rewards.js",
  "dungeon-run-rewards.js", "dungeon-rewards.js",
].forEach(load);

const U = window.DungeonUnlocks;
const P = window.ButlerManualProgress;
const MISSIONS = ["machine_factory", "underwater_train", "orc_dungeon", "ruins_sand_city"];

// 旧存档形态：dungeonUnlocks 为空表，全局数组含 adventure，
// 通关记录只有机械工厂·普通级。
const state = window.GameStoreStateFactory.freshState();
state.flags.underwaterTrainUnlocked = true;
state.flags.orcDungeonUnlocked = true;
state.flags.ruinsSandCityUnlocked = true;
state.dungeonUnlocks = {};
state.unlockedDifficulties = ["normal", "adventure"];
state.butlerFeats = ["clear:machine_factory@normal"];


function assert(cond, msg) {
  if (cond) { console.log(`✅ ${msg}`); passed += 1; }
  else { console.log(`❌ ${msg}`); failed += 1; }
}
let passed = 0, failed = 0;

// A. 四个副本都必须已注册（少一个则说明加载顺序不对）。
const registered = (window.GameData.missions || []).filter(m => m?.kind === "dungeon").map(m => m.id);
assert(MISSIONS.every(id => registered.includes(id)), `A1 四个副本均已注册 -> ${JSON.stringify(registered)}`);

// B. 旧存档：只有机械工厂有通关记录，其余副本的冒险级必须锁回。
const s1 = window.GameStoreStateFactory.freshState();
s1.flags.underwaterTrainUnlocked = true;
s1.flags.orcDungeonUnlocked = true;
s1.flags.ruinsSandCityUnlocked = true;
s1.dungeonUnlocks = {};
s1.unlockedDifficulties = ["normal", "adventure", "warrior"];
s1.butlerFeats = ["clear:machine_factory@normal"];
U.migrate(s1);
MISSIONS.forEach(id => {
  const list = U.list(s1, id);
  if (id === "machine_factory") {
    assert(list.includes("adventure"), `B-machine_factory 有记录应保留冒险级 (${JSON.stringify(list)})`);
  } else {
    assert(list.length === 1 && list[0] === "normal",
      `B-${id} 无自身记录应锁回普通级 (${JSON.stringify(list)})`);
  }
});

// C. 已写入外溢值的存档：再次加载时被回收。
const s2 = window.GameStoreStateFactory.freshState();
s2.flags.underwaterTrainUnlocked = true;
s2.dungeonUnlocks = { underwater_train: ["normal", "adventure", "warrior"] };
s2.unlockedDifficulties = ["normal", "adventure", "warrior"];
s2.butlerFeats = ["clear:machine_factory@normal"];
U.migrate(s2);
const c = U.list(s2, "underwater_train");
assert(c.length === 1 && c[0] === "normal", `C1 已污染存档应被回收 (${JSON.stringify(c)})`);

// D. 正常通关流程不得被误锁。
const s3 = window.GameStoreStateFactory.freshState();
s3.flags.underwaterTrainUnlocked = true;
s3.dungeonUnlocks = {};
s3.unlockedDifficulties = ["normal"];
P.recordClear(s3, "underwater_train", "normal");
U.unlockNext(s3, "underwater_train", "normal");
const before = U.list(s3, "underwater_train");
U.migrate(s3);
const after = U.list(s3, "underwater_train");
assert(JSON.stringify(before) === JSON.stringify(after) && after.includes("adventure"),
  `D1 正常进度不被误锁 (${JSON.stringify(before)} -> ${JSON.stringify(after)})`);

console.log(`\n总计 ${failed ? `失败 ${failed}` : `全部通过`} (${passed}/${passed + failed})`);
process.exit(failed ? 1 : 0);
