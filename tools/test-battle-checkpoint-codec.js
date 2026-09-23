const {
  assert, loadCheckpointCore, battleState,
} = require("./battle-resume-save-fixtures");

loadCheckpointCore();

const initial = battleState(0);
assert(BattleSaveCheckpoint.canSave(initial, -1),
  "the first stable player input may be checkpointed");
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
  "a completed same-turn operation may create a checkpoint");
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
assert.strictEqual(
  BattleSaveCheckpoint.adoptRestored(restored, restoredMarkers), 4,
  "loaded checkpoints must seed runtime admission");
assert.deepStrictEqual(restoredMarkers.get(restored.battle),
  { version: 3, turn: 4, sequence: 0 },
  "loaded checkpoint admission must retain its durable marker");
assert(!("resumeCheckpoint" in restored.battle),
  "loaded checkpoint markers must not remain on live battle state");

const legacy = battleState(4);
assert(!BattleSaveCheckpoint.restore(legacy),
  "legacy battle-start snapshots without a marker must not resume");
const versionOne = battleState(4);
versionOne.battle.resumeCheckpoint = { version: 1, turn: 4 };
assert(BattleSaveCheckpoint.restore(versionOne),
  "version 1 checkpoints must remain backward compatible");
const versionTwoSource = battleState(4);
BattleSaveCheckpoint.mark(versionTwoSource);
const versionTwo = {
  view: "battle",
  battle: BattleSaveCheckpoint.snapshot(versionTwoSource),
};
versionTwo.battle.resumeCheckpoint = { version: 2, turn: 4 };
assert(BattleSaveCheckpoint.restore(versionTwo),
  "version 2 checkpoints must remain backward compatible");
const unstable = battleState(4);
BattleSaveCheckpoint.mark(unstable);
unstable.battle.locked = true;
assert(!BattleSaveCheckpoint.restore(unstable),
  "locked or interrupted snapshots must fail closed");
const malformed = battleState(4);
malformed.battle.roundOrder.push("missing-unit");
BattleSaveCheckpoint.mark(malformed);
assert(!BattleSaveCheckpoint.snapshot(malformed),
  "malformed battle order must fail closed before serialization");
const malformedMarker = battleState(4);
malformedMarker.battle.resumeCheckpoint = { version: 3, turn: 4 };
assert(!BattleSaveCheckpoint.restore(malformedMarker),
  "version 3 checkpoints require an operation sequence");
const isolated = structuredClone(battleState(5));
BattleSaveCheckpoint.mark(isolated);
const isolatedBattle = isolated.battle;
assert.strictEqual(
  BattleSaveCheckpoint.snapshot(isolated, { inPlace: true }), isolatedBattle,
  "snapshot preparation may compact an isolated battle in place");
assert(isolatedBattle.checkpointPiles
  && !("pileStats" in isolatedBattle.allies[0]),
"in-place checkpoint preparation must deduplicate the isolated battle");
console.log("Battle checkpoint codec contracts passed");
