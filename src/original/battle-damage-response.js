window.BattleDamageResponses = ({
  deps, ctx, canDodge, damage, hitWithoutDodge, finalizeDamage, triggers,
}) => {
  const settleAssault = (state, card) =>
    window.FloraCarlosSkills?.queueSpeedAssaultSettlement?.(state, card);
  const hammer = window.BattleThunderHammerResponse({
    deps, ctx, damage, triggers, settleAssault,
  });
  const dodge = window.BattleDodgeResponse({
    deps, ctx, canDodge, damage, hitWithoutDodge, finalizeDamage, triggers,
    hammer, settleAssault,
  });
  return {
    ...dodge,
    resolveThunderHammer: hammer.resolve,
    cancelThunderHammer: hammer.cancel,
  };
};
