const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

require("./store-test-env");

function loadRuntime(file) {
  vm.runInThisContext(fs.readFileSync(`./src/original/${file}`, "utf8"), {
    filename: file,
  });
}

[
  "game-random.js", "economy-config.js", "data-cards.js", "card-utils.js",
  "data-characters-core.js", "data-characters-extra.js",
  "data-future-characters.js", "data-new-characters.js", "data-characters.js",
  "data-future-dungeons.js", "data-future-orc-enemies.js",
  "data-bakar-enemy.js", "data-future-enemies.js", "data-orc-bondi.js",
  "data-guard-kelly.js", "data-sakura-risa.js",
  "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
  "data-world.js", "data.js", "data-future-relics.js", "data-relics.js",
  "relics.js", "skins.js", "bounty-ledger.js", "receipt-ledger.js",
  "unlock-event-progress.js", "character-progression.js",
  "battle-save-checkpoint-validation.js",
  "battle-save-checkpoint.js",
  "store-save-schema.js", "store-save-validation.js", "store-save-limits.js",
  "store-compact.js", "store-unlock-recovery.js", "store-unlock-migrations.js",
  "store-state-factory.js",
  "store-bounty-repairs.js", "store-repairs.js", "store-migration-characters.js",
  "store-migration-runs.js", "store-migration-normalizers.js",
  "store-migrations.js", "dungeon-map.js", "dungeon-events.js",
].forEach(loadRuntime);

function resetStorage() {
  global.cloudWritable = true;
  global.cloudReadable = true;
  global.localWritable = true;
  global.cloudValue = null;
  global.lastPutOptions = null;
  global.controlledPuts = null;
  localStorage.data.clear();
}

function recoveryStore() {
  loadRuntime("store.js");
  return window.GameStore;
}

function battleState(exploration = false) {
  const state = window.GameStore.freshState();
  state.view = "battle";
  state.battle = {
    test: false,
    exploration,
    allies: [],
    enemies: [],
    played: [],
    shownPlayed: [],
  };
  return state;
}

function dungeonRun(type = "normal") {
  return {
    focusId: "battle-start-regression",
    missionId: "machine_factory",
    difficultyId: "normal",
    party: ["lokar", "besta_doll"],
    activeParty: ["lokar", "besta_doll"],
    layers: [
      [{ id: "n1-0", layer: 1, col: 0, type: "start", done: true, next: ["n2-0"] }],
      [{
        id: "n2-0", layer: 2, col: 0, type, done: false,
        next: ["n3-0"], enemies: [],
      }],
      [{ id: "n3-0", layer: 3, col: 0, type: "boss", done: false, next: [] }],
    ],
    current: "n2-0",
    previous: "n1-0",
    pending: "n2-0",
    earned: { gold: 0, essence: 0, relics: [], cards: [] },
    lastReward: null,
    complete: false,
  };
}

async function saveAndLoad(state, activeBattle = true) {
  resetStorage();
  const store = recoveryStore();
  await store.save(state, { flush: true });
  assert.strictEqual(global.lastPutOptions?.flush, true,
    "battle-start checkpoint must request an immediate cloud flush");
  assert.strictEqual(global.cloudValue?.view, activeBattle ? "battle" : "dungeon",
    activeBattle
      ? "battle-start checkpoint must persist the active battle view"
      : "orphaned-node compatibility fixture must persist the dungeon view");
  assert.strictEqual(!!global.cloudValue?.battle, activeBattle,
    activeBattle
      ? "battle-start checkpoint must contain the active battle snapshot"
      : "orphaned-node compatibility fixture must not contain battle runtime");
  const loaded = await store.load();
  return { loaded, store };
}

(async () => {
  const standardResult = await saveAndLoad(battleState());
  const standard = standardResult.loaded;
  assert.strictEqual(standard.view, "hall",
    "loading a standard battle-start checkpoint must return to the hall");
  assert.strictEqual(standard.battle, null,
    "loading a standard battle-start checkpoint must clear battle runtime");
  assert.match(standard.log[0], /上次战斗中断/,
    "standard battle recovery must explain why the player returned");
  assert(standard._needsSaveAfterMigration,
    "interrupted battle recovery must request a durable follow-up save");
  await standardResult.store.persistMigration(standard);
  assert.strictEqual(global.cloudValue.view, "hall",
    "standard battle recovery must replace the stale cloud checkpoint");
  assert.strictEqual(global.cloudValue.battle, null,
    "persisted standard recovery must not keep battle runtime");

  delete window.DungeonSystem;
  const dungeonState = battleState(true);
  dungeonState.explore = dungeonRun();
  const dungeonResult = await saveAndLoad(dungeonState);
  const dungeon = dungeonResult.loaded;
  assert.strictEqual(window.DungeonSystem, undefined,
    "battle-start recovery must not require the deferred dungeon runtime");
  assert.strictEqual(dungeon.view, "dungeon",
    "loading a dungeon battle-start checkpoint must return to the dungeon map");
  assert.strictEqual(dungeon.battle, null,
    "loading a dungeon battle-start checkpoint must clear battle runtime");
  assert.strictEqual(dungeon.explore.current, "n1-0",
    "dungeon recovery must restore the battle's predecessor node");
  assert.strictEqual(dungeon.explore.pending, null,
    "dungeon recovery must clear the pending-node lock");
  assert.strictEqual(dungeon.explore.previous, undefined,
    "dungeon recovery must clear the stale predecessor marker");
  require("../src/original/dungeon-map.js");
  assert(window.DungeonMap.canChoose(dungeon.explore, "n2-0"),
    "the interrupted dungeon battle node must be clickable after loading");
  assert(dungeon._needsSaveAfterMigration,
    "dungeon battle recovery must request a durable follow-up save");
  await dungeonResult.store.persistMigration(dungeon);
  assert.strictEqual(global.cloudValue.view, "dungeon",
    "dungeon recovery must replace the stale cloud checkpoint");
  assert.strictEqual(global.cloudValue.battle, null,
    "persisted dungeon recovery must clear battle runtime");
  assert.strictEqual(global.cloudValue.explore.pending, null,
    "persisted dungeon recovery must clear the pending-node lock");
  const dungeonReloaded = await dungeonResult.store.load();
  const entry = window.DungeonEvents.enter(dungeonReloaded, "n2-0");
  assert(entry?.battle,
    "the recovered dungeon node must pass the real entry guard after reloading");

  const orphanedState = battleState(true);
  orphanedState.battle = null;
  orphanedState.view = "dungeon";
  orphanedState.explore = dungeonRun();
  const orphanedResult = await saveAndLoad(orphanedState, false);
  const orphaned = orphanedResult.loaded;
  assert.strictEqual(orphaned.explore.pending, null,
    "loading an older orphaned battle-node save must clear its pending lock");
  assert(window.DungeonMap.canChoose(orphaned.explore, "n2-0"),
    "an older orphaned battle node must become clickable after loading");
  assert.match(orphaned.log[0], /战斗节点未解锁/,
    "orphaned-node recovery must explain the compatibility repair");
  await orphanedResult.store.persistMigration(orphaned);
  assert.strictEqual(global.cloudValue.explore.pending, null,
    "orphaned-node compatibility repair must be persisted");

  for (const type of ["rest", "chest"]) {
    const panelState = battleState(true);
    panelState.battle = null;
    panelState.view = "dungeon";
    panelState.explore = dungeonRun(type);
    const panel = (await saveAndLoad(panelState, false)).loaded;
    assert.strictEqual(panel.explore.pending, "n2-0",
      `${type} pending panel must survive battle-node compatibility repair`);
  }

  resetStorage();
  const slotStore = recoveryStore();
  const slotState = battleState(true);
  slotState.explore = dungeonRun();
  await slotStore.saveSlot(1, slotState);
  const slotLoaded = await slotStore.loadSlot(1);
  assert(slotLoaded._needsSaveAfterMigration,
    "manual slot loading must preserve the migration-save marker");
  await slotStore.promoteLoaded(slotLoaded);
  assert.strictEqual(global.cloudValue.explore.pending, null,
    "promoting a repaired manual slot must replace the stale main checkpoint");

  console.log("Battle-start save/load recovery passed");
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
