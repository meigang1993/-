async function smeltRelic(index, skipRender = false, actionState = state) {
  const relic = actionState.resources.relics[index]; if (!relic) return;
  if (!RelicSystem.isFormalId(relic)) {
    log("未知饰品无法拆解，重新读档时会自动清理。");
    if (!skipRender) render();
    return false;
  }
  const operationId = window.ReceiptLedger.assign(actionState, "inventory", "_localInventoryLedger", "_localInventoryOperationCounter", "_localInventoryOperationIds");
  if (!operationId) { log("库存操作序号已达上限，无法继续拆解饰品。"); if (!skipRender) render(); return; }
  let settled = false;
  try {
    const ok = await window.ServerCore.call("smeltRelic", { index, relic, operationId }, actionState);
    if (ok.stale) return false;
    const replayed = !!ok.result?.core?.lastInventoryOperation?.replayed;
    settled = !!ok.changed || replayed;
    if (window.state !== actionState) return false;
    if (replayed) { if (!skipRender) render(); return true; }
    if (!ok.changed) { log(ok.message || "拆解未生效。"); if (!skipRender) render(); return; }
    const name = RelicSystem.data(relic)?.name;
    const owned = actionState.resources.relics
      .filter(r => RelicSystem.data(r)?.name === name).length;
    const used = Object.entries(actionState.equipment || {}).flatMap(([id, list]) =>
      (list || []).map((r, i) =>
        RelicSystem.data(r)?.name === name ? { id, i } : null).filter(Boolean));
    used.slice(owned).forEach(({ id, i }) => {
      const list = actionState.equipment[id];
      if (!Array.isArray(list)) return;
      list[i] = null;
      actionState.equipment[id] = RelicSystem.normalizeSlots(list);
    });
    log(`魂能熔炉拆解 ${relic}，获得${GameEconomy.relic.smeltGold}莉莉丝元。`);
    if (!skipRender) { const saved = await persist({ flush: true }); render(); return saved; }
    return true;
  } finally {
    if (!settled) window.ReceiptLedger.release(
      actionState, operationId, "inventory", "_localInventoryLedger", "_localInventoryOperationCounter",
    );
  }
}
function equipRelic(index, skipRender = false) {
  const relic = state.resources.relics[index];
  const target = state.chars.find(c => !c.locked && [0, 1].some(i => !state.equipment[c.id]?.[i] && RelicSystem.equip(state, c.id, relic, i)));
  if (!target) { log("没有可用饰品槽。"); if (!skipRender) render(); return; }
  log(`${relic} 已装备给 ${target.name}。`);
  if (!skipRender) { render(); persist(); }
}
