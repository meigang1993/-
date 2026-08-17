window.BakarRelicSkills = (() => {
  const standardSuits = new Set(["♥", "♦", "♠", "♣"]);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isSlash = card => window.CardUtils?.isKillCard?.(card) || card?.type === "slash";
  const battleHas = (battle, unit) => !!unit
    && !!battle && (battle.allies?.includes(unit) || battle.enemies?.includes(unit));

  function isDamageCard(card) {
    return isSlash(card) || !!(card?.demonInvasion || card?.magicBullet || card?.duel || card?.magicDuel || card?.reckless);
  }

  function modifyOutgoingDamage(state, actor, amount, card, sourceActor = actor) {
    const ownsDamage = (sourceActor === actor || sourceActor?.uid === actor?.uid)
      && (!card?.duelUserUid || card.duelUserUid === actor?.uid);
    if (!ownsDamage || actor?.hp <= 0
      || actor.hp / Math.max(1, actor.maxHp || actor.stats?.maxHp || 1) > .3
      || !isDamageCard(card)
      || !window.RelicSystem?.hasEquipped?.(state, actor, "女勇者鲁妮的戒指")) return amount;
    window.BattleLog.add(state, `${actor.name} 的女勇者鲁妮的戒指触发，伤害翻倍。`);
    return amount * 2;
  }

  function armyOrderIndexes(unit) {
    const groups = {};
    visible(unit).forEach(card => {
      if (standardSuits.has(card.suit)) (groups[card.suit] ||= []).push(card);
    });
    const pair = Object.values(groups).find(cards => cards.length >= 2);
    return pair ? pair.slice(0, 2).map(card => unit.hand.indexOf(card)) : [];
  }

  function validArmyOrder(unit, indexes) {
    const cards = [...new Set(indexes || [])]
      .map(index => unit.hand[index])
      .filter(card => card && !card._pendingDraw);
    return cards.length === 2 && standardSuits.has(cards[0].suit) && cards[0].suit === cards[1].suit;
  }

  const armyOrderIndexesFor = (state, card) => [...new Set(
    card?._bagIndexes || state?.battle?.selectedBagIndexes || [],
  )].sort((a, b) => b - a);

  function canUseArmyOrder(state, actor, card, useCard) {
    if (actor?.hp <= 0 || !battleHas(state?.battle, actor)
      || !window.RelicSystem?.hasEquipped?.(state, actor, "军令状")
      || typeof useCard !== "function") return false;
    return validArmyOrder(actor, armyOrderIndexesFor(state, card));
  }

  function useArmyOrder(state, actor, card, useCard) {
    if (!canUseArmyOrder(state, actor, card, useCard)) return false;
    const indexes = armyOrderIndexesFor(state, card);
    const costs = indexes.map(index => actor.hand.splice(index, 1)[0]);
    window.BattleCards?.putMany?.(state.battle, actor, costs, "discard");
    card.skipAfterCardPlayed = true;
    card.skipMvpCardCount = true;
    const invasion = window.CardUtils.cloneEntity("魔王军入侵", {
      suit: costs[0].suit,
      virtual: true, _skill: true, _relicSkill: true, _skipHandMove: true,
      sourceName: "军令状", generatedBySkill: "军令状",
      skillName: "军令状", bakarTalentSkip: true,
    });
    window.BattleLog.add(state, `${actor.name} 使用军令状，将${costs.map(cost => `${cost.suit}${cost.name}`).join("、")}当【魔王军入侵】使用。`);
    useCard(state, actor, actor, invasion);
    return true;
  }

  return { modifyOutgoingDamage, armyOrderIndexes, validArmyOrder, canUseArmyOrder, useArmyOrder };
})();
