// 严格核查：解锁某一副本的难度后，其余副本的同名难度会不会同时解锁。
// 与既有两份测试的区别：本份专门盯「跨副本外溢」的所有可能入口，
// 包括老存档缺 butlerFeats 导致 migrate 整份跳过、进而回退全局数组的路径。

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
const MISSIONS = ["machine_factory", "underwater_train", "orc_dungeon", "ruins_sand_city"];
const CHAIN = ["normal", "adventure", "warrior", "king", "hell"];

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { console.log(`✅ ${msg}`); passed += 1; }
  else { console.log(`❌ ${msg}`); failed += 1; }
}
function fresh() {
  const s = window.GameStoreStateFactory.freshState();
  s.dungeonUnlocks = {};
  s.unlockedDifficulties = ["normal"];
  s.butlerFeats = [];
  return s;
}
function lists(s) {
  return MISSIONS.map(id => `${id}=${JSON.stringify(U.list(s, id))}`).join(" | ");
}
function step(s, missionId, difficultyId) {
  P.recordClear(s, missionId, difficultyId);
  U.unlockNext(s, missionId, difficultyId);
  U.migrate(s);
}

// A. 四个副本都已注册（历史上我误报过"只有 3 个"）。
const registered = (window.GameData.missions || []).filter(m => m?.kind === "dungeon").map(m => m.id);
assert(MISSIONS.every(id => registered.includes(id)), `A1 四个副本均已注册 -> ${JSON.stringify(registered)}`);

// B. 逐个副本推满五档，每一步其余副本不得跟着解锁。
console.log("\n--- B. 正向推进：每推一档，核查其余三个副本 ---");
MISSIONS.forEach(target => {
  const s = fresh();
  let clean = true;
  for (let i = 0; i < CHAIN.length - 1; i += 1) {
    step(s, target, CHAIN[i]);
    const others = MISSIONS.filter(id => id !== target);
    const leaked = others.flatMap(id => CHAIN.slice(1).filter(d => U.has(s, id, d)).map(d => `${id}/${d}`));
    if (leaked.length) {
      clean = false;
      console.log(`   泄漏：推 ${target}@${CHAIN[i]} 后 ${JSON.stringify(leaked)} 也解锁了 -> ${lists(s)}`);
    }
  }
  assert(clean, `B:${target} 推满五档全程，其余三副本始终只有普通级 -> ${lists(s)}`);
  assert(U.list(s, target).length === CHAIN.length, `B:${target} 自身应推满 ${CHAIN.length} 档 -> ${JSON.stringify(U.list(s, target))}`);
});

// C. 交叉推进：机械工厂推到地狱级的途中，另三个副本同时各自推进，互不影响。
console.log("\n--- C. 交叉推进 ---");
{
  const s = fresh();
  step(s, "machine_factory", "normal");
  step(s, "underwater_train", "normal");
  step(s, "machine_factory", "adventure");
  step(s, "orc_dungeon", "normal");
  step(s, "machine_factory", "warrior");
  const shown = id => CHAIN.filter(d => U.has(s, id, d));
  assert(shown("machine_factory").join() === "normal,adventure,warrior,king", `C1 机械工厂 4 档 -> ${JSON.stringify(shown("machine_factory"))}`);
  assert(shown("underwater_train").join() === "normal,adventure", `C2 水下列车 2 档 -> ${JSON.stringify(shown("underwater_train"))}`);
  assert(shown("orc_dungeon").join() === "normal,adventure", `C3 兽人地下城 2 档 -> ${JSON.stringify(shown("orc_dungeon"))}`);
  assert(shown("ruins_sand_city").join() === "normal", `C4 废墟沙城仍只普通级 -> ${JSON.stringify(shown("ruins_sand_city"))}`);
}

// D. 派生字段：state.unlockedDifficulties 是各副本并集，不得被当成解锁判据。
console.log("\n--- D. 派生字段不得反向污染判据 ---");
{
  const s = fresh();
  step(s, "machine_factory", "normal");
  step(s, "machine_factory", "adventure");
  assert(s.unlockedDifficulties.includes("adventure"), `D1 派生字段含 adventure（并集语义）-> ${JSON.stringify(s.unlockedDifficulties)}`);
  const leaked = MISSIONS.filter(id => id !== "machine_factory" && U.has(s, id, "adventure"));
  assert(leaked.length === 0, `D2 虽有并集，其余副本 adventure 仍锁定 -> 泄漏 ${JSON.stringify(leaked)}`);
}

// E. 老存档缺 butlerFeats：migrate 会整份跳过，此时 list() 回退全局数组。
//    这是"跨副本同时解锁"最可能的复活路径，必须明确其实际行为。
console.log("\n--- E. 老存档缺 butlerFeats（migrate 跳过 → 回退全局数组）---");
{
  const s = fresh();
  delete s.butlerFeats;
  s.dungeonUnlocks = undefined;
  s.unlockedDifficulties = ["normal", "adventure", "warrior"];
  U.migrate(s);
  const tableAfter = JSON.stringify(s.dungeonUnlocks || {});
  const all = MISSIONS.map(id => U.list(s, id));
  const leaked = MISSIONS.filter(id => U.has(s, id, "warrior"));
  console.log(`   migrate 后 dungeonUnlocks=${tableAfter}；各副本=${JSON.stringify(all)}`);
  assert(tableAfter === "{}", `E1 缺通关记录时 migrate 整份跳过（不写半套）-> ${tableAfter}`);
  assert(leaked.length === MISSIONS.length || leaked.length === 0,
    `E2 回退分支下各副本一致（要么全锁要么全开，不得部分外溢）-> 泄漏 ${JSON.stringify(leaked)}`);
  if (leaked.length === MISSIONS.length) {
    console.log("   ⚠️ 触发回退：四个副本同时显示 warrior 已解锁（老存档未通关记录时）");
  }
}

// F. 老存档有 butlerFeats 但无通关记录：外溢难度必须被回收。
console.log("\n--- F. 老存档有 butlerFeats 但无通关记录：外溢应被回收 ---");
{
  const s = fresh();
  s.dungeonUnlocks = undefined;
  s.unlockedDifficulties = ["normal", "adventure", "warrior"];
  s.butlerFeats = [];
  U.migrate(s);
  const all = MISSIONS.map(id => U.list(s, id));
  assert(all.every(l => l.join() === "normal"), `F1 四个副本全部回收到普通级 -> ${JSON.stringify(all)}`);
}

// G. 本地核心：出征判定不得因 core 快照而放行未解锁难度。
console.log("\n--- G. 本地核心出征判定 ---");
{
  const s = fresh();
  step(s, "machine_factory", "normal");
  const core = window.LocalCoreUtils.sanitize(s, window.LocalCoreUtils.operationScope("startDungeon"));
  const ok = window.LocalCoreDungeonOps.startDungeon(core, { missionId: "machine_factory", difficultyId: "adventure" });
  const bad = window.LocalCoreDungeonOps.startDungeon(core, { missionId: "underwater_train", difficultyId: "adventure" });
  assert(ok && ok.accepted, `G1 机械工厂 adventure 允许出征 -> ${JSON.stringify(ok)}`);
  assert(!bad || !bad.accepted, `G2 水下列车 adventure 被拒 -> ${JSON.stringify(bad)}`);
}

console.log(`\n结果：${passed} 通过 / ${failed} 失败`);
process.exit(failed ? 1 : 0);
