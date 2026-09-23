window.BattleCardInteractions = (deps, ctx, helpers) => {
  return {
    ...window.BattleCardHandInteractions(ctx, helpers),
    ...window.BattleCardCounterInteractions(deps, ctx, helpers),
  };
};
