let pendingBattleCheckpoint = null;
let battleCheckpointTimer = null;

function cancelPendingBattleCheckpoint() {
  clearTimeout(battleCheckpointTimer);
  battleCheckpointTimer = null;
  pendingBattleCheckpoint = null;
}

function scheduleBattleCheckpoint(actionState, battle, flush = false) {
  const previous = pendingBattleCheckpoint;
  const sameBattle = previous?.state === actionState && previous?.battle === battle;
  pendingBattleCheckpoint = {
    state: actionState,
    battle,
    flush: flush || (sameBattle && !!previous?.flush),
  };
  clearTimeout(battleCheckpointTimer);
  battleCheckpointTimer = setTimeout(() => {
    battleCheckpointTimer = null;
    const request = pendingBattleCheckpoint;
    pendingBattleCheckpoint = null;
    if (!request || state !== request.state || state.battle !== request.battle) return;
    persist({ battleScheduled: true, flush: request.flush });
  }, 0);
  return true;
}

function flushPendingBattleCheckpoint() {
  const request = pendingBattleCheckpoint;
  cancelPendingBattleCheckpoint();
  if (!request || state !== request.state || state.battle !== request.battle) {
    return Promise.resolve(false);
  }
  return persist({ battleScheduled: true, flush: true });
}

async function persist(options = {}) {
  if (sessionOnly) return false;
  if (!state || !window.GameStore?.save) return false;
  const battle = state.battle;
  if (!battle && pendingBattleCheckpoint) cancelPendingBattleCheckpoint();
  const battleStart = options.battleStart === true
    && state.view === "battle" && battle && typeof battle === "object" && !battle.test;
  const checkpoint = window.BattleSaveCheckpoint;
  const lastCheckpointMarker = battleCheckpointMarkers.get(battle)
    ?? checkpoint?.savedMarker?.(battle) ?? null;
  const stableBattle = !battleStart && !!battle
    && !window.BattleEffects?.animating && !window.BattleEffects?.draining
    && checkpoint?.stable?.(state);
  if (stableBattle && options.battleOperation === true) {
    checkpoint.noteOperation(state);
  }
  const battleCheckpoint = !battleStart && !!battle
    && stableBattle
    && checkpoint?.canSave?.(state, lastCheckpointMarker);
  if ((battle || state.view === "battle" || state.view === "battleLoading")
    && !battleStart && !battleCheckpoint) return false;
  if (battleStart && battleStartSaves.has(battle)) return false;
  if (battleCheckpoint && options.battleScheduled !== true && options.flush !== true) {
    return scheduleBattleCheckpoint(state, battle);
  }
  const saveOptions = { ...options };
  delete saveOptions.battleStart;
  delete saveOptions.battleOperation;
  delete saveOptions.battleScheduled;
  saveOptions.trusted = true;
  if (battleStart) battleStartSaves.add(battle);
  let checkpointWrite = null;
  if (battleCheckpoint) {
    const marker = checkpoint.mark(state, lastCheckpointMarker);
    battleCheckpointMarkers.set(battle, marker);
    saveOptions.flush = true;
    checkpointWrite = { marker, previousMarker: lastCheckpointMarker };
  }
  try {
    let saveTask;
    if (checkpointWrite) {
      try {
        saveTask = GameStore.save(state, saveOptions);
      } finally {
        if (battle.resumeCheckpoint === checkpointWrite.marker) {
          delete battle.resumeCheckpoint;
        }
      }
    } else saveTask = GameStore.save(state, saveOptions);
    await saveTask;
    if (battleStart) {
      battleCheckpointMarkers.set(battle, checkpoint.baseline(battle));
    }
    saveWarningShown = false;
    return true;
  } catch (err) {
    if (battleStart) battleStartSaves.delete(battle);
    if (checkpointWrite && battleCheckpointMarkers.get(battle) === checkpointWrite.marker) {
      if (checkpointWrite.previousMarker) {
        battleCheckpointMarkers.set(battle, checkpointWrite.previousMarker);
      } else battleCheckpointMarkers.delete(battle);
    }
    console.warn("automatic save failed:", err.code, err.message, err.stack);
    if (!saveWarningShown) window.dzmm?.toast?.warning?.("自动存档失败，当前进度待重试");
    saveWarningShown = true;
    scheduleRender();
    return false;
  }
}
function flushPendingSave() {
  if (sessionOnly) return;
  try {
    flushPendingBattleCheckpoint();
    window.GameStore?.flushPending?.();
  } catch (err) {
    console.warn("page hide save flush failed:", err.message, err.stack);
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") flushPendingSave();
});
window.addEventListener("pagehide", flushPendingSave);

function settingsSnapshot(actionState = state) {
  const source = actionState?.settings ? actionState : state;
  return {
    ...(source?.settings || {}),
    equippedSkins: { ...(source?.equippedSkins || {}) },
  };
}
function reconcileLoadedSettings(loaded, liveSettings, restorePreferences = false) {
  if (!loaded || !liveSettings) return false;
  window.SkinSystem?.applySavedAppearance?.(loaded, liveSettings);
  const appearanceUpdatedAt = loaded.settings?.appearanceUpdatedAt || 0;
  const equippedSkins = {
    ...(loaded.settings?.equippedSkins || loaded.equippedSkins || {}),
  };
  loaded.settings = {
    ...(loaded.settings || {}),
    ...(restorePreferences ? {} : {
      sfxVolume: liveSettings.sfxVolume,
      musicVolume: liveSettings.musicVolume,
      battleSpeed: liveSettings.battleSpeed ?? 1,
      manualResponse: liveSettings.manualResponse,
    }),
    appearanceUpdatedAt,
    equippedSkins,
  };
  const keys = ["sfxVolume", "musicVolume", "battleSpeed", "manualResponse", "appearanceUpdatedAt"];
  return keys.some(key => loaded.settings[key] !== liveSettings[key])
    || JSON.stringify(equippedSkins)
      !== JSON.stringify(liveSettings.equippedSkins || {});
}
function persistSettingsNow(actionState = state) {
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = null;
  if (sessionOnly) return Promise.resolve(false);
  const settings = settingsSnapshot(actionState);
  return GameStore.saveSettings(settings).catch(err => {
    console.warn("settings save failed:", err.message, err.stack);
    if (err.code !== "SETTINGS_SAVE_SUPERSEDED") {
      window.dzmm?.toast?.warning?.("设置保存失败，请稍后重试");
    }
    scheduleRender();
    return false;
  });
}
function persistAppearanceNow(actionState = state) {
  return persistSettingsNow(actionState);
}
function persistSettingsSoon() {
  clearTimeout(settingsSaveTimer);
  if (sessionOnly) {
    settingsSaveTimer = null;
    return;
  }
  settingsSaveTimer = setTimeout(() => {
    persistSettingsNow();
  }, 500);
}
