/* global assert, captureReject, expectRejects, tick */
/* global controlledPuts: writable */
module.exports = async function runMainOverwriteTests() {
  const originalIo = window.GameStoreIO;
  const queuedWrites = [], queuedLocalGold = [];
  window.GameStoreIO = {
    ...originalIo,
    putLocalRaw(_key, data) { queuedLocalGold.push(data.resources?.gold); return true; },
    putCloudRaw(_key, data, options) {
      return new Promise(resolve => queuedWrites.push({
        data, options, succeed() { resolve(true); },
      }));
    },
  };
  const atomicQueueStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  const inFlightState = window.GameStore.freshState();
  inFlightState.resources.gold = 201;
  const inFlightSave = atomicQueueStore.save(inFlightState, { flush: true });
  await tick();
  const candidateState = window.GameStore.freshState();
  candidateState.resources.gold = 202;
  const supersededOverwrite = captureReject(
    atomicQueueStore.overwrite(candidateState),
    "an overwrite replaced inside the save queue must reject",
  );
  await tick();
  const laterState = window.GameStore.freshState();
  laterState.resources.gold = 203;
  const laterSave = atomicQueueStore.save(laterState, { flush: true });
  queuedWrites[0].succeed();
  for (let i = 0; i < 20 && !queuedWrites[1]; i += 1) await tick();
  assert(queuedWrites.length === 2 && queuedWrites[1].data.resources.gold === 203,
    "a superseded overwrite candidate must not share the later ordinary save result");
  assert(!queuedLocalGold.includes(202),
    "a superseded atomic overwrite must not replace the local recovery copy");
  queuedWrites[1].succeed();
  await Promise.all([inFlightSave, laterSave]);
  const supersededError = await supersededOverwrite;
  assert(supersededError.code === "SAVE_SUPERSEDED",
    "a queued overwrite replaced by a later snapshot must expose SAVE_SUPERSEDED");
  assert(!atomicQueueStore.status().dirty,
    "a successfully saved later snapshot must not leave the discarded overwrite candidate dirty");
  window.GameStoreIO = originalIo;

  let overwriteLocalWrites = 0, localWritesBeforeCloud = -1;
  window.GameStoreIO = {
    ...originalIo,
    putLocalRaw() { overwriteLocalWrites += 1; return true; },
    async putCloudRaw() {
      localWritesBeforeCloud = overwriteLocalWrites;
      return true;
    },
  };
  const cloudFirstOverwriteStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  const cloudFirstState = window.GameStore.freshState();
  const cloudFirstResult = await cloudFirstOverwriteStore.overwrite(cloudFirstState);
  assert(localWritesBeforeCloud === 0,
    "explicit overwrite must not replace local recovery before cloud commit");
  assert(overwriteLocalWrites === 1 && cloudFirstResult.cloud.ok,
    "a direct KV overwrite should update local recovery after cloud commit");
  assert(!cloudFirstOverwriteStore.status().dirty,
    "a successful direct KV overwrite must clear failure state");

  overwriteLocalWrites = 0;
  window.GameStoreIO = {
    ...originalIo,
    putLocalRaw() { overwriteLocalWrites += 1; return true; },
    async putCloudRaw() { return false; },
  };
  const failedOverwriteStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  await expectRejects(
    failedOverwriteStore.overwrite(window.GameStore.freshState()),
    "a pre-commit overwrite failure must reject",
  );
  assert(overwriteLocalWrites === 0,
    "a pre-commit overwrite failure must preserve the previous local automatic save");
  window.GameStoreIO = originalIo;
};
