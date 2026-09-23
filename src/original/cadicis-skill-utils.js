window.CadicisSkillUtils = (() => {
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const alive = unit => unit && unit.hp > 0;
  const isKill = card => card?.type === "slash"
    || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  const isSingleKill = card => isKill(card)
    && !card.sweep && !card.targetless && !card.allTargets && !card.aoeLineShown;
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? (unit.tempAttack || 0)
      : key === "magic" ? (unit.tempMagic || 0) : 0);
  const line = (state, unit, name, target) =>
    window.BattleLines?.skill(state, unit, name, target);
  const reveal = (state, title, cards) => state.battle.animQueue?.push({
    type: "revealCards", id: window.GameRandom.id("rv"), title,
    cards: cards.map(card => ({ ...card })),
  });

  return {
    visible, alive, isKill, isSingleKill, stat, line, reveal,
  };
})();
