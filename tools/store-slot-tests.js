/* global assert, captureReject, expectRejects, tick */
/* global cloudReadable: writable, cloudValue: writable, cloudWritable: writable */
/* global controlledPuts: writable, localWritable: writable */
module.exports = async function runSlotTests(state) {
  const outageLocal = {
    ...window.GameStore.freshState(),
    updatedAt: 250,
    _saveVersion: 250,
    resources: { gold: 25, essence: 0, relics: [] },
  };
  localStorage.data.set("succubus-kill-save-v1", JSON.stringify(outageLocal));
  localStorage.data.set("succubus-kill-slot-1-v1", JSON.stringify(outageLocal));
  cloudReadable = false;
  assert(await window.GameStore.hasMainSave(), "a cloud outage must not hide an existing local main save");
  assert((await window.GameStore.load()).resources.gold === 25, "a cloud outage must fall back to a valid local main save");
  const outageSlots = await window.GameStore.getSlots();
  const outageAuto = outageSlots.find(slot => slot.id === "auto");
  const outageManual = outageSlots.find(slot => slot.id === 1);
  assert(outageSlots.length === 4 && outageAuto?.automatic, "slot listing should prepend the main save as an automatic slot");
  assert(outageAuto.localAvailable && outageAuto.cloudUnknown, "automatic slot listing should expose a local copy while cloud status is unknown");
  assert(outageManual.localAvailable && outageManual.cloudUnknown, "manual slot listing should expose a local copy while cloud status is unknown");
  assert((await window.GameStore.loadAuto()).resources.gold === 25, "automatic slot loading should use the main save");
  assert((await window.GameStore.loadAuto("local")).resources.gold === 25, "automatic slot source loading should support the local copy");
  const outageLoaded = await window.GameStore.loadSlot(1);
  assert(outageLoaded.resources.gold === 25, "default slot loading should use a valid local copy during a cloud outage");
  const cloudBeforePromotion = cloudValue;
  const deferredPromotion = await captureReject(window.GameStore.promoteLoaded(outageLoaded), "unknown cloud state should defer loaded-save cloud promotion");
  assert(deferredPromotion.code === "SAVE_PARTIAL", "deferred loaded-save promotion should remain visibly retryable");
  assert(deferredPromotion.results.local.ok && deferredPromotion.results.cloud.pending, "deferred promotion should update only the local main copy");
  assert(cloudValue === cloudBeforePromotion, "local slot loading must not overwrite cloud main data before a successful cloud read");
  const cloudSlotError = await captureReject(window.GameStore.loadSlot(1, "cloud"), "explicit cloud loading should still fail during an outage");
  assert(cloudSlotError.code === "CLOUD_LOAD_FAILED", "explicit cloud loading should preserve the cloud failure code");
  const cloudAutoError = await captureReject(window.GameStore.loadAuto("cloud"), "explicit automatic cloud loading should fail during an outage");
  assert(cloudAutoError.code === "CLOUD_LOAD_FAILED", "automatic cloud loading should preserve the cloud failure code");
  localStorage.data.delete("succubus-kill-save-v1");
  localStorage.data.delete("succubus-kill-slot-1-v1");
  await expectRejects(window.GameStore.hasMainSave(), "unknown cloud status without a local main copy must remain blocked");
  await expectRejects(window.GameStore.load(), "a cloud outage without a valid local copy must not create a fresh game");
  cloudReadable = true;
  await window.GameStore.retryDirty();
  assert(cloudValue.resources.gold === 25, "deferred loaded-save promotion should sync after an explicit retry");
  localStorage.data.delete("succubus-kill-save-v1");
  cloudValue = false;
  assert(await window.GameStore.hasMainSave(), "a falsy cloud value should count as an existing damaged copy");
  await expectRejects(window.GameStore.loadSlot(2, "local"), "explicit local load should reject when only cloud copy exists");

  cloudWritable = false;
  localWritable = true;
  const failedSave = await captureReject(window.GameStore.saveSlot(1, state), "saveSlot should fail when direct cloud KV fails");
  assert(failedSave.code === "SAVE_FAILED", "slot cloud failure should not report local durability");
  assert(!failedSave.results.slot.local.attempted,
    "cloud-backed slot saves must not replace local recovery before cloud success");
  assert(!failedSave.results.slot.cloud.ok, "failed slot save should record the cloud failure");
  assert(!failedSave.results.main, "main save must not advance when the slot write fails");
  assert(state.currentSaveSlot !== 1, "failed slot save should restore slot metadata");
  assert(window.GameStore.status().slotPending.pending,
    "failed direct-KV slot transaction should remain visible as pending");
  cloudWritable = true;
  await window.GameStore.retrySlotSave(state);
  assert(state.currentSaveSlot === 1, "retrySlotSave should finish the same transaction");
  assert(!window.GameStore.status().slotPending.pending, "successful retry should clear the pending slot transaction");

  localWritable = false;
  cloudWritable = true;
  const cloudOnlyState = window.GameStore.freshState();
  cloudOnlyState.deck = [
    { name: "云端商店购买牌", suit: "♥", type: "tactic" },
    { name: "云端BOSS掉落牌", suit: "♠", type: "slash" },
  ];
  const cloudOnlySave = await window.GameStore.saveSlot(1, cloudOnlyState);
  assert(cloudOnlySave.status === "complete", "cloud-backed saves should succeed when sandboxed localStorage is unavailable");
  assert(!cloudOnlySave.results.slot.local.ok && cloudOnlySave.results.slot.cloud.ok, "cloud-only slot success should preserve copy diagnostics");
  assert(!cloudOnlySave.results.main.local.ok && cloudOnlySave.results.main.cloud.ok, "cloud-only main success should preserve copy diagnostics");
  assert(!window.GameStore.status().slotPending.pending, "cloud-only success must not leave an impossible local retry pending");
  const cloudSlotWithCards = await window.GameStore.loadSlot(1, "cloud");
  const cloudAutoWithCards = await window.GameStore.loadAuto("cloud");
  const expectedCardIdentities = cloudOnlyState.deck
    .map(card => ({ name: card.name, suit: card.suit }));
  assert(JSON.stringify(cloudSlotWithCards.deck) === JSON.stringify(expectedCardIdentities),
    "cloud manual slots must preserve shop and elite/BOSS reward cards");
  assert(JSON.stringify(cloudAutoWithCards.deck) === JSON.stringify(expectedCardIdentities),
    "cloud automatic saves must preserve shop and elite/BOSS reward cards");
  await window.GameStore.deleteSlot(1);
  localWritable = true;

  cloudWritable = false;
  const oldTransaction = await captureReject(window.GameStore.saveSlot(2, state),
    "second slot save should remain retryable");
  assert(oldTransaction.code === "SAVE_FAILED",
    "a failed direct KV slot write should preserve a retryable transaction");
  cloudWritable = true;
  state.resources.gold = 88;
  await window.GameStore.save(state, { flush: true });
  const newerStateVersion = state._saveVersion;
  const retryResult = await window.GameStore.retrySlotSave(state);
  assert(retryResult.results.main.stale, "an older slot retry should explicitly report a superseded main write");
  assert(state._saveVersion === newerStateVersion, "retrying an older slot transaction must not roll back current state metadata");
  assert(state.resources.gold === 88, "retrying an older slot transaction must not replace newer in-memory progress");

  cloudWritable = false;
  localWritable = false;
  const failedBaseVersion = state._saveVersion;
  await expectRejects(window.GameStore.saveSlot(3, state), "a total slot failure should remain retryable");
  assert(state._saveVersion === failedBaseVersion, "a total slot failure should restore the previous state metadata");
  cloudWritable = true;
  localWritable = true;
  await window.GameStore.retrySlotSave(state);
  assert(state.currentSaveSlot === 3, "retrying an unchanged failed transaction should adopt its slot metadata");
  assert(state._saveVersion > failedBaseVersion, "retrying an unchanged failed transaction should adopt its saved version");

  controlledPuts = [];
  const concurrentState = window.GameStore.freshState();
  const firstSlotSave = window.GameStore.saveSlot(1, concurrentState);
  const secondSlotSave = window.GameStore.saveSlot(2, concurrentState);
  const deleteAfterSaves = window.GameStore.deleteSlot(2);
  await tick();
  assert(controlledPuts.length === 1 && controlledPuts[0].key.includes("slot-1"), "slot saves should start serially");
  controlledPuts[0].succeed();
  await tick();
  assert(controlledPuts[1]?.key === "succubus-kill-save-v1", "first slot transaction should flush its main copy");
  controlledPuts[1].succeed();
  await firstSlotSave;
  await tick();
  assert(controlledPuts[2]?.key.includes("slot-2"), "second slot transaction should wait for the first");
  assert(controlledPuts[2].value._saveVersion > controlledPuts[0].value._saveVersion, "serialized slot saves should keep increasing versions");
  controlledPuts[2].succeed();
  await tick();
  controlledPuts[3].succeed();
  await secondSlotSave;
  await deleteAfterSaves;
  assert(concurrentState.currentSaveSlot === 2, "serialized slot saves should finish on the newest slot");
  assert(!localStorage.getItem("succubus-kill-slot-2-v1"), "queued deletion should run after the active slot saves");
  controlledPuts = null;
};
