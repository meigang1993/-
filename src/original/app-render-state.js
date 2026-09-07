let lastBgmRenderKey = "";
function bgmRenderKey() {
  const battle = state?.battle;
  return [startOpen ? "start" : "", state?.view || "", state?.settings?.musicVolume ?? 80, battle?.bgmOverride || "", battle?.battleBgm || "", battle?.introSfxPending ? 1 : 0, battle?.victoryScreen ? 1 : 0, battle?.testComplete ? 1 : 0].join("|");
}
function updateBgmIfNeeded() {
  const key = bgmRenderKey();
  if (key === lastBgmRenderKey) return;
  lastBgmRenderKey = key;
  window.GameBGM?.update(state);
}
function validDungeonRun(run) {
  return !!run && Array.isArray(run.layers) && run.layers.length > 0 && run.layers.some(layer => Array.isArray(layer) && layer.some(node => node?.id));
}
function ensureRenderableView() {
  if (state.view === "dungeonConfirm" && !state.sortieStarting) {
    state.view = state.explore ? "dungeon" : "hall";
    state.loadingBattleName = null; state.loadingBattleProgress = null;
    state.log = ["远征确认已中断，已恢复到可操作界面。", ...(state.log || [])].slice(0, 30);
  }
  if (!["dungeon", "dungeonInventory"].includes(state.view)
    || validDungeonRun(state.explore)) return;
  window.BattleFX?.leave?.(state);
  state.view = "hall"; state.explore = null; state.battle = null; state.loadingBattleName = null; state.loadingBattleProgress = null;
  state.log = ["副本数据异常，已返回据点，请重新出征。", ...(state.log || [])].slice(0, 30);
}
function fitBattleSpeechBubbles() {
  const screen = document.querySelector(".battle-screen")?.getBoundingClientRect();
  if (!screen) return;
  const leftEdge = screen.left + 8, rightEdge = screen.right - 8;
  document.querySelectorAll(".unit-speech-bubble").forEach(bubble => {
    bubble.style.setProperty("--speech-shift-x", "0px");
    const rect = bubble.getBoundingClientRect();
    const shift = rect.left < leftEdge ? leftEdge - rect.left : rect.right > rightEdge ? rightEdge - rect.right : 0;
    bubble.style.setProperty("--speech-shift-x", `${Math.round(shift)}px`);
  });
}
