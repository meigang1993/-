window.BattleAISkillHelpers = (() => {
  const {
    alive, stat, hpPct, visible, hearts, keepValue, topBy, singleKill,
  } = window.BattleAIHelpers;

  function magicBulletTarget(actor, foes, used = null) {
    const suits = new Set((actor.hand || [])
      .filter(card => card !== used && !card._pendingDraw && card.suit)
      .map(card => card.suit));
    const matchRate = unit => {
      const cards = window.CardUtils.magicBulletCards(unit);
      return cards.length
        ? cards.filter(card => suits.has(card.suit)).length / cards.length
        : 0;
    };
    const score = unit => matchRate(unit) * 100 - unit.hp;
    return topBy(
      alive(foes).filter(unit =>
        window.CardUtils.magicBulletCards(unit).length && matchRate(unit) > 0),
      score,
    );
  }

  function costCard(hand, used, valid = () => true) {
    return topBy(hand.filter(card => card !== used && valid(card)),
      card => -keepValue(card));
  }

  const otherAlly = (actor, team) => topBy(
    team.filter(unit => unit.uid !== actor.uid && unit.hp > 0),
    unit => hpPct(unit) < .6 ? 100 - unit.hp : stat(unit, "attack"),
  );
  const comboPartner = (actor, team) => topBy(
    team.filter(unit => unit.uid !== actor.uid && unit.hp > 0),
    unit => stat(unit, "attack") * 3 + (unit.intent || 0) + visible(unit),
  );
  const borrowPartner = (actor, team) => topBy(
    team.filter(unit => unit.uid !== actor.uid && unit.hp > 0
      && (unit.hand || []).some(card => !card._pendingDraw)),
    unit => (unit.hand.some(singleKill) ? 100 : 0)
      + stat(unit, "attack") + visible(unit),
  );

  function ailengChargeTarget(actor, team) {
    const hand = visible(actor);
    const heartCount = hearts(actor);
    return topBy(
      alive(team).filter(unit => unit.gender === "female"
        && (unit.ref === "besta"
          ? hand > 0 && actor.hp > stat(unit, "magic")
          : heartCount > 0)),
      unit => unit.ref === "besta"
        ? hand * 3 + stat(unit, "magic") - unit.hp / 2
        : heartCount * 8 - visible(unit),
    );
  }

  return {
    magicBulletTarget,
    costCard,
    otherAlly,
    comboPartner,
    borrowPartner,
    ailengChargeTarget,
  };
})();
