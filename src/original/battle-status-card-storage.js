window.BattleStatusCardStorage = (() => {
  const {
    canReceive, isStatus, labelOf, sync,
  } = window.BattleStatusCardRegistry;

  function consumeByCharm(state, target, card) {
    if (!target || !isStatus(card)) return false;
    // 【盖亚妮丝护符】新版：状态牌对持有者无效（不入手牌、直接消耗）。
    // 保留 consumeByCharm 这个 API，供交牌链路与既有契约继续调用。
    return !!window.GaianisAmuletSkills?.nullifyStatus?.(state, target, card);
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
    expired.forEach(card => consumeRemoved(state, unit, card, false));
    // 冰冻标记由判定设置、本回合内持续生效；判定结算后状态牌已被消耗，
    // 不能再靠「手里还有 freeze」判断，否则 ban 杀效果会残留到下个回合。
    if (unit?.frozenSlash) unit.frozenSlash = false;
    if (expired.length) window.BattleLog.add(state,
      `${unit.name} 回合结束，消耗${expired.map(card => card.name).join("、")}。`);
  }

  return { consumeByCharm, add, consumeRemoved, endTurn };
})();
