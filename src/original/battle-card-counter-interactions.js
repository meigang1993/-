window.BattleCardCounterInteractions = (deps, ctx, helpers) => {
  const { log } = helpers;
  function responseView(unit, card) {
    const witherer = window.WithererSkills?.responseCard?.(unit, card, "看破") || card;
    return window.GuardKellySkills?.responseCard?.(unit, witherer, "看破") || witherer;
  }

  function counterCandidates(units, actor, target, tactic) {
    if (!window.CardUtils.isCounterableTactic(tactic)) return [];
    const backflips = (
      window.SakuraRisaSkills?.backflipCandidates?.(units, actor, target, tactic)
      || []
    ).map(choice => ({ ...choice, responseKind: "backflip" }));
    const counters = units.flatMap(unit => unit.hp > 0
      ? unit.hand.filter(card => (card.counterTactic
        || window.WithererSkills?.canCounterTacticCard?.(unit, card)
        || window.GuardKellySkills?.canCounterTacticCard?.(unit, card))
        && !card._pendingDraw)
        .map(card => ({ unit, card, responseKind: "counter" }))
      : []);
    return [...backflips, ...counters];
  }

  function playCounter(state, picked, actor, target, card) {
    const { unit, card: responseCard } = picked;
    if (picked.responseKind === "backflip") {
      const cancelled = window.SakuraRisaSkills?.resolveBackflip?.(
        state, unit, actor, target, card, responseCard,
        { ...deps, useCard: ctx.useCard }
      ) ?? true;
      window.ElranaAceNanaliSkills?.afterResponse?.(
        state, unit, actor, { damage: ctx.damage });
      if (cancelled) return true;
      const nextTarget = state.battle.allies.concat(state.battle.enemies)
        .find(candidate =>
          card._targetUids?.includes(candidate.uid) && candidate.hp > 0);
      return counterTactic(state, actor, nextTarget, card);
    }
    const visualHandBefore = window.BattleCards.visibleHandCount(unit);
    unit.hand.splice(unit.hand.indexOf(responseCard), 1);
    window.BattleCards?.put(
      state.battle, unit, responseCard, "discard", { skipAnim: true });
    const response = responseView(unit, responseCard);
    window.BattleCards?.queueResponse?.(state.battle, unit, {
      type: "response",
      id: `ct${deps.nextAnim()}`,
      uid: unit.uid,
      side: unit.side,
      card: response,
    }, visualHandBefore);
    window.NonokaLokiSkills?.afterCardResponded?.(
      state, unit, actor, response, { ...deps, useCard: ctx.useCard });
    const mode = unit.side === "enemy" ? "自动" : "";
    log(state, `${unit.name} ${mode}使用看破，使${actor.name}的${card.name}失效。`);
    if (unit.ai === "guard_kelly") {
      window.BattleLines?.skill(state, unit, "突破重围", actor);
    }
    if (target?.uid === unit.uid) {
      window.ElranaAceNanaliSkills?.afterResponse?.(
        state, unit, actor, { damage: ctx.damage });
    }
    return true;
  }

  function counterTactic(state, actor, target, card) {
    if (!window.CardUtils.isCounterableTactic(card)) return false;
    const defenders =
      actor.side === "enemy" ? state.battle.allies : state.battle.enemies;
    const list = counterCandidates(defenders, actor, target, card);
    if (!list.length) return false;
    if (actor.side === "enemy" && state.settings?.manualResponse) {
      state.battle.manualCounter = {
        actorUid: actor.uid,
        targetUid: target?.uid,
        card: { ...card, _entitySourceCard: card._entitySourceCard || card },
        comboPartnerUid: state.battle.comboPartnerUid,
        selectedIndex: 0,
      };
      state.battle.locked = true;
      log(state, `${actor.name} 使用${card.name}，可以手动使用响应牌。`);
      return true;
    }
    return playCounter(state, list[0], actor, target, card);
  }

  function resolveClash(state, actor, target) {
    if (state.battle?.locked) return false;
    const result = window.BattlePileStats.clash(actor, target);
    const evt = {
      type: "clash",
      ...window.BattlePileStats.clashSnapshot(result),
      a: result.actorCard?.suit || "无",
      t: result.targetCard?.suit || "无",
      result: result.success ? "成功" : "抵抗",
      targetUid: result.success ? null : actor.uid,
      id: `cl${deps.nextAnim()}`,
      uid: actor.uid,
    };
    state.battle.lastClash = evt;
    state.battle.animQueue?.push(evt);
    log(state, `拼花对决：${evt.a} 对 ${evt.t}，${evt.result}。`);
    return result.success;
  }

  return { counterTactic, resolveClash };
};
