const assert = require("assert");
const fc = require("fast-check");

global.window = global;
window.GameData = { baseDeck: [], eliteCards: [] };
window.ReceiptLedger = { LEGACY_LIMIT: 256 };
window.BountyLedger = { LEGACY_LIMIT: 256 };
require("../src/original/unlock-event-progress.js");
require("../src/original/store-save-schema.js");
require("../src/original/store-save-validation.js");
require("../src/original/store-save-limits.js");

const limits = window.GameStoreSaveLimits;
const seed = Number(process.env.FUZZ_SEED || 2971485);
const numRuns = Number(process.env.FUZZ_RUNS || 1000);

const baseSave = {
  updatedAt: 1,
  _saveVersion: 1,
  settings: {},
  resources: { gold: 0, essence: 0, relics: [] },
  flags: {},
  chars: [],
  party: [],
  deck: [],
  log: [],
  battleLog: [],
};

fc.assert(fc.property(fc.anything(), value => {
  const result = limits.validateRaw(value);
  return typeof result === "boolean";
}), { seed, numRuns });

fc.assert(fc.property(
  fc.integer({ min: 0, max: limits.limits.resource }),
  fc.integer({ min: 0, max: limits.limits.resource }),
  (current, amount) => {
    const sum = limits.addResource(current, amount);
    return Number.isInteger(sum) && sum >= 0 && sum <= limits.limits.resource;
  }
), { seed: seed + 1, numRuns });

fc.assert(fc.property(
  fc.record({
    gold: fc.integer({ min: 0, max: limits.limits.resource }),
    essence: fc.integer({ min: 0, max: limits.limits.resource }),
    updatedAt: fc.integer({ min: 0, max: limits.limits.timestamp }),
  }),
  values => limits.validateRaw({
    ...baseSave,
    updatedAt: values.updatedAt,
    resources: { gold: values.gold, essence: values.essence, relics: [] },
  })
), { seed: seed + 2, numRuns });

fc.assert(fc.property(
  fc.oneof(
    fc.integer({ max: -1 }),
    fc.integer({ min: limits.limits.resource + 1, max: Number.MAX_SAFE_INTEGER }),
    fc.integer({ min: 0, max: limits.limits.resource }).map(value => value + 0.5),
    fc.string({ minLength: 1 }).filter(value => Number.isNaN(Number(value)))
  ),
  value => !limits.validateRaw({
    ...baseSave,
    resources: { gold: value, essence: 0, relics: [] },
  })
), { seed: seed + 3, numRuns });

const circular = {};
circular.self = circular;
assert.strictEqual(limits.validateRaw(circular), false);
assert.strictEqual(limits.serializedBytes(circular), Infinity);
assert.strictEqual(limits.validateRaw({
  ...baseSave,
  unlockEvents: { version: 1, completed: { first_defeat: true } },
}), true, "version 1 unlock ledgers must remain readable for migration");
assert.strictEqual(limits.validateRaw({
  ...baseSave,
  unlockEvents: { version: 3, completed: {} },
}), false, "future unlock ledger versions must fail closed");
console.log(`Save fuzz passed: ${numRuns * 4} generated cases, seed ${seed}`);
