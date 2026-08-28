const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

global.window = global;

function load(file) {
  vm.runInThisContext(fs.readFileSync(`./src/original/${file}`, "utf8"), {
    filename: file,
  });
}

function loadCheckpointCore() {
  load("battle-save-checkpoint-validation.js");
  load("battle-save-checkpoint-piles.js");
  load("battle-save-checkpoint.js");
}

function loadTurnRuntime() {
  [
    "battle-runtime-helpers.js",
    "battle-turn-input.js",
    "battle-turn-state.js",
    "battle-manual-hit-resume.js",
    "battle-manual-resume-actions.js",
    "battle-manual-continuation.js",
    "battle-manual-actions.js",
    "battle-manual-flow.js",
    "battle-discard-overflow.js",
    "battle-end-phase.js",
    "battle-discard-flow.js",
    "battle-share-flow.js",
    "battle-turn-completion.js",
  ].forEach(load);
}

function battleState(turn = 1) {
  const pile = () => ({
    deck: [], discard: [], consumed: [], shuffleCount: 0,
  });
  const allyPile = pile();
  const enemyPile = pile();
  const unit = (uid, side, hp, shared) => ({
    uid,
    side,
    hp,
    hand: [],
    name: uid,
    stats: { speed: side === "ally" ? 10 : 5 },
    actionCount: 0,
    deck: shared.deck,
    discard: shared.discard,
    consumed: shared.consumed,
    pileStats: shared,
  });
  const ally = unit("ally-1", "ally", 12, allyPile);
  const enemy = unit("enemy-1", "enemy", 10, enemyPile);
  return {
    view: "battle",
    battle: {
      test: false,
      turn,
      roundNo: 1,
      roundOrder: [ally.uid, enemy.uid],
      roundIndex: 1,
      phase: 4,
      activeUid: ally.uid,
      allies: [ally],
      enemies: [enemy],
      animQueue: [],
      played: [],
      shownPlayed: [],
      locked: false,
      defeat: false,
      testComplete: false,
    },
  };
}

function createSnapshotStore() {
  window.GameStoreSaveSchema = {
    cardIdentity: card => card ? { name: card.name, suit: card.suit } : null,
  };
  const counters = {
    migrated: 0,
    raw: 0,
    rejectRaw: false,
  };
  window.GameStoreSaveLimits = {
    validateMigrated() {
      counters.migrated += 1;
      return true;
    },
    validateRaw() {
      counters.raw += 1;
      return !counters.rejectRaw;
    },
  };
  load("store-compact.js");
  load("store-main-snapshot.js");
  return {
    counters,
    snapshotStore: GameStoreMainSnapshot({
      meta: {
        clone: value => JSON.parse(JSON.stringify(value)),
        version: () => 0,
        reserveVersion() {},
      },
    }),
  };
}

module.exports = {
  assert, fs, vm, load, loadCheckpointCore, loadTurnRuntime, battleState,
  createSnapshotStore,
};
