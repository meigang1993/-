window.AppRuntimeRecovery = (() => {
  const blockingBattleKeys = [
    "manualDodge", "manualCounter", "counterTrigger", "counterTriggerQueue",
    "recklessPrompt", "risaEyePrompt",
    "handReveal", "thunderHammer", "dimensionTransfer", "opheliaGuard",
    "cadicisResponsibility", "wendyTutorPicker", "ailengDrillPicker",
    "mannyArmoryPicker", "gerdaComfort", "kaiichiShare", "newMoonShare",
    "millerShare", "discardPick", "pendingVictory", "pendingDefeat",
    "victoryScreen", "defeat", "testComplete",
  ];
  const preparePromptKeys = [
    "awaitingExtractUid", "awaitingMimicUid", "awaitingSpeedAssaultUid",
  ];

  function report(label, error) {
    try {
      console.error(`${label}:`, error?.code, error?.message, error?.stack);
    } catch (_) {}
  }

  function attempt(label, task) {
    try {
      task();
      return true;
    } catch (error) {
      report(label, error);
      return false;
    }
  }

  function hasBlockingBattlePrompt(battle) {
    return !!battle && (
      blockingBattleKeys.some(key => !!battle[key])
      || battle.phase === 1 && preparePromptKeys.some(key => !!battle[key])
    );
  }

  function unlockControls() {
    attempt("runtime app action reset failed",
      () => window.AppActionGuard?.reset?.());
    attempt("runtime battle action reset failed",
      () => window.BattleActionGuard?.reset?.());
    document.querySelectorAll('[data-locked="1"]').forEach(control => {
      attempt("runtime control unlock failed", () => {
        delete control.dataset.locked;
        delete control.dataset.appLockToken;
        delete control.dataset.battleLockGeneration;
        delete control.dataset.busyText;
        control.style.pointerEvents = "";
        if (control.tagName === "BUTTON") control.disabled = false;
      });
    });
  }

  function recoverBattle() {
    const battle = state?.battle;
    if (!battle) return;
    battle.assetRetryGeneration = (battle.assetRetryGeneration || 0) + 1;
    battle.assetRetrying = false;
    battle.assetRetryProgress = null;
    const hasBlockingPrompt = hasBlockingBattlePrompt(battle);
    const hasRecoverableEvent =
      window.BattleEffects?.hasRecoverableEvent?.(state) === true;
    if (!hasBlockingPrompt) {
      battle.locked = false;
      try {
        window.BattleSystem?.cancelSelection?.(state);
      } catch (error) {
        console.warn("runtime battle selection cleanup failed:",
          error.message, error.stack);
      }
    }
    try {
      if (hasBlockingPrompt || hasRecoverableEvent) {
        window.BattleEffects?.restart?.(state);
      } else {
        window.BattleEffects?.cancel?.(state);
      }
      window.BattleFX?.cancel?.(state);
    } catch (error) {
      console.warn("runtime battle effect cleanup failed:",
        error.message, error.stack);
    }
  }

  function recoverState() {
    startActionBusy = false;
    unlockControls();
    if (!state) return;
    state.sortieStarting = false;
    state.testBattleStarting = false;
    recoverBattle();
    if (!["battleLoading", "dungeonConfirm"].includes(state.view)) return;
    const battleReady = Array.isArray(state.battle?.allies)
      && Array.isArray(state.battle?.enemies);
    if (state.view === "battleLoading" && !battleReady && state.explore?.pending) {
      const pending = state.explore.pending;
      try {
        window.DungeonSystem?.rollbackPending?.(state, pending);
        if (state.explore) state.explore.keepScroll = true;
      } catch (error) {
        console.warn("runtime dungeon rollback failed:",
          error.message, error.stack);
      }
    }
    if (!battleReady) state.battle = null;
    state.view = battleReady ? "battle" : state.explore ? "dungeon" : "hall";
    state.loadingBattleName = null;
    state.loadingBattleProgress = null;
  }

  return { attempt, hasBlockingBattlePrompt, recoverState };
})();
