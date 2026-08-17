global.window = global;

require("../src/original/bounty-ledger.js");
require("../src/original/receipt-ledger.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function testBountyLedger() {
  let ledger = BountyLedger.empty();
  for (let i = 1; i <= 10000; i += 1) {
    const result = BountyLedger.claim(ledger, `bounty:${i}`);
    assert(result.status === "granted", `structured claim ${i} should settle`);
    ledger = result.ledger;
  }
  assert(ledger.through === 10000,
    "structured bounty claims must collapse into a high-water mark");
  assert(ledger.legacy.length === 0,
    "structured bounty claims must not grow the legacy list");
  assert(BountyLedger.claim(ledger, "bounty:9000").status === "duplicate",
    "old structured bounty claims must remain idempotent");
  assert(BountyLedger.claim(ledger, "bounty:10002").status === "blocked",
    "out-of-order bounty claims must wait for the missing claim");

  const oldIds = Array.from(
    { length: BountyLedger.LEGACY_LIMIT + 500 }, (_, index) => `legacy-${index}`,
  );
  const migrated = BountyLedger.normalize(null, oldIds);
  assert(migrated.legacy.length === BountyLedger.LEGACY_LIMIT,
    "legacy bounty receipts must have a hard storage limit");
  assert(migrated.legacy.every(key => key.length < 24),
    "legacy bounty receipts must use compact hashes");
  assert(BountyLedger.claim(migrated, oldIds[0]).status === "duplicate",
    "retained legacy bounty receipts must remain idempotent");
  assert(BountyLedger.claim(migrated, "new-legacy").status === "blocked",
    "a full legacy bounty ledger must fail closed");

  const malformed = BountyLedger.normalize(
    { through: 1.5, legacy: "broken" }, "broken",
  );
  assert(malformed.through === 0 && malformed.legacy.length === 0,
    "malformed bounty ledgers must normalize without expanding arbitrary input");
  assert(BountyLedger.safeCounter(
    -1, 1.5, Number.MAX_SAFE_INTEGER + 1, 7,
  ) === 7, "only non-negative safe bounty counters may be reused");
  const compact = BountyLedger.normalize(null, ["legacy-receipt"]);
  assert(compact.legacy.length === 1
    && BountyLedger.isLegacyKey(compact.legacy[0]),
  "migrated bounty receipts must use the compact hash format");
  assert(BountyLedger.normalize({
    through: 0, legacy: ["raw-receipt", "x".repeat(10000)],
  }).legacy.length === 0, "invalid bounty ledger entries must not survive");
  const saturated = {
    _localBountyClaimCounter: Number.MAX_SAFE_INTEGER,
    _localBountyLedger: BountyLedger.empty(),
  };
  assert(!BountyLedger.assign(saturated, [{ reward: {} }])[0].claimId,
    "an exhausted bounty sequence must fail closed");
}

function testReceiptLedger() {
  let ledger = ReceiptLedger.empty();
  let result = ReceiptLedger.claim(ledger, "inventory:2", "inventory");
  assert(result.status === "blocked" && result.ledger.through === 0,
    "later inventory receipts must wait without advancing the ledger");
  result = ReceiptLedger.claim(ledger, "inventory:1", "inventory");
  assert(result.status === "granted",
    "the next inventory receipt should settle");
  ledger = result.ledger;
  result = ReceiptLedger.inspect(ledger, "inventory:3", "inventory");
  assert(result.status === "blocked" && result.ledger.through === 1,
    "receipt inspection must not mutate the high-water mark");
  assert(ReceiptLedger.claim(ledger, "inventory:1", "inventory").status
    === "duplicate", "settled receipts must remain idempotent");
  result = ReceiptLedger.claim(ledger, "inventory:2", "inventory");
  assert(result.status === "granted" && result.ledger.through === 2,
    "the missing next receipt must remain retryable");

  const pending = { ledger: ReceiptLedger.empty(), counter: 0 };
  const pendingId = ReceiptLedger.assign(
    pending, "inventory", "ledger", "counter", "oldIds",
  );
  assert(pendingId === "inventory:1",
    "assignment should allocate the next receipt sequence");
  assert(ReceiptLedger.release(
    pending, pendingId, "inventory", "ledger", "counter",
  ) && pending.counter === 0,
  "a confirmed failed operation should release its unclaimed sequence");
  const settledId = ReceiptLedger.assign(
    pending, "inventory", "ledger", "counter", "oldIds",
  );
  pending.ledger = ReceiptLedger.claim(
    pending.ledger, settledId, "inventory",
  ).ledger;
  assert(!ReceiptLedger.release(
    pending, settledId, "inventory", "ledger", "counter",
  ), "a settled receipt must never be released");

  const legacy = ReceiptLedger.claim(null, "legacy-operation", "inventory");
  assert(legacy.status === "granted"
    && ReceiptLedger.claim(
      legacy.ledger, "legacy-operation", "inventory",
    ).status === "duplicate",
  "legacy receipts must settle once and remain idempotent");
}

testBountyLedger();
testReceiptLedger();
console.log("Receipt ledger tests passed: bounty and ordered operation receipts");
