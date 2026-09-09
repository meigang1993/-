window.BattleCardActiveRelics = (deps, ctx) => {
  const core = window.BattleCardActiveRelicsCore(deps, ctx);
  const demon = window.BattleCardActiveRelicsDemon(deps, ctx, core);
  const assassin = window.BattleCardActiveRelicsAssassin(deps, ctx, core);
  const arsenal = window.BattleCardActiveRelicsArsenal(deps, ctx, core);
  return {
    demonPoker: demon.demonPoker,
    exchangeSelectedCards: demon.exchangeSelectedCards,
    succubusFork: assassin.succubusFork,
    assassinLatex: assassin.assassinLatex,
    arsenal: arsenal.arsenal,
  };
};
