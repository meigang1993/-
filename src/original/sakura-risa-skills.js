window.SakuraRisaSkills = (() => {
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isRisa = unit =>
    unit?.id === "assassin_sakura_risa" || unit?.ai === "assassin_sakura_risa";
  const hasRelic = (state, unit, name) =>
    window.RelicSystem?.hasEquipped?.(state, unit, name);
  const sameSide = (battle, unit) =>
    unit?.side === "enemy" ? battle.enemies : battle.allies;
  const foesOf = (battle, unit) =>
    unit?.side === "enemy" ? battle.allies : battle.enemies;
  const responseCount = unit =>
    visible(unit).filter(card => card.type === "response").length;
  const pendingRevival = unit => !!unit?.risaRevivePending;
  const aliveForBattle = unit => !!unit && (unit.hp > 0 || pendingRevival(unit));
  const battleSettling = battle => !!(battle?.pendingVictory || battle?.pendingDefeat
    || battle?.victoryScreen || battle?.defeat || battle?.testComplete);
  const shared = {
    isRisa, responseCount, pendingRevival, aliveForBattle, hasRelic,
    sameSide, foesOf, battleSettling,
  };

  return {
    isRisa, responseCount, pendingRevival, aliveForBattle,
    ...window.SakuraRisaCombatSkills(shared),
    ...window.SakuraRisaLifecycleSkills(shared),
  };
})();
