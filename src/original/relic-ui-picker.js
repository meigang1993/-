window.RelicUIPicker = (() => {
  const U = window.UICommon;
  const equipmentOf = (state, id) => RelicSystem.normalizeSlots(
    (state.hallModal === "testBattle"
      ? state.testEquipment : state.equipment)?.[id]);
  const validSlot = slot => slot === 0 || slot === 1;
  function poolItem(state, name) {
    const ownerId = RelicSystem.equippedBy(state, name);
    const owner = ownerId
      ? state.chars.find(character => character.id === ownerId)?.name : "";
    const count = RelicSystem.availableCount(state, name);
    return `<button type="button" class="relic-item ${owner ? "used" : ""}" data-popup-relic-item="${U.esc(name)}">${U.relicLabel(name)}<em>${owner ? `使用中：${U.esc(owner)}${count ? ` / 库存×${count}` : ""}` : `库存×${count}`}</em></button>`;
  }
  function picker(state, requestedId = null) {
    const id = requestedId || state.relicEquipChar;
    if (!id || requestedId && state.relicEquipChar !== requestedId) return "";
    const character = state.chars.find(item => item.id === id);
    if (!character) return "";
    const equipment = equipmentOf(state, id);
    const slotIndex = validSlot(state.pendingRelicSlot)
      ? state.pendingRelicSlot : 0;
    const rawPool = state.hallModal === "testBattle"
      ? [...(state.resources?.relics || []), ...(state.testRelics || [])]
      : (state.resources?.relics || []);
    const pool = [...new Set(RelicSystem.normalizeNames(rawPool))];
    const items = pool.map(name => poolItem(state, name)).join("")
      || `<span class="muted">暂无可用饰品</span>`;
    const slot = index => `<button type="button" class="relic-slot ${equipment[index] ? "equipped" : "empty"} ${slotIndex === index ? "selected" : ""}" data-relic-popup-slot="${index}">${equipment[index] ? `${U.relicLabel(equipment[index])}<em>点击卸下</em>` : `<b>＋</b><span>${index + 1}号空槽</span>`}</button>`;
    return `<div class="relic-inline-picker"><div class="relic-inline-picker-card"><button type="button" class="info-close" data-close-relic-equip="1">×</button><h3>${U.esc(character.name)} · 饰品换装</h3><p class="muted">选择槽位后，从下方饰品列表装备；点击已装备槽位可直接卸下。</p><div class="relic-slots">${slot(0)}${slot(1)}</div><h4>饰品列表</h4><div class="relic-picker-grid">${items}</div></div></div>`;
  }
  return { picker };
})();
