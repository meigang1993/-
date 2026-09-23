let dungeonFocusKey = "", dungeonScrollTop = 0, pageScrollKey = "", pageScrollTop = 0, battleHandScrollLeft = 0, scrollSnapshot = [], scrollLocked = false, scrollLockKey = "", scrollUnlockTimer = null;

function rememberDungeonScroll(force = false) {
  const map = document.querySelector(".tower-map");
  if (!map || !state?.explore) return;
  if (!force && (state.explore.rewardPopup || state.explore.keepScroll)) return;
  dungeonScrollTop = map.scrollTop;
  state.explore.mapScrollTop = dungeonScrollTop;
}
function scrollSelectors() { return ".content-panel,.villa-hall .villa-actions,.villa-page-scroll,.codex-scroll,.modal-card,.info-popup,.tower-map,.battle-log,.battle-log-list,.hand-scroll-wrap .hand,.vn-lines,.test-pick-list,.settings-menu,.save-panel,.credits-panel"; }
function currentScrollLockKey() { return `${state?.view || ""}:${state?.hallModal || ""}:${state?.succubusCodex ? "codex" : ""}:${state?.battle?.phase || ""}`; }
function rememberAllScroll() {
  scrollSnapshot = [...document.querySelectorAll(scrollSelectors())].map((el, i) => [i, el.scrollTop, el.scrollLeft]);
}
function restoreAllScroll() {
  if (scrollLocked && scrollLockKey && scrollLockKey !== currentScrollLockKey()) return;
  const map = new Map(scrollSnapshot.map(([i, top, left]) => [i, [top, left]]));
  [...document.querySelectorAll(scrollSelectors())].forEach((el, i) => {
    const item = map.get(i);
    if (item) restoreScrollInstant(el, item[0], item[1]);
  });
}
function restoreScrollInstant(el, top, left) {
  if (!el) return;
  const previous = el.style.scrollBehavior;
  el.style.scrollBehavior = "auto";
  if (top != null) el.scrollTop = top;
  if (left != null) el.scrollLeft = left;
  void el.offsetHeight;
  if (previous) el.style.scrollBehavior = previous;
  else el.style.removeProperty("scroll-behavior");
}
window.restoreScrollInstant = restoreScrollInstant;
function preserveNextScroll(duration = 220) {
  rememberAllScroll(); rememberBattleHandScroll(); scrollLocked = true; scrollLockKey = currentScrollLockKey();
  clearTimeout(scrollUnlockTimer);
  scrollUnlockTimer = setTimeout(releaseScrollLock, duration);
}
window.preserveNextScroll = preserveNextScroll;
function releaseScrollLock() {
  if (scrollUnlockTimer) clearTimeout(scrollUnlockTimer);
  scrollLocked = false; scrollLockKey = ""; scrollUnlockTimer = null;
}
window.releaseScrollLock = releaseScrollLock;
function rememberPageScroll() {
  if (!scrollLocked) rememberAllScroll();
  const scroller = document.querySelector(".villa-page-scroll") || document.querySelector(".codex-scroll") || document.querySelector(".content-panel:not(.dungeon-view):not(.victory-mode)");
  if (!scroller || state?.view === "battle" || state?.view === "dungeon") return;
  if (scrollLocked) return;
  pageScrollKey = `${state.view}:${state.hallModal || ""}:${state.view === "livingRoom" ? "" : state.infoUnit || ""}:${state.succubusCodex ? "codex" : ""}`;
  pageScrollTop = scroller.scrollTop;
}
function rememberBattleHandScroll() {
  const hand = document.querySelector(".hand-scroll-wrap .hand");
  if (state?.view === "battle" && hand) battleHandScrollLeft = hand.scrollLeft;
}
function restoreBattleHandScroll(followLatest = false) {
  if (state?.view !== "battle") return;
  const hand = document.querySelector(".hand-scroll-wrap .hand");
  if (hand) restoreScrollInstant(hand, null, followLatest ? hand.scrollWidth : battleHandScrollLeft);
}
function restorePageScroll() {
  const key = `${state.view}:${state.hallModal || ""}:${state.view === "livingRoom" ? "" : state.infoUnit || ""}:${state.succubusCodex ? "codex" : ""}`;
  if (scrollLocked) {
    restoreAllScroll();
    return;
  }
  if (key !== pageScrollKey) return;
  const scroller = document.querySelector(".villa-page-scroll") || document.querySelector(".codex-scroll") || document.querySelector(".content-panel:not(.dungeon-view):not(.victory-mode)");
  if (scroller) restoreScrollInstant(scroller, pageScrollTop, null);
  restoreAllScroll();
}
function focusDungeonStart() {
  const map = document.querySelector(".tower-map"), current = document.querySelector(".map-node.current"); if (!map || !current) return;
  const openNodes = [...document.querySelectorAll(".map-node.open")];
  if (state.explore?.rewardPopup || state.explore?.keepScroll) { restoreScrollInstant(map, state.explore.mapScrollTop ?? dungeonScrollTop, null); return; }
  const shouldAdvanceFocus = (current.classList.contains("done") || map.clientHeight < 160) && openNodes.length;
  const focus = shouldAdvanceFocus ? openNodes[Math.floor((openNodes.length - 1) / 2)] : current;
  const openKey = openNodes.map(n => n.dataset.dungeonNode).join(",");
  const key = `${state.explore?.focusId || state.explore?.missionId || ""}:${state.explore?.current || ""}:${state.explore?.pending || ""}:${openKey}`;
  if (dungeonFocusKey === key) { restoreScrollInstant(map, dungeonScrollTop, null); return; }
  dungeonFocusKey = key;
  const focusRatio = map.clientHeight < 160 ? .5 : .62;
  const focusTop = focus.getBoundingClientRect().top - map.getBoundingClientRect().top + map.scrollTop;
  dungeonScrollTop = Math.max(0, focusTop - map.clientHeight * focusRatio + focus.clientHeight / 2);
  restoreScrollInstant(map, dungeonScrollTop, null);
}
function scheduleDungeonFocus() {
  const screen = document.querySelector(".dungeon-screen");
  focusDungeonStart();
  if (!screen || screen.classList.contains("no-enter-anim")) return;
  const onEnd = event => {
    if (event.target !== screen) return;
    screen.removeEventListener("animationend", onEnd);
    focusDungeonStart();
  };
  screen.addEventListener("animationend", onEnd);
}
