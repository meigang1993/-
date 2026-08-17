function completeClosableEventModal() {
  if (!state.hallModal
    && AppActionGuard?.isActive?.("unlock-event-completion")) return true;
  const actions = {
    littleElranaUnlock: window.completeLittleElranaUnlockEvent,
    aceUnlock: window.completeAceUnlockEvent,
    underwaterTrainUnlock: window.completeUnderwaterTrainUnlockEvent,
    opheliaUnlock: window.completeOpheliaUnlockEvent,
    bestaNurseryUnlock: window.completeBestaNurseryUnlockEvent,
    orcDungeonUnlock: window.completeOrcDungeonUnlockEvent,
    soniaNurseryUnlock: window.completeSoniaNurseryUnlockEvent,
    chiyoRecruitUnlock: window.completeChiyoRecruitUnlockEvent,
    gerdaNurseryUnlock: window.completeGerdaNurseryUnlockEvent,
    hoshinoFamilyUnlock: window.completeHoshinoFamilyUnlockEvent,
  };
  const action = actions[state.hallModal];
  if (action) {
    AppActionGuard.run("剧情完成失败", () => action(), {
      captureRun: false, key: "unlock-event-completion",
    });
    return true;
  }
  const hallEvents = new Set(["firstDefeat", "secondDefeat", "millerUnlock", "gerlotUnlock", "cadicisUnlock", "lukaUnlock"]);
  if (!hallEvents.has(state.hallModal)) return false;
  AppActionGuard.run("剧情完成失败", () =>
    window.HallUnlockEvents?.complete?.(state.hallModal), {
    captureRun: false, key: "unlock-event-completion",
  });
  return true;
}
function openInfoUnit(id) {
  if (!id) return;
  state.infoUnit = id;
  state.infoTab = "stats"; render();
}
function closeInfoUnit() {
  state.infoUnit = null; state.infoTab = "stats"; render();
}
function closeHallModal() {
  if (completeClosableEventModal()) return;
  state.hallModal = null;
  state.relicEquipChar = null;
  state.pendingRelicSlot = null;
  state.skinFilterChar = null;
  render();
}
let infoActionsDelegated = false;
function bindGlobalInfoActions() {
  if (infoActionsDelegated) return;
  infoActionsDelegated = true;
  document.addEventListener("click", e => {
    const target = e.target?.closest ? e.target : e.target?.parentElement;
    if (!target) return;
    const modalClose = target.closest("[data-close-modal]");
    if (modalClose) { e.preventDefault(); e.stopPropagation(); closeHallModal(); return; }
    const activeOpener = target.closest("[data-active-info]");
    if (activeOpener) { e.preventDefault(); e.stopPropagation(); openInfoUnit(activeOpener.dataset.activeInfo); return; }
    const tab = target.closest("[data-info-tab]");
    if (tab) { e.preventDefault(); e.stopPropagation(); state.infoTab = tab.dataset.infoTab; render(); return; }
    const skinBtn = target.closest("[data-battle-equip-skin]");
    if (skinBtn) { e.preventDefault(); e.stopPropagation(); equipBattleSkin(skinBtn); return; }
    const close = target.closest("[data-close-info]");
    if (close && (!close.classList.contains("info-overlay") || e.target === close)) {
      e.preventDefault(); e.stopPropagation(); closeInfoUnit();
    }
  }, true);
}
