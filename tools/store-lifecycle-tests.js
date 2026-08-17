/* global assert, deletedCloudKeys, expectRejects, localWritable: writable, cloudWritable: writable */
/* global controlledPuts: writable, tick */
/* global testDzmm */
module.exports = async function runLifecycleTests() {
  window.dzmm = testDzmm;
  const handler = window.__saveActionHandler;
  assert(typeof handler === "function", "host save lifecycle handler must register");
  localWritable = true;
  cloudWritable = true;
  window.GameStore.ownedKeys.forEach(key => localStorage.setItem(key, JSON.stringify({
    updatedAt: 1, _saveVersion: 1,
  })));

  const originalDelete = window.dzmm.kv.delete;
  controlledPuts = [];
  const activeSettingsSave = window.GameStore.saveSettings({
    sfxVolume: 10, musicVolume: 20, manualResponse: false,
  });
  await tick();
  const queuedSettingsSave = window.GameStore.saveSettings({
    sfxVolume: 15, musicVolume: 25, manualResponse: true,
  });
  window.dzmm.kv.delete = async key => {
    if (key === window.GameStoreIO.settingsKey) throw new Error("delete failed");
    return originalDelete(key);
  };
  deletedCloudKeys.length = 0;
  const failedAction = handler({ action: "prepareDeleteRecord" });
  await tick();
  assert(deletedCloudKeys.length === 0,
    "host cleanup must wait for the active save to finish before deleting keys");
  controlledPuts[0].succeed();
  await activeSettingsSave;
  const retainedSettings = JSON.parse(localStorage.getItem(window.GameStoreIO.settingsKey));
  assert(retainedSettings.settings.musicVolume === 25,
    "an older completed cloud save must not overwrite newer queued local settings");
  controlledPuts = null;
  const failed = await failedAction;
  assert(failed.ok === false && failed.code === "SAVE_CLEAR_FAILED",
    "any owned-key deletion failure must block the host action");
  window.dzmm.kv.delete = originalDelete;
  await queuedSettingsSave;
  const resumedSettings = JSON.parse(localStorage.getItem(window.GameStoreIO.settingsKey));
  assert(resumedSettings.settings.musicVolume === 25,
    "a save queued before cleanup must resume after the host action fails");
  await window.GameStore.saveSettings({
    sfxVolume: 20, musicVolume: 30, manualResponse: true,
  });

  controlledPuts = [];
  const slotState = window.GameStore.freshState();
  const activeSlotSave = window.GameStore.saveSlot(1, slotState);
  for (let i = 0; i < 20 && !controlledPuts[0]; i += 1) await tick();
  assert(controlledPuts[0], "manual slot save must reach its cloud write");
  window.dzmm.kv.delete = async key => {
    if (key === window.GameStoreIO.settingsKey) throw new Error("delete failed");
    return originalDelete(key);
  };
  const slotCleanup = handler({ action: "prepareDeleteRecord", timeoutMs: 2000 });
  controlledPuts[0].succeed();
  for (let i = 0; i < 20 && !controlledPuts[1]; i += 1) await tick();
  assert(controlledPuts[1],
    "pausing slot saves must leave the dependent main queue able to finish");
  controlledPuts[1].succeed();
  await activeSlotSave;
  controlledPuts = null;
  const failedSlotCleanup = await slotCleanup;
  assert(failedSlotCleanup.ok === false,
    "the active-slot lifecycle fixture must still fail on the injected delete error");
  window.dzmm.kv.delete = originalDelete;

  const originalPause = window.GameStore.pauseSaving;
  const originalResume = window.GameStore.resumeSaving;
  let resumed = false;
  window.GameStore.pauseSaving = () => new Promise(() => {});
  window.GameStore.resumeSaving = () => { resumed = true; };
  const startedAt = Date.now();
  const timedOut = await handler({ action: "reset", timeoutMs: 50 });
  assert(timedOut.ok === false && Date.now() - startedAt < 250,
    "host cleanup must honor a short lifecycle deadline");
  assert(resumed, "a lifecycle timeout must resume saving");
  window.GameStore.pauseSaving = originalPause;
  window.GameStore.resumeSaving = originalResume;

  const originalSettingsPause = window.GameStoreSettings.pause;
  let releaseLatePause;
  window.GameStoreSettings.pause = () => new Promise(resolve => {
    releaseLatePause = resolve;
  });
  const latePauseTimeout = await handler({ action: "reset", timeoutMs: 50 });
  assert(latePauseTimeout.ok === false && releaseLatePause,
    "the lifecycle fixture must time out while the settings pause is pending");
  releaseLatePause();
  await tick();
  window.GameStoreSettings.pause = originalSettingsPause;
  controlledPuts = [];
  const postTimeoutState = window.GameStore.freshState();
  postTimeoutState.resources.gold = 91;
  const postTimeoutSave = window.GameStore.save(postTimeoutState, { flush: true });
  for (let i = 0; i < 20 && !controlledPuts[0]; i += 1) await tick();
  assert(controlledPuts[0],
    "a late pause continuation must not leave the main save queue paused");
  controlledPuts[0].succeed();
  await postTimeoutSave;
  controlledPuts = null;

  window.GameStore.ownedKeys.forEach(key => localStorage.setItem(key, JSON.stringify({
    updatedAt: 2, _saveVersion: 2,
  })));
  cloudWritable = false;
  await expectRejects(window.GameStore.saveSettings({
    sfxVolume: 44, musicVolume: 45, manualResponse: true,
  }), "the lifecycle fixture should create pending settings before reset");
  assert(window.GameStore.status().settings.pending,
    "failed settings sync should retain an in-memory pending snapshot");
  cloudWritable = true;
  deletedCloudKeys.length = 0;
  const reset = await handler({ action: "reset" });
  assert(reset.ok === true && reset.reload === true,
    "reset must clear owned saves and request a reload");
  window.GameStore.ownedKeys.forEach(key => {
    assert(deletedCloudKeys.includes(key), `host reset must delete cloud key ${key}`);
    assert(!localStorage.getItem(key), `host reset must delete local key ${key}`);
  });
  assert(!window.GameStore.status().settings.pending,
    "successful host reset must clear pending settings memory");
};
