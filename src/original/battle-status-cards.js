window.BattleStatusCards = (() => {
  const registry = window.BattleStatusCardRegistry;
  const { create } = registry;
  const {
    add, consumeByCharm, consumeRemoved, endTurn,
  } = window.BattleStatusCardStorage;
  const {
    judgement, resolveResistance, triggerLandmine,
  } = window.BattleStatusCardTriggers;

  function apply(state, actor, target, sourceCard) {
    const status = create(sourceCard?.statusKey);
    if (!status || !target) return false;
    return add(state, target, status, `${actor.name} 使用${sourceCard.name}，`);
  }

  return {
    ...registry,
    add, apply, consumeByCharm, consumeRemoved, endTurn,
    judgement, resolveResistance, triggerLandmine,
  };
})();
