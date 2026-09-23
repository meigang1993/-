/* global assert, captureReject, tick */
/* global cloudReadable: writable, cloudValue: writable, cloudWritable: writable, localWritable: writable */
/* global controlledPuts: writable */
module.exports = async function runSettingsTests() {
  const key = window.GameStoreIO.settingsKey;
  localWritable = true;
  cloudWritable = true;
  localStorage.data.set(key, JSON.stringify({
    updatedAt: 30,
    _saveVersion: 3,
    settings: { sfxVolume: 31, musicVolume: 41, manualResponse: true },
  }));
  cloudValue = {
    updatedAt: 40,
    _saveVersion: 4,
    settings: {
      sfxVolume: 61, musicVolume: 71, battleSpeed: 1.5,
      manualResponse: false,
      appearanceUpdatedAt: 40,
      equippedSkins: { lokar: "lokar_motherbound" },
    },
  };
  cloudReadable = false;

  const localSettings = await window.GameStore.loadSettings();
  assert(localSettings.musicVolume === 41,
    "failed settings cloud reads should use a valid local copy");
  let status = window.GameStore.status().settings;
  assert(status.state === "error" && status.cloudUnknown && status.localAvailable,
    "local settings fallback should expose a retryable cloud-read error");

  cloudReadable = true;
  const cloudSettings = await window.GameStore.retrySettings();
  assert(cloudSettings.musicVolume === 71,
    "settings retry should adopt the newer valid cloud copy");
  assert(cloudSettings.battleSpeed === 1.5,
    "settings retry should restore the persisted battle animation speed");
  assert(cloudSettings.equippedSkins.lokar === "lokar_motherbound",
    "settings retry should retain independently persisted appearance choices");
  status = window.GameStore.status().settings;
  assert(status.state === "ready" && !status.cloudUnknown,
    "successful settings retry should clear the error state");
  const appearanceState = {
    chars: [{ id: "lokar", locked: false }],
    ownedSkins: { lokar_default: true, lokar_motherbound: true },
    equippedSkins: { lokar: "lokar_default" },
    settings: { appearanceUpdatedAt: 30, equippedSkins: { lokar: "lokar_default" } },
  };
  assert(window.SkinSystem.applySavedAppearance(appearanceState, cloudSettings),
    "newer appearance settings should override an older main-save selection");
  assert(appearanceState.equippedSkins.lokar === "lokar_motherbound",
    "newer battle appearance should restore after loading the older main save");
  assert(!window.SkinSystem.applySavedAppearance(appearanceState, {
    appearanceUpdatedAt: 20,
    equippedSkins: { lokar: "lokar_default" },
  }), "older appearance settings must not overwrite a newer main-save selection");

  cloudReadable = false;
  await window.GameStore.loadSettings();
  const blockedSave = await captureReject(
    window.GameStore.saveSettings({
      sfxVolume: 99, musicVolume: 99, battleSpeed: 2,
      manualResponse: false,
    }),
    "settings writes should be blocked while the cloud copy is unknown"
  );
  assert(blockedSave.code === "SETTINGS_CLOUD_UNKNOWN",
    "blocked settings writes should report the cloud-unknown state");
  const retained = JSON.parse(localStorage.getItem(key));
  assert(retained.settings.musicVolume === 41,
    "blocked settings writes must not replace the valid local fallback");
  assert(window.GameStore.status().settings.pending,
    "blocked explicit settings should remain pending until a strict retry");

  cloudReadable = true;
  const restoredSettings = await window.GameStore.retrySettings();
  assert(restoredSettings.musicVolume === 99,
    "strict retry should preserve settings restored while cloud was unknown");
  assert(restoredSettings.battleSpeed === 2,
    "strict retry should preserve the pending battle animation speed");
  assert(cloudValue.settings.musicVolume === 99,
    "pending restored settings should sync only after the strict cloud read");
  status = window.GameStore.status().settings;
  assert(status.state === "ready" && !status.pending,
    "successful pending settings sync should clear the retry state");

  cloudReadable = false;
  await window.GameStore.loadSettings();
  await captureReject(
    window.GameStore.saveSettings({
      sfxVolume: 70, musicVolume: 72, manualResponse: false,
    }),
    "the concurrency fixture should stage settings while cloud is unknown"
  );
  cloudReadable = true;
  controlledPuts = [];
  const syncing = window.GameStore.retrySettings();
  await tick();
  assert(window.GameStore.status().settings.state === "syncing",
    "pending settings retry should remain locked until the cloud write settles");
  const newerBlocked = await captureReject(
    window.GameStore.saveSettings({
      sfxVolume: 73, musicVolume: 74, manualResponse: true,
    }),
    "external settings writes should stay blocked during retry synchronization"
  );
  assert(newerBlocked.code === "SETTINGS_SYNC_REQUIRED",
    "writes during retry synchronization should remain explicitly blocked");
  controlledPuts[0].succeed();
  await syncing;
  controlledPuts = null;
  assert(window.GameStore.status().settings.pending,
    "a newer blocked setting must remain pending after the older sync completes");
  const newerSynced = await window.GameStore.retrySettings();
  assert(newerSynced.musicVolume === 74,
    "a second strict retry should synchronize the newer pending setting");

  localStorage.data.set(key, JSON.stringify({
    updatedAt: 50,
    _saveVersion: 5,
    settings: { sfxVolume: 21, musicVolume: 22, manualResponse: true },
  }));
  cloudValue = "damaged-settings-record";
  const repairedLocal = await window.GameStore.loadSettings();
  assert(repairedLocal.musicVolume === 22,
    "a damaged cloud settings copy should retain a valid local copy");
  assert(window.GameStore.status().settings.error === "SETTINGS_CLOUD_INVALID",
    "damaged cloud settings should expose a repair state");
  const repaired = await window.GameStore.retrySettings();
  assert(repaired.musicVolume === 22 && cloudValue.settings.musicVolume === 22,
    "settings retry should repair damaged cloud data from the valid local copy");

  localStorage.data.delete(key);
  cloudValue = {
    updatedAt: 55,
    _saveVersion: 5,
    settings: {
      sfxVolume: 23, musicVolume: 24, manualResponse: false,
      appearanceUpdatedAt: 55,
      equippedSkins: { lokar: "removed_skin_id" },
    },
  };
  const sanitizedObsoleteSkin = await window.GameStore.loadSettings();
  assert(sanitizedObsoleteSkin.musicVolume === 24,
    "obsolete skin ids should not invalidate otherwise valid settings");
  assert(!Object.keys(sanitizedObsoleteSkin.equippedSkins).length,
    "obsolete skin ids should be removed during settings normalization");

  localStorage.data.delete(key);
  cloudValue = null;
  cloudReadable = false;
  const missingFallback = await captureReject(
    window.GameStore.loadSettings(),
    "settings load should fail when cloud and local copies are unavailable"
  );
  assert(missingFallback.code === "SETTINGS_CLOUD_LOAD_FAILED",
    "missing local settings fallback should preserve the cloud read failure");
  status = window.GameStore.status().settings;
  assert(status.state === "error" && !status.localAvailable,
    "settings failure without a local copy should expose a locked error state");

  cloudReadable = true;
  const defaults = await window.GameStore.retrySettings();
  assert(defaults.musicVolume === 80,
    "an explicit empty cloud result may restore default settings");
  assert(defaults.battleSpeed === 1,
    "default settings should use normal battle animation speed");
  assert(window.GameStore.status().settings.state === "ready",
    "an explicit empty cloud result should clear the settings error");

  cloudValue = {
    updatedAt: 60,
    _saveVersion: 6,
    settings: { sfxVolume: 40, musicVolume: 40, manualResponse: false },
  };
  await window.GameStore.loadSettings();
  controlledPuts = [];
  const olderSave = window.GameStore.saveSettings({
    sfxVolume: 30, musicVolume: 30, manualResponse: false,
  });
  const newerSave = window.GameStore.saveSettings({
    sfxVolume: 50, musicVolume: 50, manualResponse: true,
  });
  await tick();
  controlledPuts[0].fail();
  const olderFailure = await captureReject(olderSave,
    "the older settings write should report its cloud failure");
  assert(olderFailure.code === "SETTINGS_SAVE_SUPERSEDED",
    "an obsolete failure should not be reported as the latest settings failure");
  await tick();
  controlledPuts[1].succeed();
  await newerSave;
  controlledPuts = null;
  status = window.GameStore.status().settings;
  assert(status.state === "ready" && !status.pending,
    "an older failed write must not remain pending after a newer save succeeds");
  assert(cloudValue.settings.musicVolume === 50,
    "retry state must never roll cloud settings back behind a newer save");

  cloudValue = { updatedAt: 70, _saveVersion: 7, unrelated: true };
  localStorage.data.delete(key);
  const invalidShape = await captureReject(
    window.GameStore.loadSettings(),
    "non-empty cloud data without settings fields should be treated as damaged"
  );
  assert(invalidShape.code === "SETTINGS_CLOUD_INVALID",
    "invalid non-empty settings data must not be normalized into defaults");
  cloudValue = {
    updatedAt: 80,
    _saveVersion: 8,
    settings: { sfxVolume: 80, musicVolume: 80, manualResponse: false },
  };
  await window.GameStore.retrySettings();
};
