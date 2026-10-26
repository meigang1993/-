window.BattleThunderHammerResponse = ({
  deps, ctx, damage, triggers, settleAssault,
}) => {
  function queue(state, actor, target, amount, source, card) {
    const battle = state.battle;
    const settling = battle?.pendingVictory || battle?.pendingDefeat
      || battle?.victoryScreen || battle?.defeat || battle?.testComplete;
    if (!battle || actor?.hp <= 0 || target?.hp <= 0 || settling) return false;
    const hand = actor.hand.filter(item => !item._pendingDraw);
    // 只有单体【杀】能发动：群体杀（机枪扫杀/流星杀…）一次打到多名目标，
    // 逐目标触发会连挂多次锤子、且「令此杀依然造成伤害」的单次补伤语义
    // 对多目标不成立。判据与 CardUtils.isGroupTargetCard 一致（此处内联，
    // 避免额外装配依赖）。
    if (!deps.isKillCard(card) || card.virtual || card._skill
      || card.sweep || card.allTargets || card.aoeLineShown
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
  // 锤子解决后把暂存的「记忆泡泡」询问放出来。锤子挂起时 battle.locked 为真，
  // 记忆泡泡的 afterCardPlayed 会把自己暂存在 karunaBubblePending；这里在其
  // 解除锁定后补问，否则卡露娜的【杀】被【闪】抵消时永远存不进泡泡区。
  function flushKarunaBubble(state) {
    const battle = state?.battle;
    const pending = battle?.karunaBubblePending;
    if (!pending) return false;
    const settling = battle.pendingVictory || battle.pendingDefeat
      || battle.victoryScreen || battle.defeat || battle.testComplete;
    if (settling || battle.locked || battle.karunaBubble) return false;
    battle.karunaBubblePending = null;
    const actor = ctx.allUnits(battle)
      .find(unit => unit.uid === pending.actorUid);
    if (!actor || actor.hp <= 0) return false;
    const max = window.AbeKarunaBubbleSkills?.MAX || 2;
    if ((actor.bubbleCards?.length || 0) >= max) return false;
    battle.karunaBubble = { actorUid: pending.actorUid, card: pending.card };
    battle.locked = true;
    window.BattleLog.add(state, `${actor.name} 的记忆泡泡可发动：`
      + `将刚使用的${pending.card.suit || ""}${pending.card.name}放入泡泡手牌区？`);
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
    // 补伤不等于回合结束：解决后应把控制权交回玩家继续出牌。
    battle.thunderHammerKeepPhase = true;
    flushKarunaBubble(state);
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
    // 放弃发动同样不等于回合结束。
    battle.thunderHammerKeepPhase = true;
    flushKarunaBubble(state);
    return true;
  }
  return { queue, resolve, cancel };
};
