/* global assert, expectRejects, localWriteCount, tick */
/* global controlledPuts: writable, localWritable: writable */
module.exports = async function runOfflineTests(state) {
  controlledPuts = [];
  const pendingStore = window.GameStoreMainSave({
    freshState: window.GameStoreMigrations.freshState,
    migrate: value => value,
  });
  const pendingPromise = pendingStore.queueMainSave({ updatedAt: 500, _saveVersion: 500 });
  assert(pendingStore.status().syncing, "debounced cloud saves must remain visibly pending");
  assert(pendingStore.flushPending(), "page-hide flush should start a queued cloud save");
  await tick();
  assert(controlledPuts[0]?.options?.flush === true, "page-hide flush should request durable cloud completion");
  controlledPuts[0].succeed();
  await pendingPromise;
  await tick();
  assert(!pendingStore.status().syncing, "syncing status should clear after cloud completion");

  controlledPuts = [];
  const runningFlushQueue = window.GameStoreMainSaveQueue({
    key: "flush-running-main",
    putLocalRaw: () => true,
    putCloudRaw: window.GameStoreIO.putCloudRaw,
    isStale: () => false,
    noteSaveMeta() {},
    markDirty: (_data, error) => error,
    clearDirtyThrough: () => false,
    onSaved() {},
    onError() {},
  });
  const nativeSetTimeout = global.setTimeout;
  try {
    global.setTimeout = (callback, ms, ...args) => nativeSetTimeout(callback, ms === 900 ? 0 : ms, ...args);
    const runningSave = runningFlushQueue.queueMainSave({ updatedAt: 503, _saveVersion: 503 });
    for (let i = 0; i < 20 && !controlledPuts[0]; i += 1) {
      await new Promise(resolve => nativeSetTimeout(resolve, 5));
    }
    assert(controlledPuts[0] && !controlledPuts[0].options?.flush,
      "the reproduced background save must already be running without durable flush");
    assert(runningFlushQueue.flushPending(),
      "page-hide flush must schedule a durable replay for an in-flight background save");
    controlledPuts[0].succeed();
    await tick();
    assert(controlledPuts[1]?.options?.flush === true,
      "the in-flight background snapshot must be replayed with durable flush");
    controlledPuts[1].succeed();
    await runningSave;
  } finally {
    global.setTimeout = nativeSetTimeout;
  }
  controlledPuts = null;

  delete window.dzmm;
  localWritable = true;
  state.settings = { sfxVolume: 23, musicVolume: 47, manualResponse: true };
  await window.GameStore.saveSettings(state.settings);
  const savedSettings = await window.GameStore.loadSettings();
  assert(savedSettings.sfxVolume === 23, "settings storage should preserve SFX volume");
  assert(savedSettings.musicVolume === 47, "settings storage should preserve music volume");
  assert(savedSettings.manualResponse === true, "settings storage should preserve response mode");

  state._localClaimedBountyIds = ["claim-1"];
  state._localDefeatIds = ["defeat-1"];
  state._localInventoryOperationIds = ["inventory-1"];
  state._localInventoryRevision = 7;
  state._localRunState = { key: "run-1", rewards: { "n2-0": { nodeId: "n2-0", gold: 50, essence: 0, cards: [], relics: [] } } };
  state.deck = [
    { name: "商店购买牌", suit: "♥", type: "tactic" },
    { name: "精英掉落牌", suit: "♠", type: "slash" },
    { name: "BOSS掉落牌", suit: "♦", type: "response" },
  ];
  await window.GameStore.saveSlot(2, state);
  const slotWithSettings = await window.GameStore.loadSlot(2, "local");
  assert(slotWithSettings.settings.sfxVolume === 23, "manual save slot should preserve SFX volume");
  assert(slotWithSettings.settings.musicVolume === 47, "manual save slot should preserve music volume");
  assert(slotWithSettings.settings.manualResponse === true, "manual save slot should preserve response mode");
  assert(JSON.stringify(slotWithSettings._localClaimedBountyIds) === '["claim-1"]', "manual save should preserve claimed bounty ids");
  assert(JSON.stringify(slotWithSettings._localDefeatIds) === '["defeat-1"]', "manual save should preserve defeat ids");
  assert(JSON.stringify(slotWithSettings._localInventoryOperationIds) === '["inventory-1"]', "manual save should preserve inventory operation ids");
  assert(slotWithSettings._localInventoryRevision === 7, "manual save should preserve inventory revision");
  assert(slotWithSettings._localRunState?.rewards?.["n2-0"]?.gold === 50, "manual save should preserve settled node rewards");
  const expectedCardIdentities = state.deck
    .map(card => ({ name: card.name, suit: card.suit }));
  assert(JSON.stringify(slotWithSettings.deck) === JSON.stringify(expectedCardIdentities),
    "manual save should preserve shop and elite/BOSS reward cards");

  await window.GameStore.save(state);
  const autoWithCards = await window.GameStore.loadAuto("local");
  assert(JSON.stringify(autoWithCards.deck) === JSON.stringify(expectedCardIdentities),
    "automatic save should preserve shop and elite/BOSS reward cards");
  assert(!window.GameStore.status().dirty, "local-only fallback should not mark dirty");
  localWritable = false;
  await expectRejects(window.GameStore.save(state), "offline save should reject when local storage is blocked");
  assert(window.GameStore.status().storage === "local", "offline save failure should identify local storage");
  localWritable = true;
  await window.GameStore.retryDirty();

  const manualSlot = {
    updatedAt: 200,
    _saveVersion: 200,
    currentSaveSlot: 3,
    chars: [],
    party: [],
    resources: { gold: 12, essence: 0, relics: [] },
  };
  localStorage.data.set("succubus-kill-slot-3-v1", JSON.stringify(manualSlot));
  const writesBeforeLoad = localWriteCount;
  const manuallyLoaded = await window.GameStore.loadSlot(3, "local");
  assert(manuallyLoaded.resources.gold === 12, "manual load should return the selected snapshot");
  assert(localWriteCount === writesBeforeLoad, "manual load must not write any save automatically");
  await window.GameStore.promoteLoaded(manuallyLoaded);
  const promotedMain = JSON.parse(localStorage.getItem("succubus-kill-save-v1"));
  assert(promotedMain.currentSaveSlot === 3, "loaded slot should flush to the main save");
  assert(promotedMain._saveVersion > manualSlot._saveVersion, "loaded slot promotion should receive a newer main-save version");

  localStorage.data.set("succubus-kill-save-v1", "{broken");
  localStorage.data.set("succubus-kill-slot-1-v1", "{broken");
  assert(await window.GameStore.hasMainSave(), "corrupt local main save should still count as existing");
  await expectRejects(window.GameStore.load(), "corrupt offline main save should not silently become a fresh game");
  const slots = await window.GameStore.getSlots();
  assert(slots.find(slot => slot.id === "auto")?.corrupt, "corrupt local main save should be reported in the automatic slot");
  assert(slots.find(slot => slot.id === 1)?.corrupt, "corrupt local manual slot should be reported as corrupt");
};
