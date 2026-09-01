window.BattleDodgeResponse = ({
  deps, ctx, canDodge, damage, hitWithoutDodge, finalizeDamage, triggers,
  hammer, settleAssault,
}) => {
  const cards = window.BattleDodgeCards({ deps, ctx, canDodge });
  const resume = window.BattleDodgeResume({
    hitWithoutDodge, finalizeDamage,
  });
  function shouldManualDodge(state, actor, target, card, response) {
    if (!state.settings?.manualResponse && !response?.deflect) return false;
    if (card?.forceAutoResponse) return false;
    if (actor?.side !== "enemy" || target?.side !== "ally"
      || !deps.isKillCard(card) && !card?.responseKind) return false;
    if (card?.angelicaTauntSlash) return false;
    if (!card?.responseKind
      && (card?.sweep || card?.allTargets || card?.aoeLineShown)) return false;
    return !(card?.krowFemaleTarget || card?.twoDodgesRequired)
      || cards.count(target, card, 2) >= 2;
  }
  function queueManualDodge(state, actor, target, amount, source, card,
    selectedIndex = 0, deflectRequired = false) {
    const battle = state.battle;
    battle.manualDodge = {
      actorUid: actor.uid,
      targetUid: target.uid,
      amount,
      source,
      card: { ...card },
      selectedIndex,
      deflectRequired,
    };
    battle.locked = true;
    battle.selectedCardIndex = null;
    battle.selectedCostCardIndex = null;
    battle.selectedSkillCard = null;
    battle.pendingTargetUid = target.uid;
    window.BattleLog.add(state,
      `${target.name} 可以手动选择是否${cards.responseAction(card)}${cards.responseLabel(card)}。`);
  }
  function clearManual(battle, keepLocked = false) {
    battle.manualDodge = null;
    battle.pendingTargetUid = null;
    const settling = battle.pendingVictory || battle.pendingDefeat
      || battle.victoryScreen || battle.defeat || battle.testComplete;
    if (!keepLocked && !settling) battle.locked = false;
  }
  function resolveManualDodge(state, useDodge, index = 0,
    deflectChoice = null) {
    const battle = state.battle;
    const pending = battle?.manualDodge;
    if (!pending || pending.deflectResult) return false;
    if (!useDodge && (pending.deflectStarted || pending.deflectRequired)) {
      return false;
    }
    const actor = ctx.allUnits(battle)
      .find(unit => unit.uid === pending.actorUid);
    const target = ctx.allUnits(battle)
      .find(unit => unit.uid === pending.targetUid);
    if (!actor || !target) {
      clearManual(battle);
      return false;
    }
    if (useDodge) {
      const picked = cards.pick(
        target, pending.card,
        pending.deflectStarted ? pending.deflectIndex : index);
      if (picked.length) {
        if (picked[0]?.deflect) {
          let reveal = null;
          window.WithererSkills?.deflect?.(
            state, target, actor, pending.amount, pending.source,
            pending.card, damage, deflectChoice,
            { defer: true, onReveal: result => { reveal = result; } });
          if (!reveal) return false;
          if (!pending.deflectStarted) pending.deflectIndex = index;
          pending.deflectStarted = true;
          pending.deflectResult = reveal;
          return true;
        }
        cards.play(state, target, actor, picked, actor.uid);
        window.BattleLog.add(state,
          `${target.name} 手动${cards.responseAction(pending.card)}${cards.label(target, picked)}，抵消一次${cards.responseLabel(pending.card)}伤害。`);
        const queued = hammer.queue(
          state, actor, target, pending.amount, pending.source, pending.card);
        clearManual(battle, queued);
        triggers.afterDodged(state, actor, target, pending.card);
        if (queued) battle.thunderHammer.afterDodgedFired = true;
        resume.queue(battle, pending);
        if (!queued) settleAssault(state, pending.card);
        ctx.checkEnd(state);
        return true;
      }
    }
    window.BattleLog.add(state,
      `${target.name} 没有${cards.responseAction(pending.card)}${cards.responseLabel(pending.card)}。`);
    clearManual(battle);
    resume.hit(state, actor, target, pending);
    settleAssault(state, pending.card);
    ctx.checkEnd(state);
    return true;
  }
  const extended = window.BattleDodgeDeflect({
    deps, canDodge, cards, ctx, damage, hammer, triggers, resume,
    settleAssault, clearManual,
  });
  return {
    shouldManualDodge, queueManualDodge, autoDodge: extended.autoDodge,
    resolveManualDodge, confirmDeflectResult: extended.confirmDeflectResult,
  };
};
