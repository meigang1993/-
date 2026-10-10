// 管家手册 / 成就与「副本难度解锁」的耦合检查。
//
// 背景：难度解锁从全局数组改为按副本独立（state.dungeonUnlocks）。
// 需要确认管家手册（butlerFeats）与解锁链事件不受这次改动影响。
//
// 管家手册记录的是"完成记录"（形如 clear:mission@diff / boss:enemy@diff），
// 与 unlockedDifficulties / dungeonUnlocks 是两套数据，本脚本实测确认解耦。
const fs = require("fs");
const vm = require("vm");

global.window = global;
global.console = console;

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

[
  "game-random.js",
  "economy-config.js", "data-cards.js", "card-utils.js",
  "data-characters-core.js", "data-characters-extra.js",
  "data-future-characters.js", "data-new-characters.js", "data-characters.js",
  "character-progression.js",
  "data-future-dungeons.js", "data-future-orc-enemies.js", "data-bakar-enemy.js",
  "data-future-enemies.js",
  "data-orc-bondi.js", "data-guard-kelly.js", "data-sakura-risa.js",
  "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
  "data-ruins-sand-city-enemies.js",
  "data-world.js", "data.js",
  "dungeon-unlocks.js",
  "relics.js", "bounty-ledger.js", "receipt-ledger.js",
  "unlock-event-progress.js", "store-state-factory.js",
  "orc-unlock-events.js",
  "butler-manual-progress.js",
].forEach(file => load(`./src/original/${file}`));

const P = window.ButlerManualProgress;
const U = window.DungeonUnlocks;
const GD = window.GameData;
const DIFFS = ["normal", "adventure", "warrior", "king", "hell"];

let pass = 0;
const fails = [];
function check(ok, label, extra = "") {
  if (ok) { pass += 1; console.log(`✅ ${label}`); }
  else { fails.push(label); console.log(`❌ ${label}${extra ? ` — ${extra}` : ""}`); }
}

function fresh() {
  const s = window.GameStoreStateFactory.freshState();
  s.flags.underwaterTrainUnlocked = true;
  s.flags.orcDungeonUnlocked = true;
  return s;
}

// A. 管家手册是"完成记录"，与解锁状态解耦。
function testManualDecoupled() {
  const s = fresh();
  const before = P.overall(s);
  // 记录一次水下列车·冒险级通关
  P.recordClear(s, "underwater_train", "adventure");
  const after = P.overall(s);
  check(after.explore.done > before.explore.done,
    "A1 记录通关后手册完成数增加",
    `before=${before.explore.done} after=${after.explore.done}`);

  // 把解锁表压回"只解锁普通级"，手册记录不应受影响。
  s.dungeonUnlocks = { underwater_train: ["normal"] };
  s.unlockedDifficulties = ["normal"];
  const squeezed = P.overall(s);
  check(squeezed.explore.done === after.explore.done,
    "A2 解锁表被压缩后手册完成数不变",
    `${after.explore.done} → ${squeezed.explore.done}`);
  check(P.doneDiffs(s, "clear", "underwater_train").includes("adventure"),
    "A3 手册仍显示水下列车·冒险级已完成",
    JSON.stringify(P.doneDiffs(s, "clear", "underwater_train")));
}

// B. 解锁链：通关水下列车·冒险级 → 触发兽人地下城解锁事件。
// 该事件只看 run 实际完成，不读 unlockedDifficulties，改后仍应成立。
function testUnlockChain() {
  const s = fresh();
  delete s.flags.orcDungeonUnlocked;
  const fired = window.triggerOrcDungeonUnlockEvent
    ? window.triggerOrcDungeonUnlockEvent(s, { missionId: "underwater_train", difficultyId: "adventure" })
    : null;
  if (fired === null) {
    console.log("⚠️ B 组跳过：harness 未加载 orc-unlock-events");
    return;
  }
  check(fired === true, "B1 通关水下列车·冒险级触发兽人地下城解锁", `返回=${fired}`);

  const s2 = fresh();
  delete s2.flags.orcDungeonUnlocked;
  const notFired = window.triggerOrcDungeonUnlockEvent(s2, { missionId: "underwater_train", difficultyId: "normal" });
  check(notFired === false, "B2 普通级不触发该解锁（条件仍严格）", `返回=${notFired}`);
}

// C. 迁移与已通关记录的一致性。
// 迁移按通关记录逐档递推：打过普通级才有冒险级、打过冒险级才有勇士级。
// 真实流程里通关勇士级必然先打过前两档，故这里把整条链的记录补齐。
function testMigrateConsistency() {
  const s = fresh();
  s.unlockedDifficulties = ["normal", "adventure", "warrior"];
  delete s.dungeonUnlocks;
  P.recordClear(s, "underwater_train", "normal");
  P.recordClear(s, "underwater_train", "adventure");
  P.recordClear(s, "underwater_train", "warrior");
  U.migrate(s);

  check(U.has(s, "underwater_train", "warrior"),
    "C1 迁移后已开放副本仍保留勇士级",
    JSON.stringify(U.list(s, "underwater_train")));
  check(P.doneDiffs(s, "clear", "underwater_train").includes("warrior"),
    "C2 手册记录与迁移后解锁一致（打过且仍可打）");

  // 未开放副本只给普通级，且不可能有通关记录（打不了）。
  // 用 underwater_train 去掉开放 flag 模拟（ruins_sand_city 未注册进 missions，见文末说明）。
  const s2 = fresh();
  delete s2.flags.underwaterTrainUnlocked;
  s2.unlockedDifficulties = ["normal", "adventure", "warrior"];
  U.migrate(s2);
  const locked = U.list(s2, "underwater_train");
  check(locked.length === 1 && locked[0] === "normal",
    "C3 未开放副本迁移后只给普通级",
    JSON.stringify(locked));
  check(P.doneDiffs(s2, "clear", "underwater_train").length === 0,
    "C4 未开放副本无通关记录（与实际一致）");
}

// D. 五个难度档在手册里都有格子，不随解锁收缩。
function testManualGridStable() {
  const s = fresh();
  const explore = P.exploreList(s);
  const dungeonRows = explore.filter(m => !m.tutorial);
  check(dungeonRows.length === P.missions().length,
    "D1 手册探索页涵盖全部副本",
    `${dungeonRows.length} vs ${P.missions().length}`);
  const allFive = dungeonRows.every(m => m.diffs.length === DIFFS.length);
  check(allFive, "D2 每个副本的格子恒为 5 档（不随解锁收缩）",
    JSON.stringify(dungeonRows.map(m => m.diffs.length)));
}

testManualDecoupled();
testUnlockChain();
testMigrateConsistency();
testManualGridStable();

console.log(`\n通过 ${pass} / ${pass + fails.length}`);
if (fails.length) {
  console.log("失败：" + fails.join(" | "));
  process.exit(1);
}
