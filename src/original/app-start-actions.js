async function continueGame() {
  if (sessionOnly) return;
  if (startActionBusy) return;
  const isCurrent = window.AppRuntimeErrors?.guard?.(null) || (() => true);
  startActionBusy = true;
  window.GameBGM?.unlock?.();
  window.BattleFX?.unlockAudio?.();
  render();
  try {
    const liveSettings = state.settings;
    const loaded = await GameStore.load();
    if (!isCurrent()) return;
    const settingsChanged = reconcileLoadedSettings(loaded, liveSettings);
    startLoadError = "";
    await window.GameBundles?.ensureState?.(loaded);
    if (!isCurrent()) return;
    const ok = await window.ServerCore?.sync?.(loaded);
    if (!isCurrent()) return;
    await persistLoadedMigration(loaded, "continue");
    if (!isCurrent()) return;
    setState(loaded);
    if (!ok?.ok && ok?.message) log(ok.message);
    const settingsPending = await saveReconciledSettings(
      loaded, settingsChanged, "continue"
    );
    if (!isCurrent()) return;
    settingsOpen = settingsPending;
    SaveSlots.close();
    enterGameView();
  } catch (err) {
    if (!isCurrent()) return;
    console.warn("continue failed:", err.message, err.stack);
    if (["CLOUD_LOAD_FAILED", "STORAGE_UNAVAILABLE"].includes(err.code)) {
      startLoadError = "云端读取超时或网络异常。为避免用空白新档覆盖原进度，游戏已停止进入；请检查网络后重试。";
      log(startLoadError);
    } else {
      startLoadError = "";
      log("读取主存档失败，请尝试使用读档。");
    }
  } finally {
    if (isCurrent()) {
      startActionBusy = false;
      render();
    }
  }
}
function enterGameView() {
  startOpen = false;
  render();
  requestAnimationFrame(() => render());
}
