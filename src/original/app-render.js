function render() {
  if (state.view === "battle" && window.BattleEffects?.renderFrozen) return;
  if (state.view === "battle" && window.BattleEffects?.draining) return renderViewOnly();
  renderViewOnly();
  if (state.view === "battle") window.BattleEffects?.drain?.(state, render);
}
window.render = render;
function renderViewOnly() {
  ensureRenderableView();
  const previousBattleLog = document.querySelector(".battle-log-list");
  const previousBattleTrail = document.querySelector(".public-cards");
  const previousBattleHand = document.querySelector(".active-hand");
  const previousBattlePicker = document.querySelector("[data-battle-picker-scroll]");
  const previousBattleTrailCount = previousBattleTrail?.children.length || 0;
  const previousBattleTrailKey = previousBattleTrail?.dataset.trailKey || "";
  const previousBattleHandCount = previousBattleHand?.children.length || 0;
  const previousBattleHandOwner = previousBattleHand?.dataset.handOwner || "";
  const previousBattlePickerKey = previousBattlePicker?.dataset.battlePickerScroll || "";
  const previousBattlePickerTop = previousBattlePicker?.scrollTop || 0;
  if (previousBattleLog) {
    battleLogScrollTop = previousBattleLog.scrollTop;
    battleLogFollowLatest = previousBattleLog.scrollTop < 24;
  }
  if (previousBattleTrail) {
    battleTrailScrollLeft = previousBattleTrail.scrollLeft;
    battleTrailFollowLatest = previousBattleTrail.scrollWidth - previousBattleTrail.clientWidth - previousBattleTrail.scrollLeft < 12;
  }
  if (state.view !== "battle" || state.battle?.victoryScreen) battleLogOpen = false;
  rememberPageScroll();
  rememberBattleHandScroll();
  $("main").classList.toggle("battle-mode", state.view === "battle" || state.view === "dungeon");
  $("view").classList.toggle("victory-mode", !!state.battle?.victoryScreen);
  $("view").classList.toggle("dungeon-view", state.view === "dungeon");
  document.body.classList.toggle("dungeon-mode", state.view === "dungeon");
  document.body.classList.toggle("battle-mode", state.view === "battle" || state.view === "battleLoading" || state.view === "dungeonConfirm");
  document.body.classList.toggle("start-mode", startOpen);
  let chromeChanged;
  if (startOpen) {
    const resourcesChanged = setHTML($("resources"), "");
    const statusChanged = setHTML($("save-status"), "");
    const navChanged = setHTML($("nav"), "");
    chromeChanged = resourcesChanged || statusChanged || navChanged;
  } else {
    const resourcesChanged = renderResources();
    const navChanged = renderNav();
    chromeChanged = resourcesChanged || navChanged;
  }
  if (state.view === "rest") state.view = "hall";
  if (state.view === "hall") { window.HallUnlockEvents?.triggerAll?.(); window.BountySystem?.ensure?.(state); window.GameAssets?.warmHall?.(state); }
  rememberDungeonScroll();
  const map = { hall: () => GameUI.hall(state), livingRoom: () => GameUI.livingRoom(state), nursery: AppRenderPages.nursery, furnace: AppRenderPages.furnace, dungeon: () => DungeonSystem.render(state), dungeonInventory: AppRenderPages.dungeonInventory, battle: () => GameUI.battle(state), battleLoading: AppRenderPages.battleLoading, dungeonConfirm: AppRenderPages.dungeonConfirm };
  const viewRoot = $("view");
  const skipMediaPreservation = state.view === "battle"
    && state.battle?._skipMediaPreservation;
  if (skipMediaPreservation) viewRoot.dataset.skipMediaPreservation = "1";
  const viewChanged = setHTML(viewRoot, startOpen ? AppRenderOverlays.startScreen() : (map[state.view] || map.hall)());
  if (skipMediaPreservation) delete viewRoot.dataset.skipMediaPreservation;
  const overlayChanged = AppRenderOverlays.globalOverlay(setHTML); if (state.view === "battle") { window.BattleFX?.syncBumps?.(); window.NonokaIdolSkinFX?.sync?.(state); window.MannyGunSkinFX?.sync?.(state); window.BertisQueenSkinFX?.sync?.(state); window.FloraSonicSkinFX?.sync?.(state); window.WendyTeacherSkinFX?.sync?.(state); window.ElranaFallenPhysicianSkinFX?.sync?.(state); window.AngelicaBerserkerSkinFX?.sync?.(state); window.CharacterSkinFX?.sync?.(state); } else window.BattleFX?.clearBumps?.();
  if (viewChanged || overlayChanged || chromeChanged) bindActions();
  else if (state.view === "battle") window.bindBattleActionButtons?.();
  updateBgmIfNeeded();
  if (state.view === "dungeon") scheduleDungeonFocus();
  else if (state.view === "battle") {
    const restoreBattleUiScroll = () => {
      fitBattleSpeechBubbles();
      const hand = document.querySelector(".active-hand");
      const drewDuringPlay = state.battle?.phase === 4 && previousBattleHandOwner && hand?.dataset.handOwner === previousBattleHandOwner && hand.children.length > previousBattleHandCount;
      restoreBattleHandScroll(drewDuringPlay);
      const trail = document.querySelector(".public-cards");
      const list = document.querySelector(".battle-log-list");
      const picker = document.querySelector("[data-battle-picker-scroll]");
      if (trail) {
        const changedTurn = trail.dataset.trailKey !== previousBattleTrailKey;
        const hasNewCard = trail.children.length > previousBattleTrailCount;
        restoreScrollInstant(trail, null, changedTurn || hasNewCard || battleTrailFollowLatest ? trail.scrollWidth : battleTrailScrollLeft);
      }
      if (list) restoreScrollInstant(list, battleLogFollowLatest ? 0 : battleLogScrollTop, null);
      if (picker?.dataset.battlePickerScroll === previousBattlePickerKey) {
        restoreScrollInstant(picker, previousBattlePickerTop, null);
      }
      return {
        hand, handLeft: hand?.scrollLeft,
        trail, trailLeft: trail?.scrollLeft,
        list, logTop: list?.scrollTop,
        picker, pickerTop: picker?.scrollTop,
      };
    };
    const restored = restoreBattleUiScroll();
    requestAnimationFrame(() => {
      const unchanged = (previousElement, currentElement, previousScroll, currentScroll) =>
        !!currentElement && previousElement === currentElement && Math.abs((currentScroll || 0) - (previousScroll || 0)) < 2;
      const hand = document.querySelector(".active-hand");
      const trail = document.querySelector(".public-cards");
      const list = document.querySelector(".battle-log-list");
      const picker = document.querySelector("[data-battle-picker-scroll]");
      fitBattleSpeechBubbles();
      if (unchanged(restored.hand, hand, restored.handLeft, hand?.scrollLeft)) restoreBattleHandScroll(state.battle?.phase === 4 && previousBattleHandOwner && hand?.dataset.handOwner === previousBattleHandOwner && hand.children.length > previousBattleHandCount);
      if (unchanged(restored.trail, trail, restored.trailLeft, trail?.scrollLeft)) {
        const changedTurn = trail.dataset.trailKey !== previousBattleTrailKey;
        const hasNewCard = trail.children.length > previousBattleTrailCount;
        restoreScrollInstant(trail, null, changedTurn || hasNewCard || battleTrailFollowLatest ? trail.scrollWidth : battleTrailScrollLeft);
      }
      if (unchanged(restored.list, list, restored.logTop, list?.scrollTop)) restoreScrollInstant(list, battleLogFollowLatest ? 0 : battleLogScrollTop, null);
      if (picker?.dataset.battlePickerScroll === previousBattlePickerKey
        && unchanged(restored.picker, picker, restored.pickerTop, picker?.scrollTop)) {
        restoreScrollInstant(picker, previousBattlePickerTop, null);
      }
    });
  }
  else { restorePageScroll(); requestAnimationFrame(restorePageScroll); setTimeout(restorePageScroll, 0); setTimeout(restorePageScroll, 80); }
}
