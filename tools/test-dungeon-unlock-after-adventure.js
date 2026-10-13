// 精确复现玩家场景：机械工厂推到冒险级之后，再解锁/通关水下列车，
// 验证水下列车的难度链不会跟着机械工厂的进度一起被解锁。
//
// 与 test-dungeon-per-mission-unlock-reallink.js 的关键区别：
// 那份测试用 P.mark?.() 写通关记录，而 ButlerManualProgress 根本没有 mark 方法
// （可选调用变成空操作），所以 butlerFeats 全程为空 —— migrate/chain 这条
// 按通关记录重算的路径从未被真正覆盖过。本测试改用真实存在的 P.recordClear。

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
  "data-world.js", "data.js", "data-future-relics.js", "data-relics.js",
  "dungeon-unlocks.js",
].forEach(load);
load("butler-manual-progress.js");
[
  "relics.js", "bounty-ledger.js", "receipt-ledger.js",
  "unlock-event-progress.js", "save-epoch.js", "store-state-factory.js",
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
const R = window.DungeonRunRewards;
const MISSIONS = ["machine_factory", "underwater_train", "orc_dungeon", "ruins_sand_city"];

let passed = 0, failed = 0;
function ok(cond, msg) {
  if (cond) { console.log(`✅ ${msg}`); passed += 1; }
  else { console.log(`❌ ${msg}`); failed += 1; }
}

function fresh() {
  const s = window.GameStoreStateFactory.freshState();
  s.dungeonUnlocks = {};
  s.unlockedDifficulties = ["normal"];
  s.butlerFeats = [];
  s.flags = s.flags || {};
  return s;
}
function makeRun(state, missionId, difficultyId, tag) {
  const party = (state.party || []).slice(0, 1);
  return {
    focusId: tag, missionId, difficultyId,
    party, activeParty: party, current: "n1-0", pending: null,
    layers: [[{ id: "n1-0", layer: 1, col: 0, type: "start", done: true, next: [] }]],
    earned: { gold: 0, essence: 0, cards: [], relics: [] },
    rewardPopup: false, complete: true, banked: false,
  };
}
// 真实通关：先写通关记录（管家手册），再走结算入口。
async function clearDungeon(s, missionId, difficultyId) {
  P.recordClear(s, missionId, difficultyId);
  s.explore = makeRun(s, missionId, difficultyId, `t-${missionId}-${difficultyId}`);
  await R.finish(s);
}
// 模拟存档加载：store-migrations.js 与 server-core-apply.js 都会调它。
function reload(s) { U.migrate(s); return s; }
// 模拟一次出征的 core 往返：快照 -> apply（apply 内部也会 migrate）。
function roundTrip(s) {
  const core = window.LocalCoreUtils.sanitize(s, "startDungeon");
  const copy = JSON.parse(JSON.stringify({ ...s, ...core }));
  window.ServerCoreApply.apply(copy, core, { method: "startDungeon" });
  s.dungeonUnlocks = copy.dungeonUnlocks;
  s.unlockedDifficulties = copy.unlockedDifficulties;
  return s;
}
function lists(s) {
  return MISSIONS.map(id => `${id}=${JSON.stringify(U.list(s, id))}`).join(" ");
}

async function main() {
  console.log("--- A. 前置：通关记录模块与写入方式可用 ---");
  ok(typeof P.recordClear === "function", "P.recordClear 存在（测试的写入方式有效）");
  ok(P.mark === undefined, "P.mark 不存在——旧测试用 P.mark?.() 是空操作，已被本测试取代");
  {
    const s = fresh();
    P.recordClear(s, "machine_factory", "normal");
    ok(s.butlerFeats.includes("clear:machine_factory@normal"),
      `recordClear 真实写入 -> ${JSON.stringify(s.butlerFeats)}`);
  }

  console.log("\n--- B. 玩家场景：机械工厂推到冒险级 ---");
  const s = fresh();
  s.flags.underwaterTrainUnlocked = false;
  await clearDungeon(s, "machine_factory", "normal");
  ok(JSON.stringify(U.list(s, "machine_factory")) === JSON.stringify(["normal", "adventure"]),
    `机械工厂通普通 -> ${JSON.stringify(U.list(s, "machine_factory"))}`);
  await clearDungeon(s, "machine_factory", "adventure");
  ok(JSON.stringify(U.list(s, "machine_factory")) === JSON.stringify(["normal", "adventure", "warrior"]),
    `机械工厂通冒险 -> ${JSON.stringify(U.list(s, "machine_factory"))}`);
  ok(JSON.stringify(U.list(s, "underwater_train")) === JSON.stringify(["normal"]),
    `此刻水下列车仍只有普通级 -> ${JSON.stringify(U.list(s, "underwater_train"))}`);

  console.log("\n--- C. 解锁水下列车副本（尚未打过） ---");
  s.flags.underwaterTrainUnlocked = true;
  s.flags.underwaterTrainUnlockSeen = true;
  ok(JSON.stringify(U.list(s, "underwater_train")) === JSON.stringify(["normal"]),
    `刚解锁的水下列车只应有普通级 -> ${JSON.stringify(U.list(s, "underwater_train"))}`);
  ok(!U.has(s, "underwater_train", "adventure"),
    `刚解锁的水下列车不应已有冒险级 -> adventure=${U.has(s, "underwater_train", "adventure")}`);

  console.log("\n--- D. 存档加载 / 出征往返后仍不外溢 ---");
  reload(s);
  ok(JSON.stringify(U.list(s, "underwater_train")) === JSON.stringify(["normal"]),
    `migrate 重算后水下列车仍普通级 -> ${JSON.stringify(U.list(s, "underwater_train"))}`);
  ok(JSON.stringify(U.list(s, "machine_factory")) === JSON.stringify(["normal", "adventure", "warrior"]),
    `migrate 后机械工厂进度保留 -> ${JSON.stringify(U.list(s, "machine_factory"))}`);
  roundTrip(s);
  ok(JSON.stringify(U.list(s, "underwater_train")) === JSON.stringify(["normal"]),
    `core 往返后水下列车仍普通级 -> ${JSON.stringify(U.list(s, "underwater_train"))}`);
  roundTrip(s);
  ok(JSON.stringify(U.list(s, "machine_factory")) === JSON.stringify(["normal", "adventure", "warrior"]),
    `core 往返后机械工厂不被回收 -> ${JSON.stringify(U.list(s, "machine_factory"))}`);

  console.log("\n--- E. 真正通关水下列车普通级后才解锁冒险 ---");
  await clearDungeon(s, "underwater_train", "normal");
  ok(JSON.stringify(U.list(s, "underwater_train")) === JSON.stringify(["normal", "adventure"]),
    `水下列车通普通 -> ${JSON.stringify(U.list(s, "underwater_train"))}`);
  ok(JSON.stringify(U.list(s, "machine_factory")) === JSON.stringify(["normal", "adventure", "warrior"]),
    `机械工厂不受影响 -> ${JSON.stringify(U.list(s, "machine_factory"))}`);
  ok(JSON.stringify(U.list(s, "orc_dungeon")) === JSON.stringify(["normal"]),
    `兽人地下城仍普通级 -> ${JSON.stringify(U.list(s, "orc_dungeon"))}`);
  ok(JSON.stringify(U.list(s, "ruins_sand_city")) === JSON.stringify(["normal"]),
    `废墟沙城仍普通级 -> ${JSON.stringify(U.list(s, "ruins_sand_city"))}`);

  console.log("\n--- F. 混合进度下的完整快照 ---");
  console.log(`   ${lists(s)}`);
  reload(s);
  ok(JSON.stringify(U.list(s, "underwater_train")) === JSON.stringify(["normal", "adventure"]),
    `最终 migrate 后水下列车 -> ${JSON.stringify(U.list(s, "underwater_train"))}`);

  console.log(`\n通过 ${passed} / ${passed + failed}`);
  if (failed) process.exitCode = 1;
}
main().catch(e => { console.error(e); process.exitCode = 1; });
