window.BattleThunderHammerResponse = ({
  deps, ctx, damage, triggers, settleAssault,
}) => {
  function queue(state, actor, target, amount, source, card) {
    const battle = state.battle;
    const settling = battle?.pendingVictory || battle?.pendingDefeat
      || battle?.victoryScreen || battle?.defeat || battle?.testComplete;
    if (!battle || actor?.hp <= 0 || target?.hp <= 0 || settling) return false;
    const hand = actor.hand.filter(item => !item._pendingDraw);
    if (!deps.isKillCard(card) || card.virtual || card._skill
      || !card._entitySourceCard && card._skipHandMove || !hand.length
      || !window.RelicSystem?.hasEquipped?.(
        state, actor, "霹雳之锤")) return false;
    if (actor.side !== "ally") {
      const discard = hand.sort((left, right) => (
        (deps.isKillCard(left) ? 2 : 0) + (left.name === "闪" ? 3 : 0)
        + (left.type === "tactic" ? 1 : 0)
      ) - (
        (deps.isKillCard(right) ? 2 : 0) + (right.name === "闪" ? 3 : 0)
        + (right.type === "tactic" ? 1 : 0)
      ))[0];
      actor.hand.splice(actor.hand.indexOf(discard), 1);
      window.BattleCards?.put(
        state.battle, actor, discard, "discard", { showDiscard: true });
      window.BattleLog.add(state,
        `${actor.name} 弃置${discard.suit || ""}${discard.name}发动霹雳之锤，该杀强制造成伤害。`);
      damage(state, target, amount, source, actor, {
        ...card,
        ignoreResponse: true,
        _entitySourceCard: card._entitySourceCard || card,
      });
      return false;
    }
    battle.thunderHammer = {
      actorUid: actor.uid,
      targetUid: target.uid,
      amount,
      source,
      card: {
        ...card,
        ignoreResponse: true,
        _entitySourceCard: card._entitySourceCard || card,
      },
      used: false,
    };
    battle.locked = true;
    ctx.clearSelection(battle);
    window.BattleLog.add(state,
      `${actor.name} 的霹雳之锤可发动：选择一张手牌弃置，令该杀强制造成伤害。`);
    return true;
  }
  function resolve(state, cardIndex) {
    const battle = state.battle;
    const hammer = battle?.thunderHammer;
    const actor = hammer
      && ctx.allUnits(battle).find(unit => unit.uid === hammer.actorUid);
    const target = hammer
      && ctx.allUnits(battle).find(unit => unit.uid === hammer.targetUid);
    const discard = actor?.hand[cardIndex];
    if (!hammer || hammer.used || !actor || !target
      || !discard || discard._pendingDraw) return false;
    actor.hand.splice(cardIndex, 1);
    window.BattleCards?.put(
      battle, actor, discard, "discard", { showDiscard: true });
    hammer.used = true;
    battle.thunderHammer = null;
    battle.locked = false;
    window.BattleLog.add(state,
      `${actor.name} 弃置${discard.suit || ""}${discard.name}发动霹雳之锤，该杀强制造成伤害。`);
    damage(state, target, hammer.amount, hammer.source, actor, hammer.card);
    settleAssault(state, hammer.card);
    if (hammer.card.greenGatlingQueue?.length) {
      battle.greenGatlingResume = {
        actorUid: actor.uid,
        targetUid: target.uid,
        card: hammer.card,
      };
    }
    ctx.checkEnd(state);
    return true;
  }
  function cancel(state) {
    const battle = state.battle;
    const hammer = battle?.thunderHammer;
    if (!hammer) return false;
    const actor = ctx.allUnits(battle)
      .find(unit => unit.uid === hammer.actorUid);
    const target = ctx.allUnits(battle)
      .find(unit => unit.uid === hammer.targetUid);
    battle.thunderHammer = null;
    battle.locked = false;
    if (actor && target && !hammer.afterDodgedFired) {
      triggers.afterDodged(state, actor, target, hammer.card);
    }
    settleAssault(state, hammer.card);
    if (hammer.card.greenGatlingQueue?.length) {
      battle.greenGatlingResume = {
        actorUid: hammer.actorUid,
        targetUid: hammer.targetUid,
        card: hammer.card,
      };
    }
    return true;
  }
  return { queue, resolve, cancel };
};
