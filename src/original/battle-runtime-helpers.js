window.BattleRuntimeHelpers = () => {
  const unitCache = new WeakMap();
  const isKillCard = card => window.CardUtils?.isKillCard?.(card) || card?.type === "slash" || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  const intentMax = unit => Math.min(99, Math.max(1, (unit.stats?.bloodlust || 1) + (unit.intentMaxBonus || 0)));
  const tempAttack = unit => unit.stats.attack + (unit.tempAttack || 0);
  function allUnits(battle) {
    let units = unitCache.get(battle);
    if (!units) {
      units = battle.allies.concat(battle.enemies);
      unitCache.set(battle, units);
    }
    return units;
  }
  const initialDrawCount = unit => Math.max(0, 4 + (unit.stats.initialDraw || 0));
  const turnDrawCount = unit => Math.max(0, 2 + (unit.stats.drawPerTurn || 0));
  const visibleHand = unit => window.GuestCharacterSkills?.visibleHandCount?.(unit) ?? unit.hand.filter(card => !card._pendingDraw).length;
  const handLimit = unit => Math.max(0, unit.stats.handLimit || 0);
  const countsForLimit = (unit, card) => window.GuestCharacterSkills?.countsForLimit?.(unit, card) ?? true;
  const canDiscardCard = (unit, card) => !!(card && !card._pendingDraw && countsForLimit(unit, card) && window.UnderwaterTrainSkills?.canDiscard?.(unit, card));
  const discardableCount = unit => unit.hand.filter(card => canDiscardCard(unit, card)).length;
  const discardNeed = unit => Math.min(Math.max(0, visibleHand(unit) - handLimit(unit)), discardableCount(unit));
  const canDiscardAny = unit => discardableCount(unit) > 0;
  function revealPending(units) {
    units.forEach(unit => (unit.hand || []).forEach(card => { delete card._pendingDraw; }));
  }
  const turnEligible = unit => unit.hp > 0 || window.SakuraRisaSkills?.pendingRevival?.(unit);
  function order(battle) {
    return allUnits(battle).filter(turnEligible).sort((a, z) => z.stats.speed - a.stats.speed || (a.side === "ally" ? -1 : 1));
  }
  function resetRound(battle, advance = false) {
    battle.roundOrder = order(battle).map(unit => unit.uid);
    battle.roundIndex = 0;
    if (advance) battle.roundNo = (battle.roundNo || 1) + 1;
  }
  function nextRoundUnit(battle) {
    while (battle) {
      if (!order(battle).length) return null;
      if (!battle.roundOrder?.length || battle.roundIndex == null) resetRound(battle);
      while (battle.roundIndex < battle.roundOrder.length) {
        const uid = battle.roundOrder[battle.roundIndex++];
        const unit = allUnits(battle).find(item => item.uid === uid && turnEligible(item));
        if (unit) return unit;
      }
      resetRound(battle, true);
    }
    return null;
  }
  const active = battle => allUnits(battle).find(unit => unit.uid === battle.activeUid);
  function revealPlayed(battle, card, event = null) {
    if (!battle || !card) return;
    const actor = event?.uid && allUnits(battle).find(unit => unit.uid === event.uid);
    if (actor) {
      card._playedByName = actor.name;
      card._playedAction = card._skill || card.type === "tactic" ? "发动了" : "打出了";
      if (!card.skillName && card._skill && !card.virtual && !card.convertedFrom) card.skillName = card.name;
    }
    const trailId = card._cardResolutionId || card._cardAnimationId
      || event?.trailId || event?.id;
    if (trailId && !card._cardResolutionId) {
      card._cardResolutionId = trailId;
    }
    const snapshot = window.CardUtils?.clean?.(card, {
      _playedByName: card._playedByName,
      _playedAction: card._playedAction,
      ...(trailId ? { _cardAnimationId: trailId } : {}),
    }) || { ...card };
    battle.shownPlayed = [snapshot, ...(battle.shownPlayed || [])].slice(0, 5);
  }
  function hidePlayed(battle, card, event = null) {
    if (!battle?.shownPlayed) return;
    const trailId = card?._cardResolutionId || card?._cardAnimationId
      || event?.trailId || event?.id;
    const index = battle.shownPlayed.findIndex(entry => entry === card
      || trailId && (entry._cardResolutionId || entry._cardAnimationId) === trailId);
    if (index >= 0) battle.shownPlayed.splice(index, 1);
  }
  const shiftAnim = battle => battle?.animQueue?.shift();
  return {
    active, allUnits, canDiscardAny, canDiscardCard, discardNeed, handLimit,
    hidePlayed, initialDrawCount, intentMax, isKillCard, nextRoundUnit, order,
    revealPending, revealPlayed, shiftAnim, tempAttack, turnDrawCount, visibleHand,
  };
};
