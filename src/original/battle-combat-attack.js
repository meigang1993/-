window.BattleCombatAttack = api => {
  const values = window.BattleCombatAttackValues(api);
  return {
    ...window.BattleCombatAttackFlow(api, values),
    values,
    slashTargetAmount: values.slashTargetAmount,
  };
};
