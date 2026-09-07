async function startNewGame() {
  if (startActionBusy) return;
  const isCurrent = window.AppRuntimeErrors?.guard?.(null) || (() => true);
  if (sessionOnly) {
    await createNewGame();
    return;
  }
  startActionBusy = true;
  render();
  try {
    const existing = await GameStore.hasMainSave();
    if (!isCurrent()) return;
    startActionBusy = false;
    if (existing) {
      askGameConfirm({
        title: "开始新游戏",
        text: "新的进度将覆盖自动存档，手动存档会保留。确定继续？",
        confirmText: "开始新游戏",
        danger: true,
        onConfirm: createNewGame,
      });
      return;
    }
    await createNewGame();
  } catch (err) {
    if (!isCurrent()) return;
    startActionBusy = false;
    console.warn("new game save check failed:", err.code, err.message, err.stack);
    log("无法确认云端旧存档，已停止创建新游戏。");
    window.dzmm?.toast?.warning?.("无法确认旧存档，请检查网络后重试");
    render();
  }
}
async function createNewGame() {
  if (startActionBusy) return;
  const isCurrent = window.AppRuntimeErrors?.guard?.(null) || (() => true);
  startActionBusy = true;
  window.GameBGM?.unlock?.();
  window.BattleFX?.unlockAudio?.();
  const previousState = state;
  const settings = { ...state.settings };
  const candidate = GameStore.freshState();
  candidate.settings = settings;
  render();
  try {
    await window.GameBundles?.ensureState?.(candidate);
    if (!isCurrent()) return;
    const ok = await window.ServerCore?.call?.("newGame", {}, candidate);
    if (!isCurrent()) return;
    if (!ok?.ok) throw new Error(ok?.message || "本地新档初始化失败");
    if (!sessionOnly) {
      await GameStore.overwrite(candidate);
      if (!isCurrent()) return;
    }
    setState(candidate);
    settingsOpen = false;
    SaveSlots.close();
    saveWarningShown = false;
    enterGameView();
  } catch (err) {
    if (!isCurrent()) return;
    if (state !== previousState) setState(previousState);
    if (!sessionOnly) GameStore.restoreCurrent?.(previousState);
    console.warn("new game init or save failed:", err.code, err.message, err.stack);
    log(sessionOnly ? "临时试玩初始化失败，请重试。" : "新游戏保存失败，原进度未被替换。请检查网络后重试。");
    if (!sessionOnly) window.dzmm?.toast?.warning?.("新游戏未保存，已保留原进度");
  } finally {
    if (isCurrent()) {
      startActionBusy = false;
      render();
    }
  }
}
