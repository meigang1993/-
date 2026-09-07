const {
  assert, load, loadCheckpointCore, loadTurnRuntime, battleState,
  createSnapshotStore,
} = require("./battle-resume-save-fixtures");

loadCheckpointCore();
loadTurnRuntime();
const { snapshotStore } = createSnapshotStore();

global.document = { addEventListener() {} };
window.addEventListener = () => {};
global.sessionOnly = false;
global.saveWarningShown = false;
global.settingsSaveTimer = null;
global.scheduleRender = () => {};
global.battleStartSaves = new WeakSet();
global.battleCheckpointMarkers = new WeakMap();
window.BattleEffects = { animating: false, draining: false };
window.dzmm = { toast: { warning() {} } };
global.state = battleState(2);
const writes = [];
window.GameStore = {
  save(actionState, options) {
    writes.push({
      options,
      data: snapshotStore.prepareSaveSnapshot(actionState),
    });
    return Promise.resolve();
  },
};
load("app-battle-persistence.js");

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
    "ending the restored allied turn must run the enemy play phase");
  assert.strictEqual(resumed.battle.enemies[0].actionCount, 1,
    "the resumed enemy turn must reach normal completion");
  assert.strictEqual(
    resumed.battle.activeUid, resumed.battle.allies[0].uid,
    "turn flow must continue to the next allied input");
  assert.strictEqual(resumed.battle.phase, 4,
    "the resumed battle must finish on allied input");
}

(async () => {
  await assertEnemyContinuesAfterRestore();
  battleCheckpointMarkers.set(
    state.battle, BattleSaveCheckpoint.baseline(state.battle));
  assert.strictEqual(await persist(), false,
    "plain same-turn persistence must not repeat a checkpoint");
  for (let operation = 0; operation < 20; operation += 1) {
    assert.strictEqual(await persist({ battleOperation: true }), true,
      "completed operations must schedule or merge a checkpoint");
  }
  assert.strictEqual(writes.length, 0,
    "coalesced requests must not build snapshots synchronously");
  assert.strictEqual(await flushPendingBattleCheckpoint(), true,
    "the pending operation batch must remain flushable");
  assert.strictEqual(writes.length, 1,
    "one operation batch must create exactly one save");
  assert.strictEqual(writes[0].options.flush, true,
    "battle checkpoints must request durable persistence");
  assert.strictEqual(
    writes[0].data.battle.resumeCheckpoint.sequence, 20,
    "a coalesced checkpoint must retain the latest operation sequence");
  assert(!("resumeCheckpoint" in state.battle),
    "checkpoint preparation must not leave a live resume marker");
  assert.strictEqual(await persist({ battleOperation: true }), true,
    "a later same-turn operation must schedule another batch");
  assert.strictEqual(await flushPendingBattleCheckpoint(), true);
  assert.strictEqual(
    writes[1].data.battle.resumeCheckpoint.sequence, 21,
    "later same-turn operations must advance the durable sequence");
  state.battle.turn = 3;
  assert.strictEqual(await persist(), true,
    "turn advance must remain a durable checkpoint");
  assert.strictEqual(await flushPendingBattleCheckpoint(), true);
  assert.strictEqual(writes[2].data.battle.resumeCheckpoint.turn, 3);
  const unsafeManual = snapshotStore.prepareSaveSnapshot(state);
  assert(!unsafeManual.battle.resumeCheckpoint
    && !BattleSaveCheckpoint.restore(JSON.parse(JSON.stringify(unsafeManual))),
  "a later manual snapshot must not become resumable");
  const durableMarker = { ...battleCheckpointMarkers.get(state.battle) };
  state.battle.turn = 4;
  BattleEffects.animating = true;
  assert.strictEqual(await persist(), false,
    "animation-time battle state must not persist");
  BattleEffects.animating = false;
  GameStore.save = async () => {
    throw Object.assign(new Error("failed"), { code: "FAIL" });
  };
  assert.strictEqual(await persist({ flush: true }), false,
    "a failed checkpoint write must report failure");
  assert.deepStrictEqual(
    battleCheckpointMarkers.get(state.battle), durableMarker,
    "a failed write must restore the durable marker");
  GameStore.save = (actionState, options) => {
    writes.push({
      options,
      data: snapshotStore.prepareSaveSnapshot(actionState),
    });
    return Promise.resolve();
  };
  assert.strictEqual(await persist({ flush: true }), true,
    "a failed checkpoint must remain retryable");
  assert.strictEqual(
    writes.at(-1).data.battle.resumeCheckpoint.sequence,
    durableMarker.sequence + 1,
    "a retried checkpoint must reuse the next operation sequence");
  const writesBeforeCancel = writes.length;
  await persist({ battleOperation: true });
  cancelPendingBattleCheckpoint();
  await new Promise(resolve => setTimeout(resolve, 5));
  assert.strictEqual(writes.length, writesBeforeCancel,
    "state replacement must cancel the pending checkpoint batch");
  console.log("Battle checkpoint scheduling contracts passed");
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
