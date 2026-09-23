window.BattleEffectCards = (U) => {
  return {
    ...window.BattleEffectCardTransfers(U),
    ...window.BattleEffectCardPlays(U),
  };
};
