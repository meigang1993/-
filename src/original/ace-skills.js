window.AceSkills = deps => {
  const { alive, visible, takeVisible, singleKill, line } = deps;

  function contribution(state, actor, target) {
    if (actor.usedAceContribution || !target || target.side !== actor.side
      || !visible(actor).length) return true;
    actor.usedAceContribution = true;
    const fromBefore = actor.hand.length;
    const toBefore = target.hand.length;
    const cards = takeVisible(actor);
    cards.forEach(card => {
      if (state.battle.animQueue) card._pendingDraw = true;
      target.hand.push(card);
    });
    window.BattleCards?.syncStatusCards?.(target);
    window.BattleCards?.afterHandLost?.(state.battle, actor);
    target.aceIntentBoost = (target.aceIntentBoost || 0) + 1;
    state.battle.animQueue?.push({
      type: "giveCards", fromUid: actor.uid, fromSide: actor.side,
      toUid: target.uid, toSide: target.side, count: cards.length,
      cards, fromBefore, toBefore,
    });
    line(state, actor, "贡献计划", target);
    window.BattleLog.add(state,
      `${actor.name} 发动贡献计划，将${cards.length}张手牌交给${target.name}，其下回合杀意上限+1。`);
    return true;
  }

  function beforeBeginTurn(state, unit) {
    if (!unit?.aceIntentBoost) return 0;
    const boost = unit.aceIntentBoost;
    unit.intentMaxBonus = (unit.intentMaxBonus || 0) + boost;
    unit.aceIntentBoost = 0;
    window.BattleLog.add(state,
      `${unit.name} 的贡献计划生效，本回合杀意上限+${boost}。`);
    return boost;
  }

  function beforeKillTargeted(state, actor, target, card, api) {
    if (target?.ref !== "ace" || actor?.side !== "enemy"
      || !singleKill(card) || visible(target).length) return;
    const count = Math.max(0, 2 + (target.stats?.drawPerTurn || 0));
    const turn = state.battle?.turn ?? 0;
    if (!count || target._urgentEscapeTurn === turn) return;
    target._urgentEscapeTurn = turn;
    line(state, target, "急逃");
    const drawn = api.draw?.(target, count, state.battle);
    window.BattleLog.add(state,
      `${target.name} 触发急逃，${window.BattleDrawFeedback.action(target, count, drawn)}。`);
  }

  function afterResponse(state, responder, source) {
    if (responder?.ref !== "ace" || source?.side !== "enemy"
      || !alive(responder)) return;
    const [picked] = takeVisible(source, 1);
    if (!picked) return;
    if (window.BattleStatusCards?.isStatus?.(picked)) {
      window.BattleCards?.put(state.battle, source, picked, "consumed",
        { forcedDiscard: true });
      line(state, responder, "勾爪陷阱", source);
      window.BattleLog.add(state,
        `${responder.name} 触发勾爪陷阱，移除并消耗${source.name}的${picked.name}状态牌。`);
      return;
    }
    if (state.battle.animQueue) picked._pendingDraw = true;
    responder.hand.push(picked);
    window.BattleCards?.syncStatusCards?.(responder);
    state.battle.animQueue?.push({
      type: "stealCard", fromUid: source.uid, fromSide: source.side,
      toUid: responder.uid, toSide: responder.side, count: 1, cards: [picked],
    });
    window.BattleCards?.afterHandLost?.(state.battle, source);
    line(state, responder, "勾爪陷阱", source);
    window.BattleLog.add(state,
      `${responder.name} 触发勾爪陷阱，获得${source.name}一张手牌。`);
  }

  return { afterResponse, beforeBeginTurn, beforeKillTargeted, contribution };
};
