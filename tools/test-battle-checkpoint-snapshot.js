const {
  assert, loadCheckpointCore, battleState, createSnapshotStore,
} = require("./battle-resume-save-fixtures");

loadCheckpointCore();
const { counters, snapshotStore } = createSnapshotStore();

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
const saved = snapshotStore.prepareSaveSnapshot(serialized);
assert.strictEqual(saved.battle.allies[0].hand[0].temporary, true,
  "main-save preparation must preserve generated battle cards");
assert.strictEqual(saved.battle.checkpointPiles.ally.deck[0].power, 1,
  "main-save preparation must preserve complete battle card rules");
assert(BattleSaveCheckpoint.restore(saved),
  "a prepared main-save checkpoint must pass restore validation");
assert.strictEqual(saved.battle.allies[0].deck,
  saved.battle.allies[0].pileStats.deck,
  "the main-save round trip must restore unit-to-pile references");

const trustedState = battleState(6);
const migratedBefore = counters.migrated;
const rawBefore = counters.raw;
snapshotStore.prepareSaveSnapshot(trustedState, { trusted: true });
assert.strictEqual(counters.migrated, migratedBefore,
  "trusted runtime saves must skip redundant migrated validation");
assert.strictEqual(counters.raw, rawBefore + 1,
  "trusted runtime saves must still validate the compact snapshot");
counters.rejectRaw = true;
assert.throws(
  () => snapshotStore.prepareSaveSnapshot(
    battleState(6), { trusted: true }),
  error => error?.code === "INVALID_SAVE_STRUCTURE",
  "trusted runtime saves must not bypass final raw validation",
);
counters.rejectRaw = false;

const large = battleState(7);
const addUnit = (side, index) => {
  const units = side === "ally"
    ? large.battle.allies : large.battle.enemies;
  const pile = units[0].pileStats;
  units.push({
    uid: `${side}-${index}`,
    side,
    hp: 10,
    hand: [],
    deck: pile.deck,
    discard: pile.discard,
    consumed: pile.consumed,
    pileStats: pile,
  });
  large.battle.roundOrder.push(`${side}-${index}`);
};
for (let index = 2; index <= 4; index += 1) {
  addUnit("ally", index);
  addUnit("enemy", index);
}
large.battle.allies[0].pileStats.deck.push(...Array.from(
  { length: 120 }, (_, index) => ({
    name: `生成牌${index}`,
    type: "slash",
    power: index + 1,
    temporary: true,
    payload: "x".repeat(80),
  })));
large.battle.enemies[0].pileStats.discard.push(...Array.from(
  { length: 120 }, (_, index) => ({
    name: `改造牌${index}`,
    type: "tactic",
    power: index + 2,
    payload: "y".repeat(80),
  })));
BattleSaveCheckpoint.mark(large);
const duplicatedBytes = JSON.stringify(large.battle).length;
const deduplicated = BattleSaveCheckpoint.snapshot(large);
assert(JSON.stringify(deduplicated).length < duplicatedBytes / 3,
  "checkpoint serialization must not duplicate shared piles");
assert.strictEqual(deduplicated.checkpointPiles.ally.deck[119].power, 120,
  "deduplicated piles must preserve generated card fields");
console.log("Battle checkpoint snapshot contracts passed");
