/* global assert, captureReject, localWriteCount, tick */
/* global cloudValue: writable, cloudWritable: writable, controlledPuts: writable, localWritable: writable */
const assertInvalidOfflineSettlementData = require("./store-validation-cases");

module.exports = async function runValidationTests() {
  const validLocal = {
    ...window.GameStore.freshState(),
    updatedAt: 300,
    _saveVersion: 300,
    resources: { gold: 33, essence: 0, relics: [] },
  };
  localStorage.data.set("succubus-kill-save-v1", JSON.stringify(validLocal));
  cloudValue = false;
  const recoveryStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => {
      if (!value || typeof value !== "object") throw new Error("invalid cloud structure");
      return value;
    },
  });
  const recovered = await recoveryStore.load();
  assert(recovered.resources.gold === 33, "damaged cloud main copy must not block a valid local copy");
  assert(recoveryStore.status().recovery === "cloud", "damaged cloud copy should be marked for repair");
  await recoveryStore.repairMain();
  assert(cloudValue.resources.gold === 33, "repairMain should overwrite the damaged cloud copy");
  assert(!recoveryStore.status().recovery, "successful repair should clear the recovery marker");
  localStorage.data.set("succubus-kill-save-v1", JSON.stringify(validLocal));
  cloudValue = [];
  const malformedStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  assert((await malformedStore.load()).resources.gold === 33, "a malformed array cloud save must fall back to valid local data");
  assert(malformedStore.status().recovery === "cloud", "a malformed array cloud save should be marked for repair");
  assert(malformedStore.inspectCopy({ ...validLocal, updatedAt: {} }).corrupt, "invalid save metadata types should be rejected");
  assert(malformedStore.inspectCopy({ ...validLocal, ownedSkins: [] }).corrupt, "invalid persistent map types should be rejected");
  assert(malformedStore.inspectCopy({
    ...validLocal,
    deck: [{ name: "未知牌", suit: "♠" }],
  }).corrupt, "unknown persisted cards should be rejected");
  assert(malformedStore.inspectCopy({
    ...validLocal,
    deck: [{ name: "杀", suit: "虚" }],
  }).corrupt, "persisted cards with invalid suits should be rejected");
  assert(!malformedStore.inspectCopy({
    ...validLocal,
    deck: [{ name: "杀", suit: "♠", type: "slash", power: 1 }],
  }).corrupt, "legacy canonical card fields should remain loadable before compaction");
  const rebuiltCard = window.GameStoreSaveSchema.rebuildCard({
    name: "杀", suit: "♠", power: 999, poison: true,
  });
  assert(rebuiltCard.power === 1 && !rebuiltCard.poison,
    "card reconstruction must discard injected gameplay fields");
  assert(malformedStore.inspectCopy({
    ...validLocal,
    bounties: [{
      id: "safe-id", type: "bond", missionId: "machine_factory",
      charId: "a", injected: "<img src=x onerror=alert(1)>",
    }],
  }).corrupt, "bounty tasks with non-whitelisted fields should be rejected");
  assert(malformedStore.inspectCopy({
    ...validLocal,
    bounties: [{
      id: "bad\" onclick=\"alert(1)", type: "bond",
      missionId: "machine_factory", charId: "a",
    }],
  }).corrupt, "bounty task ids with unsafe attribute characters should be rejected");
  [
    { deck: Array(4097).fill({ name: "杀" }) },
    { chars: Array(257).fill({ id: "a" }) },
    { pendingBountyRewards: Array(257).fill({ type: "essence", essence: 1 }) },
    { resources: { ...validLocal.resources, gold: 1_000_000_001 } },
    { resources: { ...validLocal.resources, gold: 1_000_000_000, shards: 1_000_000_000 } },
    { resources: { ...validLocal.resources, essence: 1.5 } },
    { resources: { ...validLocal.resources, relics: Array(4097).fill("relic") } },
    { battle: { allies: Array(4097).fill(null) } },
    { _saveVersion: 1_000_000_000_001 },
    { padding: "x".repeat(2 * 1024 * 1024) },
  ].forEach(fields => {
    assert(malformedStore.inspectCopy({ ...validLocal, ...fields }).corrupt, `oversized save data should be rejected: ${Object.keys(fields)[0]}`);
  });
  const oversizedKey = "oversized-local-save";
  const oversizedText = JSON.stringify({ padding: "x".repeat(2 * 1024 * 1024) });
  localStorage.data.set(oversizedKey, oversizedText);
  const nativeJsonParse = JSON.parse;
  let oversizedParsed = false;
  try {
    JSON.parse = value => {
      if (value === oversizedText) oversizedParsed = true;
      return nativeJsonParse(value);
    };
    const oversizedDetails = window.GameStoreIO.getLocalDetails(oversizedKey);
    assert(oversizedDetails.corrupt, "oversized local saves should be marked corrupt");
  } finally {
    JSON.parse = nativeJsonParse;
    localStorage.data.delete(oversizedKey);
  }
  assert(!oversizedParsed, "oversized local saves must be rejected before JSON parsing");
  assert(!window.GameStoreIO.putLocalRaw(oversizedKey, { padding: "x".repeat(2 * 1024 * 1024) }), "low-level local writes must reject oversized snapshots");
  assert(!window.GameStoreIO.putLocalRaw(
    oversizedKey, { padding: "x".repeat(2 * 1024 * 1024) }, { validated: true },
  ), "forged validated local writes must reject oversized snapshots");
  const cloudFallbackKey = "cloud-structure-fallback";
  localStorage.data.set(cloudFallbackKey, JSON.stringify(validLocal));
  cloudValue = { ...validLocal, battle: { allies: Array(4097).fill(null) } };
  const boundedCloudDetails = await window.GameStoreIO.getRawDetails(cloudFallbackKey);
  assert(boundedCloudDetails.cloudCorrupt, "oversized nested cloud collections should be marked corrupt before comparison");
  assert(boundedCloudDetails.source === "local" && boundedCloudDetails.selected.resources.gold === 33, "invalid cloud structure should fall back to valid local data");
  localStorage.data.delete(cloudFallbackKey);
  const guardedStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  const invalidSnapshotState = window.GameStore.freshState();
  invalidSnapshotState.resources.gold = 1_000_000_001;
  const invalidUpdatedAt = invalidSnapshotState.updatedAt;
  const invalidVersion = invalidSnapshotState._saveVersion;
  let invalidSnapshotError = null;
  try { guardedStore.prepareSaveSnapshot(invalidSnapshotState); }
  catch (error) { invalidSnapshotError = error; }
  assert(invalidSnapshotError?.code === "INVALID_SAVE_STRUCTURE", "save preparation should reject snapshots beyond the shared limits");
  assert(invalidSnapshotState.updatedAt === invalidUpdatedAt && invalidSnapshotState._saveVersion === invalidVersion, "rejected snapshots must not advance in-memory save metadata");
  assertInvalidOfflineSettlementData(malformedStore, validLocal);
  localStorage.data.set("succubus-kill-save-v1", JSON.stringify(validLocal));
  cloudValue = false;
  const expandingRepairStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => ({ ...value, migrationExpansion: "x".repeat(2 * 1024 * 1024) }),
  });
  await expandingRepairStore.load();
  const validLocalBeforeRepair = localStorage.getItem("succubus-kill-save-v1");
  const oversizedRepairError = await captureReject(expandingRepairStore.repairMain(), "repair must reject a migrated snapshot above the byte limit");
  assert(oversizedRepairError.code === "INVALID_SAVE_STRUCTURE", "oversized repair should preserve the shared validation error");
  assert(localStorage.getItem("succubus-kill-save-v1") === validLocalBeforeRepair, "rejected repair must preserve the valid local recovery copy");
  assert(cloudValue === false, "rejected repair must not overwrite the damaged cloud copy with another invalid snapshot");

  controlledPuts = [];
  cloudValue = false;
  const repairRaceStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => {
      if (!value || typeof value !== "object") throw new Error("invalid cloud structure");
      return value;
    },
  });
  await repairRaceStore.load();
  const repairing = repairRaceStore.repairMain();
  await tick();
  const newerRepairState = { ...validLocal, updatedAt: 301, _saveVersion: 301, resources: { gold: 99, essence: 0, relics: [] } };
  const newerDuringRepair = repairRaceStore.queueMainSave(newerRepairState, { flush: true });
  await tick();
  assert(controlledPuts.length === 1, "main repair and newer saves must share one cloud-write queue");
  controlledPuts[0].succeed();
  await tick();
  assert(controlledPuts[1]?.value.resources.gold === 99, "a newer save should run after the older repair");
  controlledPuts[1].succeed();
  await Promise.all([repairing, newerDuringRepair]);
  assert(cloudValue.resources.gold === 99, "an older repair must not overwrite a newer cloud save");
  controlledPuts = null;
  localStorage.data.set("succubus-kill-save-v1", "{broken");
  cloudValue = validLocal;
  localWritable = true;
  cloudWritable = false;
  const partialRepairStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  await partialRepairStore.load();
  await partialRepairStore.repairMain();
  assert(!partialRepairStore.status().recovery, "repair should clear damage status when its target copy succeeds");
  assert(partialRepairStore.status().dirty, "a failed non-target sync should remain visible as a dirty main save");
  assert(JSON.parse(localStorage.getItem("succubus-kill-save-v1")).resources.gold === 33, "partial repair should restore the damaged target copy");
  cloudWritable = true;
  await partialRepairStore.retryDirty();

  const tiedLocal = { ...validLocal, updatedAt: 350, _saveVersion: 350, resources: { gold: 1, essence: 0, relics: [] } };
  const tiedCloud = { ...tiedLocal, resources: { gold: 2, essence: 0, relics: [] } };
  localStorage.data.set("succubus-kill-save-v1", JSON.stringify(tiedLocal));
  cloudValue = tiedCloud;
  const tiedStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  assert((await tiedStore.load()).resources.gold === 2, "equal-version main copies should preserve cloud tie-breaking");
  const forgedLocal = { ...tiedLocal, updatedAt: 4_000_000_000_000, _saveVersion: 999_999, resources: { gold: 999, essence: 0, relics: [] } };
  localStorage.data.set("succubus-kill-save-v1", JSON.stringify(forgedLocal));
  cloudValue = { ...tiedCloud, updatedAt: 1, _saveVersion: 1 };
  const legacyConflictStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  assert((await legacyConflictStore.load()).resources.gold === 999,
    "direct KV copy selection should prefer the higher save version");

  const singleWriteStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  const writesBeforeFlush = localWriteCount;
  await singleWriteStore.queueMainSave({ updatedAt: 400, _saveVersion: 400 }, { flush: true });
  assert(localWriteCount === writesBeforeFlush + 1, "a main flush should not rewrite an already saved local copy");
  return validLocal;
};
