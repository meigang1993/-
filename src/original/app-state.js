let renderQueued = false;
let statusRenderQueued = false;
let renderBlocked = false;
let renderGeneration = 0;

function setRenderBlocked(blocked) {
  renderBlocked = !!blocked;
  if (!renderBlocked) return;
  renderGeneration += 1;
  renderQueued = false;
  statusRenderQueued = false;
}

function setView(view) {
  if (state.sortieStarting || state.testBattleStarting || state.explore
    || state.view === "battleLoading" || state.view === "dungeonConfirm") return;
  state.view = view;
  state.infoUnit = null;
  state.infoTab = "stats";
  battleLogOpen = false;
  render();
}
function scheduleRender() {
  if (renderBlocked || renderQueued) return;
  renderQueued = true;
  const generation = renderGeneration;
  requestAnimationFrame(() => {
    if (generation !== renderGeneration) return;
    renderQueued = false;
    if (!renderBlocked && state) render();
  });
}
function scheduleSaveStatusRender() {
  if (renderBlocked || renderQueued || statusRenderQueued) return;
  statusRenderQueued = true;
  const generation = renderGeneration;
  requestAnimationFrame(() => {
    if (generation !== renderGeneration) return;
    statusRenderQueued = false;
    if (renderBlocked || !state || renderQueued) return;
    if (startOpen || typeof renderResources !== "function") {
      render();
      return;
    }
    if (renderResources()) bindActions();
  });
}
window.addEventListener("game-store-status", () => {
  const dirty = !!window.GameStore?.status?.().dirty;
  if (dirty && !saveWarningShown) {
    window.dzmm?.toast?.warning?.("自动存档失败，当前进度待重试");
  }
  saveWarningShown = dirty;
  scheduleSaveStatusRender();
});
function log(text) {
  state.log.unshift(text);
  state.log = state.log.slice(0, 30);
}
function setState(nextState) {
  cancelPendingBattleCheckpoint();
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = null;
  window.BattleLines?.cancel?.(state);
  window.BattleEffects?.cancel?.(state);
  window.BattleFX?.cancel?.(state);
  window.BattleActionGuard?.reset?.();
  window.AppActionGuard?.reset?.();
  document.querySelectorAll('[data-locked="1"]').forEach(control => {
    delete control.dataset.locked;
    delete control.dataset.battleLockGeneration;
    delete control.dataset.busyText;
    control.style.pointerEvents = "";
    if (control.tagName === "BUTTON") control.disabled = false;
  });
  clearTimeout(state?.battle?.testRecoveryTimer);
  battleLogOpen = false;
  battleLogScrollTop = 0;
  battleLogFollowLatest = true;
  battleTrailScrollLeft = 0;
  battleTrailFollowLatest = true;
  state = nextState;
  window.BattleSaveCheckpoint?.adoptRestored?.(state, battleCheckpointMarkers);
}
