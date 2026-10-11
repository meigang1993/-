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

// 本次更新不再支持旧存档：启动时把不兼容的存档（自动存档 + 全部手动存档位）
// 整份清除，并在启动页给出提示。清理失败不阻塞进入游戏。
async function purgeLegacySavesOnStart() {
  if (sessionOnly || !window.GameStore?.purgeLegacySaves) return;
  try {
    const result = await GameStore.purgeLegacySaves();
    const purged = (result?.purged || []).length;
    if (!purged) return;
    const slotCount = Math.max(0, purged - 1);
    startNotice = slotCount
      ? `检测到旧版存档（自动存档与 ${slotCount} 个手动存档），本次更新后不再兼容，已清除。请开始新游戏。`
      : "检测到旧版存档，本次更新后不再兼容，已清除。请开始新游戏。";
    log(startNotice);
    if (typeof render === "function") render();
  } catch (err) {
    console.warn("legacy save purge failed:", err?.code, err?.message, err?.stack);
  }
}
