window.BattleCardHandInteractions = (ctx, helpers) => {
  const { log, reveal, visible } = helpers;

  function openHandReveal(state, actor, target, card, mode) {
    const cards = ["magicBullet", "magicBulletReveal"].includes(mode)
      ? window.CardUtils.magicBulletCards(target) : visible(target);
    if (!cards.length) {
      log(state, `${actor.name} 使用${card.name}，但${target.name}没有可选择手牌。`);
      return mode === "magicBullet" || mode === "magicBulletReveal"
        ? false : undefined;
    }
    const prompt = {
      actorUid: actor.uid,
      targetUid: target.uid,
      cardName: card.name,
      card: { ...card, _entitySourceCard: card._entitySourceCard || card },
      mode,
      repeatAfter: true,
    };
    if (mode === "magicBullet") {
      const shown = window.GameRandom.sample(cards, state);
      const costs = visible(actor).map((candidate, index) =>
        candidate.suit === shown.suit ? index : -1).filter(index => index >= 0);
      reveal(state, "魔弹特攻", [shown]);
      if (!costs.length) {
        log(state, `${actor.name} 使用魔弹特攻，${target.name}随机展示${shown.suit}${shown.name}，但${actor.name}没有同花色牌可弃置，魔弹特攻无效。`);
        return false;
      }
      Object.assign(prompt, {
        shownCard: { ...shown },
        shownSuit: shown.suit,
        validIndexes: costs,
      });
    }
    state.battle.handReveal = prompt;
    state.battle.locked = true;
    return true;
  }

  function discardTarget(state, actor, target, card) {
    if (actor.side === "ally" && card.discardTarget && !card.assassinate) {
      return !!openHandReveal(state, actor, target, card, "discard");
    }
    const statusIndex = target.hand.findIndex(candidate =>
      !candidate._pendingDraw && window.BattleStatusCards?.isStatus?.(candidate));
    const index = statusIndex >= 0 ? statusIndex
      : target.hand.findIndex(candidate => !candidate._pendingDraw);
    if (index < 0) {
      log(state, `${actor.name} 使用${card.name}，但${target.name}没有可弃置手牌。`);
      return false;
    }
    const [discarded] = target.hand.splice(index, 1);
    const status = window.BattleStatusCards?.isStatus?.(discarded);
    ctx.putCard(state, target, discarded, status ? "consumed" : "discard",
      { forcedDiscard: true });
    log(state, `${actor.name} 使用${card.name}，${status ? "移除并消耗" : "弃置"}${target.name}一张${discarded.name}。`);
    return true;
  }

  function stealCard(state, actor, target, card) {
    if (actor.side === "ally") {
      return !!openHandReveal(state, actor, target, card, "steal");
    }
    const statusIndex = target.hand.findIndex(candidate =>
      !candidate._pendingDraw && window.BattleStatusCards?.isStatus?.(candidate));
    const index = statusIndex >= 0 ? statusIndex
      : target.hand.findIndex(candidate => !candidate._pendingDraw);
    if (index < 0) {
      log(state, `${actor.name} 使用${card.name}，但${target.name}没有可偷取手牌。`);
      return false;
    }
    const [stolen] = target.hand.splice(index, 1);
    if (window.BattleStatusCards?.isStatus?.(stolen)) {
      ctx.putCard(state, target, stolen, "consumed", { forcedDiscard: true });
      log(state,
        `${actor.name} 使用${card.name}，偷走并消耗${target.name}的${stolen.name}状态牌。`);
      return true;
    }
    stolen.stolenFromUid = target.uid;
    if (state.battle.animQueue) stolen._pendingDraw = true;
    actor.hand.push(stolen);
    window.BattleCards?.syncStatusCards?.(actor);
    state.battle.animQueue?.push({
      type: "stealCard",
      fromUid: target.uid,
      fromSide: target.side,
      toUid: actor.uid,
      toSide: actor.side,
      count: 1,
      cards: [stolen],
    });
    window.BattleCards?.afterHandLost?.(state.battle, target);
    log(state, `${actor.name} 使用${card.name}，暂时获得${target.name}一张${stolen.name}。`);
    return true;
  }

  return { openHandReveal, discardTarget, stealCard };
};
