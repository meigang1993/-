window.BattleCombatResolver = api => {
  const effects = window.BattleCombatCardEffects(api);
  const attack = window.BattleCombatAttack(api);

  function continueAfterCounter(state, actor, target, card) {
    if (!state.battle || state.battle.locked || !actor || !card) return;
    if (!api.deps.isKillCard(card)) {
      window.EdisSkills?.copyEarlySingleTarget?.(state, actor, target, card);
    }
    if (effects.resolve(state, actor, target, card)) return;
    attack.resolve(state, actor, target, card);
  }

  return {
    continueAfterCounter,
    attackValues: attack.values,
    slashTargetAmount: attack.slashTargetAmount,
  };
};
