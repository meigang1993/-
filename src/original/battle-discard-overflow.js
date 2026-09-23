window.BattleDiscardOverflow = ({ visibleHand, handLimit, draw, combat }) => {
  const countsForLimit = (unit, card) => window.GuestCharacterSkills?.countsForLimit?.(unit, card) ?? true;
  function discardOverflow(state, unit) { const b = state?.battle, cards = []; while (visibleHand(unit) > handLimit(unit)) { let i = unit.hand.length - 1; while (i >= 0 && (unit.hand[i]._pendingDraw || !countsForLimit(unit, unit.hand[i]) || !window.UnderwaterTrainSkills?.canDiscard?.(unit, unit.hand[i]))) i--; if (i < 0) break; cards.push(unit.hand.splice(i, 1)[0]); } const normal = cards.filter(c => !c.void), voids = cards.filter(c => c.void); window.BattleCards.putMany(b, unit, normal, "discard"); voids.forEach(card => window.BattleCards.put(b, unit, card, "consumed")); window.WendyCadicisSkills?.afterDiscard?.(state, unit, cards, { draw, pushFloat: combat.pushFloat }); }
  return { discardOverflow };
};
