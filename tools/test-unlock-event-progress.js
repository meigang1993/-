const { assert, fresh } = require("./progression-test-harness");

const migrate = state => window.GameStoreMigrations.migrate(state);
const character = (state, id) => state.chars.find(item => item.id === id);
const completed = (state, id) =>
  window.UnlockEventProgress.isCompleted(state, id);

function testFreshVersionedProgress() {
  const state = fresh();
  assert(state.unlockEvents.version === 2, "new saves must declare unlock event version 2");
  assert(Object.keys(state.unlockEvents.completed).length === 0,
    "new saves must start with an empty explicit completion map");
}

function testVersionOneDefeatMarkersReplaySafely() {
  const state = fresh();
  state.unlockEvents = {
    version: 1,
    completed: {
      first_defeat: true,
      second_defeat: true,
      underwater_train: true,
    },
  };
  migrate(state);
  assert(state.unlockEvents.version === 2,
    "version 1 unlock ledgers must migrate to version 2");
  assert(!completed(state, "first_defeat") && !completed(state, "second_defeat"),
    "ambiguous version 1 defeat markers must not survive as completion evidence");
  assert(state.flags.firstDefeatSeen && state.flags.secondDefeatSeen
    && state.flags.defeatCount >= 2,
    "version 1 defeat markers must remain ordered trigger evidence");
  assert(state.hallModal === "firstDefeat",
    "version 1 defeat stories must replay from the first ambiguous event");
  assert(completed(state, "underwater_train"),
    "unambiguous version 1 completion markers must be preserved");
}

function testLegacyDurableBackfillWithoutLogs() {
  const state = fresh();
  delete state.unlockEvents;
  state.log = [];
  state.flags.firstDefeatSeen = true;
  character(state, "loki").locked = false;
  state.flags.underwaterTrainUnlocked = true;
  character(state, "aileng").locked = false;
  migrate(state);
  assert(!completed(state, "first_defeat") && state.hallModal === "firstDefeat",
    "legacy defeat state must replay once when completion cannot be proven");
  assert(completed(state, "underwater_train"),
    "legacy dungeon completion must backfill without display logs");
  assert(state._needsSaveAfterMigration,
    "legacy event backfill must request a durable save");
}

function testLegacyDefeatEvidenceBackfill() {
  const first = fresh();
  delete first.unlockEvents;
  first.log = [];
  character(first, "loki").locked = false;
  migrate(first);
  assert(!completed(first, "first_defeat") && first.flags.defeatCount >= 1,
    "legacy unlocked Loki must restore a pending first-defeat story");
  assert(first.hallModal === "firstDefeat",
    "legacy unlocked Loki cannot prove that the story was acknowledged");

  const pending = fresh();
  delete pending.unlockEvents;
  pending.log = [];
  pending.flags.defeatCount = 2;
  migrate(pending);
  assert(!completed(pending, "first_defeat") && !completed(pending, "second_defeat"),
    "legacy defeat count must not be mistaken for story completion");
  assert(pending.flags.firstDefeatSeen && pending.flags.secondDefeatSeen,
    "legacy defeat count must restore both pending defeat triggers");
  assert(pending.hallModal === "firstDefeat",
    "legacy defeat count must resume the first incomplete story");
  assert(character(pending, "loki").locked && character(pending, "carlos").locked,
    "pending legacy defeat stories must not unlock roster targets early");

  const second = fresh();
  delete second.unlockEvents;
  second.log = [];
  character(second, "carlos").locked = false;
  migrate(second);
  assert(!completed(second, "first_defeat") && !completed(second, "second_defeat"),
    "legacy unlocked Carlos must not be mistaken for story completion");
  assert(second.flags.defeatCount >= 2 && second.hallModal === "firstDefeat",
    "legacy unlocked Carlos must restore both ordered pending stories");
}

function testLogsNeverUnlockVersionedState() {
  const state = fresh();
  state.log = [
    "首次全军覆没：这只是展示文本。",
    "水下列车已解锁：这只是展示文本。",
    "曼妮苏醒后的来客：这只是展示文本。",
  ];
  migrate(state);
  assert(!completed(state, "first_defeat")
    && !completed(state, "underwater_train") && !completed(state, "miller"),
  "display logs must not create event completion markers");
  assert(character(state, "loki").locked && character(state, "aileng").locked
    && character(state, "miller").locked,
  "display logs must not repair locked content");
}

function testExplicitMarkersRepairState() {
  const state = fresh();
  state.log = [];
  state.unlockEvents.completed.miller = true;
  state.unlockEvents.completed.underwater_train = true;
  migrate(state);
  assert(state.flags.millerUnlockSeen && !character(state, "miller").locked,
    "Miller marker must repair its flag and character");
  assert(state.flags.underwaterTrainUnlocked && !character(state, "aileng").locked,
    "underwater marker must repair dungeon and character state");
}

function testPendingDefeatUsesCompletionMarker() {
  const state = fresh();
  state.flags.firstDefeatSeen = true;
  character(state, "loki").locked = false;
  state.log = [];
  migrate(state);
  assert(!completed(state, "first_defeat"),
    "versioned trigger state must not be mistaken for event completion");
  assert(state.hallModal === "firstDefeat",
    "an incomplete defeat event must be reconstructed in the hall");
}

function testVersionedRelationshipRepair() {
  const state = fresh();
  character(state, "hoshino_yi").locked = false;
  migrate(state);
  assert(completed(state, "hoshino_family"),
    "unlocked Hoshino Yi must repair the family completion marker");
  assert(!character(state, "hoshino_kaiichi").locked,
    "unlocked Hoshino Yi must still repair Hoshino Kaiichi");
}

testFreshVersionedProgress();
testVersionOneDefeatMarkersReplaySafely();
testLegacyDurableBackfillWithoutLogs();
testLegacyDefeatEvidenceBackfill();
testLogsNeverUnlockVersionedState();
testExplicitMarkersRepairState();
testPendingDefeatUsesCompletionMarker();
testVersionedRelationshipRepair();
console.log("Unlock event progress regression tests passed");
