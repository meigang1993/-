window.SakuraRisaCombatSkills = ({
  isRisa, responseCount, foesOf, battleSettling, hasRelic, sameSide, pendingRevival,
}) => {
  function beforeKillTargeted(state, actor, target, card) {
    if (!isRisa(actor) || !target || !window.CardUtils?.isKillCard?.(card)) return;
    if ((card.sweep || card.targetless || card.allTargets || card.aoeLineShown) && !card._risaTargetedHit) return;
    const own = responseCount(actor), other = responseCount(target);
    if (own <= other) return;
    if (!card.ignoreResponse) card._tempIgnoreResponse = true;
    card.ignoreResponse = true;
    window.BattleLines?.skill(state, actor, "轻身飞翼", target);
    window.BattleLog.add(state, `${actor.name} 有${own}张响应牌，多于${target.name}的${other}张，轻身飞翼令此杀不可响应。`);
  }

  function afterResponse(state, actor, card, api = {}) {
    if (!state?.battle || !actor || !card) return;
    const draw = api.draw || window.BattleSystem?.draw;
    if (isRisa(actor) && actor.hp > 0) {
      const drawn = draw?.(actor, 1, state.battle);
      window.BattleLines?.skill(state, actor, "轻身飞翼");
      window.BattleLog.add(state, `${actor.name} 使用响应牌触发轻身飞翼，${window.BattleDrawFeedback.action(actor, 1, drawn)}。`);
    }
    if (actor.hp <= 0 || !hasRelic(state, actor, "血色刺伞")) return;
    const resolving = state.battle.risaUmbrellaResolvingUids ||= [];
    if (resolving.includes(actor.uid)) return;
    const useCard = api.useCard || window.BattleSystem?.useCard;
    if (!useCard || !foesOf(state.battle, actor).some(unit => unit.hp > 0)) return;
    resolving.push(actor.uid);
    try {
      const sweep = window.CardUtils.fromEntity("机枪扫杀", {
        _skipHandMove: true, skipAfterCardPlayed: true, skipMvpCardCount: true,
        bloodUmbrella: true, forceAutoResponse: true,
      });
      window.BattleLines?.skill(state, actor, "血色刺伞");
      window.BattleLog.add(state, `${actor.name} 的血色刺伞触发，视为使用一张虚拟机枪扫杀。`);
      const locked = state.battle.locked, manualDodge = state.battle.manualDodge;
      if (manualDodge) { state.battle.manualDodge = null; state.battle.locked = false; }
      try { useCard(state, actor, actor, sweep); }
      finally {
        if (state.battle && manualDodge && !battleSettling(state.battle)) {
          state.battle.manualDodge = manualDodge;
          state.battle.locked = locked;
        }
      }
    } finally {
      if (state.battle) {
        state.battle.risaUmbrellaResolvingUids =
          (state.battle.risaUmbrellaResolvingUids || []).filter(uid => uid !== actor.uid);
        if (!state.battle.risaUmbrellaResolvingUids.length) delete state.battle.risaUmbrellaResolvingUids;
      }
    }
  }

  function modifyRevengeDamage(state, actor, amount, card) {
    if (!card?.revengeKill || !state?.battle) return amount;
    const dead = sameSide(state.battle, actor)
      .filter(unit => unit.uid !== actor.uid && unit.hp <= 0 && !pendingRevival(unit)).length;
    if (!dead) return amount;
    const result = amount * Math.pow(2, dead);
    if (!card._revengeKillLogged) {
      window.BattleLog.add(state, `${actor.name} 的仇杀因${dead}名友方角色死亡，伤害变为${result}。`);
    }
    card._revengeKillLogged = true;
    return result;
  }

  function resolveBackflip(state, unit, actor, target, tactic, card, api = {}) {
    if (!card?.backflip || !unit?.hand?.includes(card)) return true;
    const visualHandBefore = window.BattleCards.visibleHandCount(unit);
    unit.hand.splice(unit.hand.indexOf(card), 1);
    window.BattleCards?.put(state.battle, unit, card, "discard", { skipAnim: true });
    window.BattleCards?.queueResponse?.(state.battle, unit, {
      type: "response", id: window.GameRandom.id("bf"),
      uid: unit.uid, side: unit.side, card,
    }, visualHandBefore);
    const drawn = (api.draw || window.BattleSystem?.draw)?.(unit, 2, state.battle);
    window.NonokaLokiSkills?.afterCardResponded?.(state, unit, actor, card, api);
    window.BattleLog.add(state, `${unit.name} 使用后空翻，令${actor.name}的${tactic.name}对自己无效，然后${window.BattleDrawFeedback.action(unit, 2, drawn)}。`);
    const targets = tactic._targetUids;
    if (!Array.isArray(targets) || targets.length <= 1) return true;
    tactic._targetUids = targets.filter(uid => uid !== unit.uid);
    return tactic._targetUids.length === 0;
  }

  function canBackflip(unit, actor, target, tactic, card) {
    return !!(unit && actor && target?.uid === unit.uid && target.side !== actor.side
      && tactic?.type === "tactic" && !tactic._skill && !tactic.targetless
      && card?.backflip && !card._pendingDraw);
  }

  function backflipCandidates(units, actor, target, tactic) {
    const ids = Array.isArray(tactic?._targetUids) ? tactic._targetUids : target ? [target.uid] : [];
    return (units || []).filter(unit => unit.hp > 0 && ids.includes(unit.uid))
      .flatMap(unit => unit.hand
        .filter(card => canBackflip(unit, actor, unit, tactic, card))
        .map(card => ({ unit, card })));
  }

  function aiMove(state, actor, team, foes, hand, canPlay, ctx) {
    if (!isRisa(actor)) return null;
    const slashes = hand.filter(card => window.CardUtils?.isKillCard?.(card) && canPlay(actor, card));
    const charge = hand.find(card => card.charge && canPlay(actor, card));
    if (charge && slashes.length) return { card: charge, target: actor };
    const target = ctx.slashTarget(actor, foes, slashes);
    const slash = target && ctx.topBy(slashes, card => ctx.slashScore(actor, card, target));
    return slash ? { card: slash, target } : null;
  }

  return {
    beforeKillTargeted, afterResponse, modifyRevengeDamage, canBackflip,
    backflipCandidates, resolveBackflip, aiMove,
  };
};
