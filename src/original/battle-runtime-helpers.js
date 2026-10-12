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
    // 新手保护：首战让罗卡尔先行动。
    const lokar = window.Onboarding?.at?.(window.state, "battle")
      && battle.allies?.find(unit => unit.ref === "lokar");
    if (lokar) battle.roundOrder = [lokar.uid, ...battle.roundOrder.filter(uid => uid !== lokar.uid)];
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
      // 出牌区文案必须与战报同源，统一取 CardUtils.playVerb 的口径：
      // 技能→「发动了」，战术牌/实体牌→「使用了」。此前此处写死「打出了」，
      // 而 enemyPlay/virtualPlay 走的都是主动出牌，于是敌方出【杀】显示「打出了」、
      // 玩家出【杀】显示「使用了」，两侧不一致。
      // 仅当该牌已由响应链显式标注（如决斗打出的杀记为「打出了」）时沿用原值。
      card._playedAction = card._playedAction
        || window.CardUtils?.playVerb?.(card) || (card._skill ? "发动了" : "使用了");
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
