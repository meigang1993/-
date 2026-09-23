window.OrcDungeonSkills = (() => {
  const alive = units => units.filter(unit => unit.hp > 0);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isSlash = card => window.CardUtils.isKillCard(card);
  const singleSlash = card => window.CardUtils.isSingleKill(card);
  const entitySingleSlash = card => window.CardUtils.isEntitySingleKill(card);
  const fullSlash = card => window.CardUtils.isGroupKillCard(card);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? (unit.tempAttack || 0) : key === "magic" ? (unit.tempMagic || 0) : 0);
  function cardValue(card) {
    return (card.name === "闪" ? 20 : 0) + (isSlash(card) ? 12 : 0)
      + (card.counterTactic ? 14 : 0) + (card.heal || card.healPct || card.teamHealPct ? 10 : 0)
      + (card.type === "tactic" ? 6 : 1);
  }
  function lowValueIndex(unit, suit = null) {
    const scored = unit.hand.map((card, index) => ({ card, index }))
      .filter(item => !item.card._pendingDraw && (!suit || item.card.suit === suit));
    scored.sort((left, right) => cardValue(left.card) - cardValue(right.card));
    return scored[0]?.index ?? -1;
  }
  const drone = window.OrcDroneSkills({ alive, visible, lowValueIndex, stat });
  const combat = window.OrcCombatSkills({
    alive, visible, isSlash, singleSlash, entitySingleSlash, fullSlash,
  });
  return { ...drone, ...combat };
})();
