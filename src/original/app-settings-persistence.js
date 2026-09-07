function settingsSnapshot(actionState = state) {
  const source = actionState?.settings ? actionState : state;
  return {
    ...(source?.settings || {}),
    equippedSkins: { ...(source?.equippedSkins || {}) },
  };
}

function reconcileLoadedSettings(loaded, liveSettings,
  restorePreferences = false) {
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
  const keys = [
    "sfxVolume", "musicVolume", "battleSpeed", "manualResponse",
    "appearanceUpdatedAt",
  ];
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
