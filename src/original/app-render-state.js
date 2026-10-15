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
  const screenEl = document.querySelector(".battle-screen");
  if (!screenEl) return;
  const bubbles = Array.from(document.querySelectorAll(".unit-speech-bubble"));
  if (!bubbles.length) return;
  // 布局抖动：原实现按气泡逐个「写→读→写」（先清 --speech-shift-x，再读 rect），
  // 每次读取时布局已被上一次写入弄脏，N 个气泡就触发 N 次强制同步布局 ——
  // 实测占 render 自身耗时约 67%，是战斗偶发长帧的主要来源。
  // 改为「批量写 → 批量读 → 批量写」：整批只触发一次重排，结果等价。
  bubbles.forEach(bubble => bubble.style.setProperty("--speech-shift-x", "0px"));
  const screen = screenEl.getBoundingClientRect();
  const leftEdge = screen.left + 8, rightEdge = screen.right - 8;
  const rects = bubbles.map(bubble => bubble.getBoundingClientRect());
  rects.forEach((rect, i) => {
    const shift = rect.left < leftEdge ? leftEdge - rect.left : rect.right > rightEdge ? rightEdge - rect.right : 0;
    bubbles[i].style.setProperty("--speech-shift-x", `${Math.round(shift)}px`);
  });
}
