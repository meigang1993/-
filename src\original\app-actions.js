function closeContextPanel(e) {
  const codexPanel = e.target.closest(".codex-panel");
  const closeCardCodex = state.cardCodex && !codexPanel;
  const closeRelicCodex = state.relicCodex && !codexPanel;
  const closeSaveSlots = SaveSlots.isOpen();
  const closeSettings = settingsOpen && !e.target.closest(".settings-menu") && !e.target.closest("#settings-toggle");
  const closeSpeech = state.battle?.speech?.dismissible && !e.target.closest("[data-dismiss-speech]");
  const cancelManualDodge = !!state.battle?.manualDodge
    && !state.battle.manualDodge.deflectStarted && !e.target.closest(".manual-dodge-box");
  const cancelManualCounter = !!state.battle?.manualCounter && !e.target.closest(".manual-dodge-box");
  const cancelReckless = !!state.battle?.recklessPrompt && !e.target.closest(".manual-dodge-box");
  if (!state.hallModal && !state.infoUnit && !state.artZoom && !state.cardCodex && !state.relicCodex && !closeSaveSlots
    && !closeSettings && !closeSpeech && !cancelManualDodge && !cancelManualCounter && !cancelReckless) return;
  e.preventDefault();
  if (cancelManualDodge) {
    BattleActionGuard.run("取消手动闪避失败", async ({ state: actionState, isCurrent }) => {
      await BattleSystem.resolveManualDodge(actionState, false, 0, render);
      if (!isCurrent()) return false;
      persist({ battleOperation: true });
    });
    return;
  }
  if (cancelManualCounter) {
    BattleActionGuard.run("取消手动看破失败", async ({ state: actionState, isCurrent }) => {
      await BattleSystem.resolveManualCounter(actionState, false, 0, render);
      if (!isCurrent()) return false;
      persist({ battleOperation: true });
    });
    return;
  }
  if (cancelReckless) {
    BattleActionGuard.run("取消无谋冲拳失败", async ({ state: actionState, isCurrent }) => {
      await BattleSystem.resolveReckless(actionState, false, 0, render);
      if (!isCurrent()) return false;
      persist({ battleOperation: true });
    });
    return;
  }
  if (closeSaveSlots) SaveSlots.close();
  if (closeSettings) { settingsOpen = false; SaveSlots.close(); }
  if (closeCardCodex) state.cardCodex = false;
  if (closeRelicCodex) state.relicCodex = false;
  if (closeSpeech) BattleLines.dismiss(state);
  if (state.artZoom) state.artZoom = null;
  else if (e.target.closest(".info-close")) {
    state.infoUnit = null;
  } else if (!e.target.closest(".modal-card") || e.target.classList.contains("villa-modal")) {
    if (state.hallModal === "littleElranaUnlock"
      && state.flags?.littleElranaUnlockPending && completeClosableEventModal()) return;
    state.hallModal = null;
    state.infoUnit = null;
  }
  render();
}

function bindHallButtons() {
  AppHallBindings.bind({
    getState: () => state, render, persist, lockControl,
    preserveClickedCardScroll, preserveInteractionScroll, updateModalState,
    askGameConfirm, log,
  });
}
