const assert = require("assert");
const fs = require("fs");
const vm = require("vm");
function load(file) {
  vm.runInThisContext(fs.readFileSync(`./src/original/${file}`, "utf8"), {
    filename: file,
  });
}
global.window = global;
load("battle-save-checkpoint-validation.js");
load("battle-save-checkpoint.js");
load("battle-runtime-helpers.js");
load("battle-turn-input.js");
load("battle-turn-state.js");
load("battle-manual-flow.js");
load("battle-discard-overflow.js");
load("battle-end-phase.js");
load("battle-discard-flow.js");
load("battle-share-flow.js");
load("battle-turn-completion.js");
const localContext = {
  validationCalls: 0,
  window: {
    localStorage: null,
    GameStoreSaveLimits: {
      limits: { bytes: 2 * 1024 * 1024 },
      serializedBytes: value => JSON.stringify(value).length,
      validateRaw() { localContext.validationCalls += 1; return true; },
    },
  },
};
localContext.window.window = localContext.window;
vm.runInNewContext(
  fs.readFileSync("./src/original/store-io-local.js", "utf8"),
  localContext,
  { filename: "store-io-local.js" },
);
assert.strictEqual(localContext.window.GameStoreLocalIO.putLocalRaw("save", {}), false,
  "unavailable local storage must report a failed fallback");
assert.strictEqual(localContext.validationCalls, 0,
  "unavailable local storage must skip full snapshot validation");
const validatedLocalContext = {
  validationCalls: 0,
  window: {
    localStorage: { setItem() {}, getItem() { return null; }, removeItem() {} },
    GameStoreSaveLimits: {
      limits: { bytes: 2 * 1024 * 1024 },
      serializedBytes: value => JSON.stringify(value).length,
      validateRaw() { validatedLocalContext.validationCalls += 1; return true; },
    },
  },
};
validatedLocalContext.window.window = validatedLocalContext.window;
vm.runInNewContext(
  fs.readFileSync("./src/original/store-io-local.js", "utf8"),
  validatedLocalContext,
  { filename: "store-io-local.js" },
);
assert(validatedLocalContext.window.GameStoreLocalIO.putLocalRaw(
  "save", {}, { validated: true },
), "an already-validated local snapshot must remain writable");
assert.strictEqual(validatedLocalContext.validationCalls, 1,
  "local raw writes must validate even when validated is forged");
assert(validatedLocalContext.window.GameStoreLocalIO.putLocalRaw("save", {}),
  "a direct raw local snapshot must remain writable after validation");
assert.strictEqual(validatedLocalContext.validationCalls, 2,
  "a direct raw local snapshot must still be validated");

const cloudContext = {
  validationCalls: 0,
  window: {
    dzmm: { kv: { async put() {} } },
  },
};
cloudContext.window.window = cloudContext.window;
vm.runInNewContext(
  fs.readFileSync("./src/original/store-io-mutations.js", "utf8"),
  cloudContext,
  { filename: "store-io-mutations.js" },
);
const cloudMutations = cloudContext.window.GameStoreIOMutations({
      validateRaw(value) {
        cloudContext.validationCalls += 1;
        return !cloudContext.reject;
      },
  putLocalRaw() { return true; },
  removeLocalRaw() { return { ok: true }; },
  runMutation(_key, task) { return task(); },
});
function battleState(turn = 1) {
  const pile = () => ({ deck: [], discard: [], consumed: [], shuffleCount: 0 });
  const allyPile = pile();
  const enemyPile = pile();
  const unit = (uid, side, hp, shared) => ({
    uid, side, hp, hand: [], name: uid,
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

const initial = battleState(0);
assert(BattleSaveCheckpoint.canSave(initial, -1),
  "the first stable player input may be checkpointed when no start baseline exists");
const initialMarker = BattleSaveCheckpoint.mark(initial);
assert.strictEqual(initialMarker.turn, 0,
  "checkpoint markers must capture the current turn");
assert.strictEqual(initialMarker.sequence, 0,
  "the first stable checkpoint must start its operation sequence");
assert(!BattleSaveCheckpoint.canSave(initial, initialMarker),
  "an unchanged stable state must not create another checkpoint");
assert.strictEqual(BattleSaveCheckpoint.noteOperation(initial), 1,
  "a completed operation must advance the runtime checkpoint revision");
assert(BattleSaveCheckpoint.canSave(initial, initialMarker),
  "a newly completed operation in the same turn may create a checkpoint");
const sameTurnMarker = BattleSaveCheckpoint.mark(initial, initialMarker);
assert.strictEqual(sameTurnMarker.sequence, 1,
  "same-turn checkpoints must advance the operation sequence");

initial.battle.turn = 1;
assert(BattleSaveCheckpoint.canSave(initial, sameTurnMarker),
  "advancing the turn must keep checkpoint admission open");
initial.battle.animQueue.push({ type: "drawBatch" });
assert(!BattleSaveCheckpoint.canSave(initial, 0),
  "animation work must block battle checkpoint writes");
initial.battle.animQueue = [];
initial.battle.manualDodge = {};
assert(!BattleSaveCheckpoint.canSave(initial, 0),
  "battle prompts must block battle checkpoint writes");
initial.battle.manualDodge = null;
initial.battle.allies[0].hand.push({ name: "杀", _pendingDraw: true });
assert(!BattleSaveCheckpoint.canSave(initial, 0),
  "uncommitted draw presentation must block battle checkpoint writes");

const resumable = battleState(4);
resumable.battle.allies.push({
  uid: "ally-2",
  side: "ally",
  hp: 9,
  hand: [{ name: "临时杀", temporary: true }],
  deck: [],
  discard: [],
  consumed: [],
  pileStats: { deck: [], discard: [], consumed: [], shuffleCount: 0 },
});
resumable.battle.allies[0].deck = [];
resumable.battle.allies[0].discard = [];
resumable.battle.allies[0].consumed = [];
resumable.battle.allies[0].pileStats = {
  deck: [{ name: "杀", suit: "♠", type: "slash", power: 1 }],
  discard: [],
  consumed: [],
  shuffleCount: 0,
};
BattleSaveCheckpoint.mark(resumable);
const snapshot = BattleSaveCheckpoint.snapshot(resumable);
assert.strictEqual(snapshot.allies[1].hand[0].temporary, true,
  "checkpoint snapshots must preserve generated battle cards");
assert(snapshot.checkpointPiles.ally && !("pileStats" in snapshot.allies[0])
  && !("deck" in snapshot.allies[0]),
"version 3 checkpoints must store each side pile once");
const restored = { view: "battle", battle: snapshot };
restored.battle.shownPlayed = [{ name: "old trail" }];
restored.battle.introSfxPending = true;
restored.battle.assetRetrying = true;
assert(BattleSaveCheckpoint.restore(restored),
  "a versioned stable checkpoint must remain resumable");
assert.deepStrictEqual(restored.battle.shownPlayed, [],
  "restoring a checkpoint must clear presentation-only card trails");
assert.strictEqual(restored.battle.introSfxPending, false,
  "restoring a checkpoint must not replay the battle intro");
assert.strictEqual(restored.battle.assetRetrying, false,
  "restoring a checkpoint must clear stale media retry ownership");
assert.strictEqual(restored.battle.allies[0].pileStats,
  restored.battle.allies[1].pileStats,
  "restoring a checkpoint must rebuild the allied shared pile");
assert.strictEqual(restored.battle.allies[1].deck,
  restored.battle.allies[0].pileStats.deck,
  "restored unit zones must point at the rebuilt shared pile");
assert(!restored.battle.checkpointPiles,
  "restored runtime state must discard serialized pile containers");
const restoredMarkers = new WeakMap();
assert.strictEqual(BattleSaveCheckpoint.adoptRestored(restored, restoredMarkers), 4,
  "loaded checkpoints must seed runtime admission");
assert.deepStrictEqual(restoredMarkers.get(restored.battle),
  { version: 3, turn: 4, sequence: 0 },
  "loaded checkpoint admission must retain its durable operation marker");
assert(!("resumeCheckpoint" in restored.battle),
  "loaded checkpoint markers must not remain on live battle state");

const legacy = battleState(4);
assert(!BattleSaveCheckpoint.restore(legacy),
  "legacy battle-start snapshots without a marker must not resume");
const versionOne = battleState(4);
versionOne.battle.resumeCheckpoint = { version: 1, turn: 4 };
assert(BattleSaveCheckpoint.restore(versionOne),
  "version 1 completed-turn checkpoints must remain backward compatible");
const versionTwoSource = battleState(4);
BattleSaveCheckpoint.mark(versionTwoSource);
const versionTwo = {
  view: "battle",
  battle: BattleSaveCheckpoint.snapshot(versionTwoSource),
};
versionTwo.battle.resumeCheckpoint = { version: 2, turn: 4 };
assert(BattleSaveCheckpoint.restore(versionTwo),
  "version 2 completed-turn checkpoints must remain backward compatible");
const unstable = battleState(4);
BattleSaveCheckpoint.mark(unstable);
unstable.battle.locked = true;
assert(!BattleSaveCheckpoint.restore(unstable),
  "locked or interrupted runtime snapshots must fail closed");
const malformed = battleState(4);
malformed.battle.roundOrder.push("missing-unit");
BattleSaveCheckpoint.mark(malformed);
assert(!BattleSaveCheckpoint.snapshot(malformed),
  "malformed battle order must fail closed before serialization");
const malformedMarker = battleState(4);
malformedMarker.battle.resumeCheckpoint = { version: 3, turn: 4 };
assert(!BattleSaveCheckpoint.restore(malformedMarker),
  "version 3 checkpoints without an operation sequence must fail closed");
const isolated = structuredClone(battleState(5));
BattleSaveCheckpoint.mark(isolated);
const isolatedBattle = isolated.battle;
assert.strictEqual(BattleSaveCheckpoint.snapshot(isolated, { inPlace: true }), isolatedBattle,
  "snapshot preparation may compact its already-isolated battle in place");
assert(isolatedBattle.checkpointPiles && !("pileStats" in isolatedBattle.allies[0]),
  "in-place checkpoint preparation must deduplicate the isolated battle");

window.GameStoreSaveSchema = {
  cardIdentity: card => card ? { name: card.name, suit: card.suit } : null,
};
let migratedValidationCalls = 0;
let rawValidationCalls = 0;
let rejectRawSnapshot = false;
window.GameStoreSaveLimits = {
  validateMigrated() {
    migratedValidationCalls += 1;
    return true;
  },
  validateRaw() {
    rawValidationCalls += 1;
    return !rejectRawSnapshot;
  },
};
load("store-compact.js");
load("store-main-snapshot.js");
const serialized = battleState(6);
serialized.battle.allies[0].hand.push({
  name: "临时杀",
  suit: "虚",
  type: "slash",
  power: 1,
  temporary: true,
  virtual: true,
});
serialized.battle.allies[0].pileStats.deck.push({
  name: "杀",
  suit: "♠",
  type: "slash",
  power: 1,
});
BattleSaveCheckpoint.mark(serialized);
const snapshotStore = GameStoreMainSnapshot({
  meta: {
    clone: value => JSON.parse(JSON.stringify(value)),
    version: () => 0,
    reserveVersion() {},
  },
});
const saved = snapshotStore.prepareSaveSnapshot(serialized);
assert.strictEqual(saved.battle.allies[0].hand[0].temporary, true,
  "main-save preparation must not strip generated cards from resumable battles");
assert.strictEqual(saved.battle.checkpointPiles.ally.deck[0].power, 1,
  "main-save preparation must preserve complete battle card rules");
assert(BattleSaveCheckpoint.restore(saved),
  "a prepared main-save checkpoint must pass restore validation");
assert.strictEqual(saved.battle.allies[0].deck,
  saved.battle.allies[0].pileStats.deck,
  "the main-save round trip must restore unit-to-pile references");
const trustedState = battleState(6);
const migratedBeforeTrusted = migratedValidationCalls;
const rawBeforeTrusted = rawValidationCalls;
snapshotStore.prepareSaveSnapshot(trustedState, { trusted: true });
assert.strictEqual(migratedValidationCalls, migratedBeforeTrusted,
  "trusted runtime saves must skip the redundant pre-clone validation");
assert.strictEqual(rawValidationCalls, rawBeforeTrusted + 1,
  "trusted runtime saves must still validate the final compact snapshot");
rejectRawSnapshot = true;
assert.throws(
  () => snapshotStore.prepareSaveSnapshot(battleState(6), { trusted: true }),
  error => error?.code === "INVALID_SAVE_STRUCTURE",
  "trusted runtime saves must not bypass final raw snapshot validation",
);
rejectRawSnapshot = false;

const large = battleState(7);
const addUnit = (side, index) => {
  const units = side === "ally" ? large.battle.allies : large.battle.enemies;
  const pile = units[0].pileStats;
  const unit = {
    uid: `${side}-${index}`, side, hp: 10, hand: [],
    deck: pile.deck, discard: pile.discard, consumed: pile.consumed,
    pileStats: pile,
  };
  units.push(unit);
  large.battle.roundOrder.push(unit.uid);
};
for (let index = 2; index <= 4; index += 1) {
  addUnit("ally", index);
  addUnit("enemy", index);
}
large.battle.allies[0].pileStats.deck.push(...Array.from({ length: 120 }, (_, index) => ({
  name: `生成牌${index}`, type: "slash", power: index + 1,
  temporary: true, payload: "x".repeat(80),
})));
large.battle.enemies[0].pileStats.discard.push(...Array.from({ length: 120 }, (_, index) => ({
  name: `改造牌${index}`, type: "tactic", power: index + 2,
  payload: "y".repeat(80),
})));
BattleSaveCheckpoint.mark(large);
const duplicatedBytes = JSON.stringify(large.battle).length;
const deduplicated = BattleSaveCheckpoint.snapshot(large);
assert(JSON.stringify(deduplicated).length < duplicatedBytes / 3,
  "checkpoint serialization must not duplicate shared piles for every unit");
assert.strictEqual(deduplicated.checkpointPiles.ally.deck[119].power, 120,
  "deduplicated piles must preserve generated card fields");

global.document = { addEventListener() {} }; window.addEventListener = () => {};
global.sessionOnly = false; global.saveWarningShown = false;
global.settingsSaveTimer = null; global.scheduleRender = () => {};
global.battleStartSaves = new WeakSet();
global.battleCheckpointMarkers = new WeakMap();
window.BattleEffects = { animating: false, draining: false };
window.dzmm = { toast: { warning() {} } };
global.state = battleState(2);
const writes = [];
window.GameStore = {
  save(_state, options) {
    writes.push({ options, data: snapshotStore.prepareSaveSnapshot(_state) });
    return Promise.resolve();
  },
};
load("app-persistence.js");

async function assertEnemyContinuesAfterRestore() {
  const source = battleState(8);
  BattleSaveCheckpoint.mark(source);
  const resumed = {
    view: "battle",
    battle: BattleSaveCheckpoint.snapshot(source),
  };
  assert(BattleSaveCheckpoint.restore(resumed),
    "the turn-flow fixture must restore as a stable checkpoint");
  BattleSaveCheckpoint.adoptRestored(resumed, new WeakMap());

  const helpers = BattleRuntimeHelpers();
  let enemyPlays = 0;
  let completion = null;
  const combat = { checkEnd() {}, pushFloat() {} };
  window.BattleRelicTurns = { finishPlay() {} };
  window.BattleCards = { putMany() {}, put() {} };
  const runEnemyPlayPhase = async (_state, unit) => {
    assert.strictEqual(unit.side, "enemy",
      "the first resumed successor must be the saved enemy unit");
    enemyPlays += 1;
    return true;
  };
  const input = BattleTurnInput({
    combat,
    record() {},
    waitEffects: async () => {},
    isCurrentState: candidate => candidate === resumed,
    runEnemyPlayPhase,
    getFinishTurn: () => completion.finishTurn,
    beginTurn(candidate) {
      const unit = helpers.nextRoundUnit(candidate.battle);
      if (!unit) return null;
      candidate.battle.activeUid = unit.uid;
      candidate.battle.phase = 3;
      return unit;
    },
  });
  completion = BattleTurnCompletion({
    active: helpers.active,
    allUnits: helpers.allUnits,
    canDiscardAny: () => false,
    canDiscardCard: () => false,
    discardNeed: () => 0,
    handLimit: () => 99,
    visibleHand: unit => unit.hand.length,
    combat,
    draw() {},
    record() {},
    waitEffects: async () => {},
    isCurrentState: candidate => candidate === resumed,
    runEnemyPlayPhase,
    advanceToInput: input.advanceToInput,
    continuePreparedTurn() {},
  });

  await completion.endPlay(resumed);
  assert.strictEqual(enemyPlays, 1,
    "ending the restored allied turn must run the next enemy play phase");
  assert.strictEqual(resumed.battle.enemies[0].actionCount, 1,
    "the resumed enemy turn must reach normal turn completion");
  assert.strictEqual(resumed.battle.activeUid, resumed.battle.allies[0].uid,
    "turn flow must continue to the next allied input after the enemy acts");
  assert.strictEqual(resumed.battle.phase, 4,
    "the resumed battle must finish on an interactive allied play phase");
}

(async () => {
  assert(await cloudMutations.putCloudRaw("save", {}, { validated: true }),
    "an already-validated cloud snapshot must remain writable");
  assert.strictEqual(cloudContext.validationCalls, 1,
    "cloud raw writes must validate even when validated is forged");
  assert(await cloudMutations.putCloudRaw("save", {}),
    "a direct raw cloud snapshot must remain writable after validation");
  assert.strictEqual(cloudContext.validationCalls, 2,
    "a direct raw cloud snapshot must still be validated");
  cloudContext.reject = true;
  assert(!await cloudMutations.putCloudRaw("invalid", {}, { validated: true }),
    "forged validated cloud writes must reject invalid snapshots");
  await assertEnemyContinuesAfterRestore();
  battleCheckpointMarkers.set(state.battle, BattleSaveCheckpoint.baseline(state.battle));
  assert.strictEqual(await persist(), false,
    "plain same-turn persistence must not repeat an unchanged checkpoint");
  for (let operation = 0; operation < 20; operation += 1) {
    assert.strictEqual(await persist({ battleOperation: true }), true,
      "each completed operation must schedule or merge a checkpoint");
  }
  assert.strictEqual(writes.length, 0,
    "20 coalesced operation requests must not build snapshots synchronously");
  assert.strictEqual(await flushPendingBattleCheckpoint(), true,
    "the pending operation batch must remain explicitly flushable");
  assert.strictEqual(writes.length, 1,
    "one operation batch must create exactly one save");
  assert.strictEqual(writes[0].options.flush, true,
    "battle checkpoints must request immediate durable persistence");
  assert.strictEqual(writes[0].data.battle.resumeCheckpoint.turn, 2,
    "same-turn checkpoints must retain the current turn");
  assert.strictEqual(writes[0].data.battle.resumeCheckpoint.sequence, 20,
    "a coalesced checkpoint must retain the latest operation sequence");
  assert(!("resumeCheckpoint" in state.battle),
    "successful checkpoint preparation must not leave a live resume marker");
  assert.strictEqual(await persist({ battleOperation: true }), true,
    "a later completed operation in the same turn must schedule another batch");
  assert.strictEqual(await flushPendingBattleCheckpoint(), true,
    "a later operation batch must be flushable");
  assert.strictEqual(writes[1].data.battle.resumeCheckpoint.sequence, 21,
    "later same-turn operations must advance the durable sequence");
  state.battle.turn = 3;
  assert.strictEqual(await persist(), true,
    "turn advance must remain a durable checkpoint");
  assert.strictEqual(await flushPendingBattleCheckpoint(), true,
    "a turn-advance checkpoint must remain flushable");
  assert.strictEqual(writes[2].data.battle.resumeCheckpoint.turn, 3,
    "the durable snapshot must retain its resume marker");
  assert(!("resumeCheckpoint" in state.battle),
    "successful checkpoint preparation must not leave a live resume marker");
  const unsafeManual = snapshotStore.prepareSaveSnapshot(state);
  assert(!unsafeManual.battle.resumeCheckpoint
    && !BattleSaveCheckpoint.restore(JSON.parse(JSON.stringify(unsafeManual))),
  "a later same-turn manual snapshot must not become resumable");
  const durableMarkerBeforeFailure = {
    ...battleCheckpointMarkers.get(state.battle),
  };
  state.battle.turn = 4;
  BattleEffects.animating = true;
  assert.strictEqual(await persist(), false,
    "persist must reject animation-time battle state");
  BattleEffects.animating = false;
  GameStore.save = async () => { throw Object.assign(new Error("failed"), { code: "FAIL" }); };
  assert.strictEqual(await persist({ flush: true }), false,
    "a failed checkpoint write must report failure");
  assert(!("resumeCheckpoint" in state.battle),
    "a failed write must not leak a live resume marker");
  assert.deepStrictEqual(
    battleCheckpointMarkers.get(state.battle),
    durableMarkerBeforeFailure,
    "a failed write must restore the exact durable admission marker",
  );
  GameStore.save = (_state, options) => {
    writes.push({ options, data: snapshotStore.prepareSaveSnapshot(_state) });
    return Promise.resolve();
  };
  assert.strictEqual(await persist({ flush: true }), true,
    "a failed checkpoint must remain retryable");
  assert.strictEqual(
    writes.at(-1).data.battle.resumeCheckpoint.sequence,
    durableMarkerBeforeFailure.sequence + 1,
    "a retried checkpoint must reuse the next operation sequence",
  );
  const writesBeforeCancel = writes.length;
  await persist({ battleOperation: true });
  cancelPendingBattleCheckpoint();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.strictEqual(writes.length, writesBeforeCancel,
    "state replacement cancellation must discard a pending checkpoint batch");
  console.log("Battle resume checkpoint contracts passed");
})().catch(error => { console.error(error.stack || error.message); process.exit(1); });
