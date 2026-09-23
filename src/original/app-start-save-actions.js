async function saveReconciledSettings(loaded, changed, label) {
  if (sessionOnly) return false;
  if (!changed) return false;
  try {
    await GameStore.saveSettings(loaded.settings);
    return false;
  } catch (err) {
    console.warn(`${label} settings sync failed:`, err.code, err.message, err.stack);
    return err.code !== "SETTINGS_SAVE_SUPERSEDED";
  }
}
async function persistLoadedMigration(loaded, label) {
  if (sessionOnly) return true;
  if (!loaded?._needsSaveAfterMigration) return true;
  try {
    await GameStore.persistMigration(loaded);
    return true;
  } catch (err) {
    saveWarningShown = true;
    loaded.log = [
      "读档修复已应用，但自动存档尚未同步，请使用存档重试。",
      ...(loaded.log || []),
    ].slice(0, 30);
    console.warn(`${label} migration save failed:`, err.code, err.message, err.stack);
    return false;
  }
}
