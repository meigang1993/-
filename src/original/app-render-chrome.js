function renderResources() {
  const saveStatus = sessionOnly ? {} : GameStore.status?.() || {}, dirty = saveStatus.dirty, failure = saveStatus.storage === "local" ? "本地存档写入失败" : saveStatus.storage === "both" ? "本地与云存档写入失败" : "云存档同步失败";
  const pendingGold = Math.max(0, Number(state.explore?.earned?.gold) || 0);
  const pendingEssence = Math.max(0, Number(state.explore?.earned?.essence) || 0);
  const pending = value => value ? `<small class="resource-pending">待结算 +${value}</small>` : "";
  const recovery = saveStatus.recovery ? `<div class="save-warning"><span>${saveStatus.recovery === "cloud" ? "云端" : "本地"}主存档损坏，已使用有效副本。</span><button data-repair-main="1">修复副本</button></div>` : "";
  const slotPending = saveStatus.slotPending?.pending ? `<div class="save-warning"><span>存档 ${saveStatus.slotPending.id} 有副本待同步。</span><button data-retry-slot-save="1">修复同步</button></div>` : "";
  const settlementPending = window.DungeonRewards?.pendingCount?.(state) ? `<div class="save-warning"><span>部分附加结算尚未完成，奖励记录已保留。</span><button data-retry-settlement="1">重试结算</button></div>` : "";
  const dirtyWarning = dirty ? `<div class="save-warning"><span>${failure}，当前进度待保存。</span><button data-retry-save="1">重试存档</button></div>` : recovery;
  const sessionWarning = sessionOnly ? `<div class="save-warning"><span>临时试玩：本次进度不会保存，刷新后消失。</span></div>` : "";
  const warning = [sessionWarning, settlementPending, slotPending, dirtyWarning].filter(Boolean).join("");
  const resourcesChanged = setHTML($("resources"), `<div class="resource"><span><i class="res-icon gold"></i>据点余额</span><span class="resource-values"><b>${state.resources.gold}</b>${pending(pendingGold)}</span></div><div class="resource"><span><i class="res-icon essence"></i>精华宝珠</span><span class="resource-values"><b>${state.resources.essence}</b>${pending(pendingEssence)}</span></div><div class="resource"><span>饰品</span><b>${RelicSystem.normalizeNames(state.resources.relics).length}</b></div>`);
  const statusChanged = setHTML($("save-status"), warning);
  return resourcesChanged || statusChanged;
}
function renderNav() {
  const locked = state.sortieStarting || state.testBattleStarting || !!state.explore
    || state.view === "battleLoading" || state.view === "dungeonConfirm";
  return setHTML($("nav"), views.map(([id, name]) => {
    const active = state.view === id;
    return `<button data-view="${id}" class="${active ? "active" : ""}" ${active ? 'aria-current="page"' : ""} ${locked ? "disabled" : ""}>${name}</button>`;
  }).join(""));
}
function closeCreditsPanel() {
  return AppRenderOverlays.closeCredits(render);
}
function showBoot(message = "正在准备游戏资源…") {
  return AppRenderOverlays.showBoot(message);
}
