window.ElranaAceNanaliSkills = (() => {
  const alive = unit => unit && unit.hp > 0;
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const red = card => card?.suit === "♥" || card?.suit === "♦";
  const takeVisible = (unit, limit = Infinity) => {
    const output = [];
    unit.hand = (unit.hand || []).filter(card =>
      !card._pendingDraw && output.length < limit ? (output.push(card), false) : true);
    return output;
  };
  const singleKill = card => window.CardUtils.isSingleKill(card);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? (unit.tempAttack || 0) : key === "magic" ? (unit.tempMagic || 0) : 0);
  const line = (state, unit, name, target) =>
    window.BattleLines?.skill(state, unit, name, target);
  const healing = window.ElranaHealingSkills({ alive, visible, red, stat, line });
  const combat = window.AceNanaliSkills({
    alive, visible, takeVisible, singleKill, stat, line,
  });
  function handleSpecialCard(state, actor, target, card, api, ctx) {
    if (card.elranaHeal) return healing.elranaHeal(state, actor, target, api, ctx);
    if (card.aceContribution) return combat.aceContribution(state, actor, target);
    return false;
  }
  function endTurn(state, unit, api) {
    healing.endTurn(state, unit, api);
    combat.endTurn(state, unit, api);
  }
  return {
    handleSpecialCard,
    afterHeal: healing.afterHeal,
    beforeBeginTurn: combat.beforeBeginTurn,
    beforeKillTargeted: combat.beforeKillTargeted,
    afterResponse: combat.afterResponse,
    modifySlashDamage: combat.modifySlashDamage,
    afterDamage: combat.afterDamage,
    resolveRevenge: combat.resolveRevenge,
    endTurn,
  };
})();
