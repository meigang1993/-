window.BattleStatusCardStorage = (() => {
  const {
    canReceive, create, isStatus, keyOf, labelOf, sync,
  } = window.BattleStatusCardRegistry;

  function consumeByCharm(state, target, card) {
    if (!target || !isStatus(card)
      || !window.RelicSystem?.hasEquipped?.(state, target, "盖亚妮丝护符")) {
      return false;
    }
    window.BattleCards?.put(state.battle, target, card, "consumed");
    window.BattleLog.add(state,
      `${target.name} 的盖亚妮丝护符触发，立即消耗${card.name}状态牌。`);
    return true;
  }

  function add(state, target, card, source = "") {
    if (!target || !card) return false;
    if (!canReceive(target, card)) {
      window.BattleLog?.add?.(state,
        `${target.name} 已持有${labelOf(card)}，不能再次获得同类状态牌。`);
      return false;
    }
    if (consumeByCharm(state, target, card)) return true;
    if (state.battle?.animQueue) card._pendingDraw = true;
    target.hand.push(card);
    sync(target, state.battle);
    state.battle?.animQueue?.push({
      type: "gainCards", uid: target.uid, side: target.side,
      cards: [card], count: 1,
    });
    if (source) window.BattleLog?.add?.(state,
      `${source}令${target.name}获得一张${card.name}状态牌。`);
    return true;
  }

  function consumeRemoved(state, holder, card, forced = true) {
    if (!holder || !card) return false;
    const index = holder.hand.indexOf(card);
    if (index >= 0) holder.hand.splice(index, 1);
    window.BattleCards?.put(state.battle, holder, card, "consumed",
      forced ? { forcedDiscard: true } : {});
    sync(holder, state.battle);
    return true;
  }

  function endTurn(state, unit) {
    const expired = (unit?.hand || []).filter(card =>
      isStatus(card) && card.statusExpiresEndTurn);
    const hadFreeze = expired.some(card => keyOf(card) === "freeze");
    expired.forEach(card => consumeRemoved(state, unit, card, false));
    if (hadFreeze) unit.frozenSlash = false;
    if (expired.length) window.BattleLog.add(state,
      `${unit.name} 回合结束，消耗${expired.map(card => card.name).join("、")}。`);
  }

  return { consumeByCharm, add, consumeRemoved, endTurn };
})();
