/* global assert, captureReject, expectRejects, lastPutOptions, tick */
/* global cloudValue: writable, cloudWritable: writable, controlledPuts: writable, localWritable: writable */
module.exports = async function runMainBasicTests() {
  const state = window.GameStore.freshState();
  const compactedBattle = window.GameStoreCompact.compactSaveData({
    chars: [], deck: [], shopCards: [], pendingBountyRewards: [],
    battle: {
      allies: [], enemies: [],
      played: [{ name: "杀", suit: "♠", power: 999, poison: true }],
      shownPlayed: [{ name: "杀", suit: "♠" }],
    },
  });
  assert(compactedBattle.battle.played.length === 1, "save compaction must keep the turn play trail");
  assert(JSON.stringify(compactedBattle.battle.played[0]) === JSON.stringify({ name: "杀", suit: "♠" }),
    "save compaction must persist only canonical card identity fields");
  assert(compactedBattle.battle.shownPlayed.length === 0, "save compaction must drop transient shown cards");
  const compactedUi = window.GameStoreCompact.compactSaveData({
    chars: [], deck: [], shopCards: [], pendingBountyRewards: [],
    hallModal: "team", infoUnit: "a", artZoom: { src: "portrait.webp" },
    confirmDialog: { id: "confirm-ui" }, bountyPopup: { rewards: [] },
    battle: { allies: [], enemies: [], speech: { text: "temporary" }, played: [], shownPlayed: [] },
  });
  assert(!("hallModal" in compactedUi) && !("infoUnit" in compactedUi), "save compaction must drop modal and info UI state");
  assert(!("artZoom" in compactedUi) && !("confirmDialog" in compactedUi), "save compaction must drop overlay UI state");
  assert(!("bountyPopup" in compactedUi), "save compaction must drop settled reward presentation state");
  assert(!("speech" in compactedUi.battle), "save compaction must drop transient battle dialogue");

  const nativeStructuredClone = global.structuredClone;
  let structuredCloneCalls = 0;
  global.structuredClone = value => {
    structuredCloneCalls += 1;
    return nativeStructuredClone(value);
  };
  try {
    const cloneStore = window.GameStoreMainSave({
      freshState: window.GameStoreMigrations.freshState,
      migrate: value => value,
    });
    const cloneState = window.GameStore.freshState();
    cloneState.resources.gold = 19;
    const cloneSnapshot = cloneStore.prepareSaveSnapshot(cloneState);
    cloneState.resources.gold = 20;
    assert(structuredCloneCalls > 0, "save snapshots should use the native structured clone path");
    assert(cloneSnapshot.resources.gold === 19, "save snapshots must remain detached from runtime state");
  } finally {
    global.structuredClone = nativeStructuredClone;
  }

  const nativeValidateRaw = window.GameStoreSaveLimits.validateRaw;
  let queueValidationCalls = 0;
  controlledPuts = [];
  cloudWritable = true;
  localWritable = true;
  try {
    window.GameStoreSaveLimits.validateRaw = value => {
      queueValidationCalls += 1;
      return nativeValidateRaw(value);
    };
    const validationStore = window.GameStoreMainSave({
      freshState: window.GameStoreMigrations.freshState,
      migrate: value => value,
    });
    const validatedSave = validationStore.queueMainSave(
      { updatedAt: 60, _saveVersion: 60 },
      { flush: true, validated: true, isolated: true },
    );
    await tick();
    assert(queueValidationCalls >= 1,
      "main queue validation must not trust a forged validated flag");
    controlledPuts[0].succeed();
    await validatedSave;
    const beforeRawSave = queueValidationCalls;
    const rawSave = validationStore.queueMainSave(
      { updatedAt: 61, _saveVersion: 61 },
      { flush: true },
    );
    await tick();
    assert(queueValidationCalls > beforeRawSave,
      "a direct raw main snapshot must still pass queue validation");
    controlledPuts[1].succeed();
    await rawSave;
  } finally {
    window.GameStoreSaveLimits.validateRaw = nativeValidateRaw;
    controlledPuts = null;
  }

  window.dzmm.fn = {
    async invoke() {
      throw new Error("store must not call serverless functions");
    },
  };
  cloudWritable = true;
  localWritable = true;
  const fallbackStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  const fallbackState = window.GameStore.freshState();
  fallbackState.resources.gold = 17;
  await fallbackStore.save(fallbackState, { flush: true });
  delete window.dzmm.fn;
  localStorage.data.clear();
  cloudValue = null;
  cloudWritable = false;
  localWritable = false;
  await expectRejects(window.GameStore.save(state, { flush: true }), "save should reject when local and cloud fail");
  assert(window.GameStore.status().dirty, "failed save should mark dirty");
  cloudWritable = true;
  localWritable = true;
  await window.GameStore.retryDirty();
  assert(!window.GameStore.status().dirty, "retryDirty should clear dirty after cloud succeeds");
  assert(lastPutOptions?.flush === true, "cloud saves should request flush");

  cloudWritable = false;
  await expectRejects(window.GameStore.save(state, { flush: true }), "second cloud failure should reject");
  assert(window.GameStore.status().dirty, "second failed save should mark dirty");
  cloudWritable = true;
  state.resources.gold = 7;
  await window.GameStore.save(state, { flush: true });
  assert(!window.GameStore.status().dirty, "new successful save should clear older dirty state");
  assert(cloudValue.resources.gold === 7, "newer snapshot should be written to cloud");

  localWritable = true;
  controlledPuts = [];
  const orderingStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  const first = { updatedAt: 80, _saveVersion: 80, resources: { gold: 1 } };
  const second = { updatedAt: 81, _saveVersion: 81, resources: { gold: 2 } };
  const firstSave = orderingStore.queueMainSave(first, { flush: true });
  await tick();
  const secondSave = orderingStore.queueMainSave(second, { flush: true });
  controlledPuts[0].succeed();
  await tick();
  const orderedLocal = JSON.parse(localStorage.getItem("succubus-kill-save-v1"));
  assert(orderedLocal._saveVersion === 81, "older in-flight success must not overwrite newer local data");
  assert(controlledPuts[1]?.value._saveVersion === 81, "newer flush should run after the older in-flight save");
  controlledPuts[1].succeed();
  await Promise.all([firstSave, secondSave]);

  controlledPuts = [];
  const nativeSetTimeout = global.setTimeout;
  let timedOutPut;
  try {
    global.setTimeout = (callback, ms, ...args) => nativeSetTimeout(callback, ms === 8000 ? 0 : ms, ...args);
    timedOutPut = await window.GameStoreIO.putCloudRaw("late-cloud-write", { _saveVersion: 1 }, { flush: true });
  } finally {
    global.setTimeout = nativeSetTimeout;
  }
  assert(!timedOutPut, "a timed-out cloud write should report failure");
  const newerPut = window.GameStoreIO.putCloudRaw("late-cloud-write", { _saveVersion: 2 }, { flush: true });
  await new Promise(resolve => nativeSetTimeout(resolve, 5));
  assert(controlledPuts.length === 1, "a late cloud write must keep newer writes queued until the underlying request settles");
  controlledPuts[0].succeed();
  await tick();
  assert(controlledPuts[1]?.value._saveVersion === 2, "the newer cloud write should start after the timed-out request actually settles");
  controlledPuts[1].succeed();
  assert(await newerPut, "the queued newer cloud write should succeed");
  assert(cloudValue._saveVersion === 2, "a late old cloud write must not overwrite the newer snapshot");

  controlledPuts = [];
  const flushStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  const nativeArrayAt = Array.prototype.at;
  Array.prototype.at = undefined;
  try {
    const debouncedSave = flushStore.queueMainSave({ updatedAt: 90, _saveVersion: 90 });
    const flushSave = flushStore.queueMainSave({ updatedAt: 91, _saveVersion: 91 }, { flush: true });
    await tick();
    assert(controlledPuts.length === 1, "flush should collapse an older debounced save without Array.at");
    assert(controlledPuts[0].value._saveVersion === 91, "flush should persist only the newest queued snapshot");
    assert(controlledPuts[0].options?.flush === true, "latest collapsed save should retain flush semantics");
    controlledPuts[0].succeed();
    await Promise.all([debouncedSave, flushSave]);
  } finally {
    Array.prototype.at = nativeArrayAt;
  }

  controlledPuts = [];
  const raceStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  const older = { updatedAt: 100, _saveVersion: 100, resources: { gold: 1 } };
  const newer = { updatedAt: 101, _saveVersion: 101, resources: { gold: 2 } };
  const olderSave = raceStore.queueMainSave(older, { flush: true }).catch(() => {});
  await tick();
  const newerQueued = raceStore.queueMainSave(newer).catch(() => {});
  controlledPuts[0].fail();
  await tick();
  assert(controlledPuts[1]?.value._saveVersion === 101, "newer queued save should run after the older failure");
  const staleRetry = raceStore.retryDirty();
  controlledPuts[1].fail();
  await olderSave;
  await newerQueued;
  await staleRetry;
  await tick();
  assert(controlledPuts.length === 2, "retrying an older dirty snapshot must not enqueue it over a newer save");
  assert(raceStore.status().dirty, "newer failed save should remain dirty");
  const localRace = JSON.parse(localStorage.getItem("succubus-kill-save-v1"));
  assert(localRace._saveVersion === 101, "older retry must not roll back the local main save");
  const newerRetry = raceStore.retryDirty();
  await tick();
  assert(controlledPuts[2]?.value._saveVersion === 101, "dirty retry should keep the newest failed snapshot");
  controlledPuts[2].succeed();
  await newerRetry;
  assert(!raceStore.status().dirty, "successful newest retry should clear dirty state");
  assert(cloudValue._saveVersion === 101, "cloud save must finish on the newest snapshot");
  controlledPuts = null;

  controlledPuts = [];
  const nativeSetTimeoutForStatus = global.setTimeout;
  const statusEvents = [];
  window.Event = class TestEvent { constructor(type) { this.type = type; } };
  window.dispatchEvent = event => { statusEvents.push(event.type); };
  const statusStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  try {
    global.setTimeout = (callback, ms, ...args) => nativeSetTimeoutForStatus(callback, ms === 900 ? 0 : ms, ...args);
    statusStore.queueMainSave({ updatedAt: 110, _saveVersion: 110 }).catch(() => {});
    for (let i = 0; i < 20 && !controlledPuts[0]; i += 1) {
      await new Promise(resolve => nativeSetTimeoutForStatus(resolve, 10));
    }
    assert(controlledPuts[0], "background cloud save should start after the debounce");
    controlledPuts[0].fail();
    await tick();
  } finally {
    global.setTimeout = nativeSetTimeoutForStatus;
    delete window.dispatchEvent;
  }
  assert(statusStore.status().dirty, "background cloud failure should mark the save dirty");
  assert(statusEvents.includes("game-store-status"), "background cloud failure should notify the UI immediately");
  controlledPuts = null;

  controlledPuts = [];
  localWritable = true;
  const firstSettingsSave = window.GameStore.saveSettings({ sfxVolume: 10, musicVolume: 20, manualResponse: false });
  await tick();
  const secondSettingsSave = window.GameStore.saveSettings({ sfxVolume: 30, musicVolume: 40, manualResponse: true });
  const latestLocalSettings = JSON.parse(localStorage.getItem("succubus-kill-settings-v1"));
  assert(latestLocalSettings.settings.musicVolume === 40, "new settings must update the local copy without waiting for an older cloud write");
  assert(controlledPuts[0]?.options?.flush === true, "settings cloud writes should request flush");
  controlledPuts[0].succeed();
  await tick();
  assert(controlledPuts[1]?.value.settings.musicVolume === 40, "settings cloud writes must finish with the newest snapshot");
  controlledPuts[1].succeed();
  await Promise.all([firstSettingsSave, secondSettingsSave]);
  controlledPuts = null;

  await require("./store-main-overwrite-tests")();
  return state;
};
