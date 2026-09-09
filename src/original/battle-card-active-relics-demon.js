window.BattleCardActiveRelicsDemon = (deps, ctx, core) => {
  const { log, alreadyUsed, markUsed, validRelicActor, livingOpponent } = core;

  function demonPoker(state, actor, target, card) {
    if (!validRelicActor(state, actor, "鬼王扑克")
      || !livingOpponent(state?.battle, actor, target)
      || typeof ctx.selectedHand !== "function"
      || typeof ctx.moveHand !== "function"
      || typeof ctx.useCard !== "function"
      || alreadyUsed(actor, "usedDemonPoker", card)) return false;
    const { i, card: selected, ok } = ctx.selectedHand(state, actor);
    if (!ok || selected.type === "tactic") {
      log(state, `${actor.name} 发动鬼王扑克失败：请选择一张非战术牌和一名敌方目标。`);
      return false;
    }
    const raffleCards = new Set(["魔法对决", "魔弹特攻"]);
    const pool = (window.GameData.eliteCards || []).filter(candidate =>
      candidate.type === "tactic" && raffleCards.has(candidate.name));
    const template = window.GameRandom.sample(pool, state) || { name: "魔法对决" };
    const converted = window.CardUtils.convertAs(template.name, selected, {
      type: "tactic", originalType: selected.type, convertedTactic: true,
      _skill: true, _relicSkill: true, _skipHandMove: true,
      _playedTargetUid: target.uid, _entitySourceCard: selected,
    });
    ctx.moveHand(state, actor, i, "discard", { showDiscard: true });
    markUsed(actor, "usedDemonPoker", card);
    log(state, `${actor.name} 发动鬼王扑克，将一张手牌转化为${template.name}使用。`);
    ctx.useCard(state, actor, target, converted);
    return true;
  }

  function exchangeSelectedCards(state, actor, card) {
    if (alreadyUsed(actor, "usedAilengBet", card)) return false;
    const indexes = [...new Set(card?._bagIndexes || state.battle.selectedBagIndexes || [])]
      .filter(index => actor.hand[index] && !actor.hand[index]._pendingDraw)
      .sort((a, b) => b - a);
    if (!indexes.length) {
      log(state, `${actor.name} 发动${card.name}失败：没有选择可弃置手牌。`);
      return false;
    }
    markUsed(actor, "usedAilengBet", card);
    const cards = indexes.map(index => actor.hand.splice(index, 1)[0]);
    ctx.putMany(state, actor, cards, "discard", { showDiscard: true });
    const drawn = deps.draw(actor, indexes.length, state.battle);
    log(state, `${actor.name} 发动${card.name}，弃置${indexes.length}张手牌并${window.BattleDrawFeedback.action(actor, indexes.length, drawn)}。`);
    return true;
  }

  return { demonPoker, exchangeSelectedCards };
};
