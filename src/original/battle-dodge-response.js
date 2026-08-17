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
  function confirmDeflectResult(state) {
    const battle = state.battle;
    const pending = battle?.manualDodge;
    const result = pending?.deflectResult;
    if (!pending || !result) return false;
    if (result.outcome === "tie") {
      pending.deflectResult = null;
      return true;
    }
    const actor = ctx.allUnits(battle)
      .find(unit => unit.uid === pending.actorUid);
    const target = ctx.allUnits(battle)
      .find(unit => unit.uid === pending.targetUid);
    if (!actor || !target) {
      clearManual(battle);
      return false;
    }
    const picked = cards.pick(target, pending.card, pending.deflectIndex);
    if (!picked.length) {
      clearManual(battle);
      return false;
    }
    cards.play(state, target, actor, picked, actor.uid);
    clearManual(battle);
    if (result.outcome === "defender") {
      damage(state, actor, pending.amount, "弹反", target, {
        ...pending.card,
        name: "弹反",
        type: "skill",
        ignoreResponse: true,
        skipDamageModify: true,
      });
      triggers.afterDodged(state, actor, target, pending.card);
      resume.queue(battle, pending);
    } else resume.hit(state, actor, target, pending);
    settleAssault(state, pending.card);
    ctx.checkEnd(state);
    return true;
  }
  function clearManual(battle, keepLocked = false) {
    battle.manualDodge = null;
    battle.pendingTargetUid = null;
    const settling = battle.pendingVictory || battle.pendingDefeat
      || battle.victoryScreen || battle.defeat || battle.testComplete;
    if (!keepLocked && !settling) battle.locked = false;
  }
  function autoDodge(state, actor, target, amount, source, card, response) {
    const needTwo = card?.krowFemaleTarget || card?.twoDodgesRequired;
    let second = needTwo
      && target.hand.find(item => item !== response && canDodge(card, item));
    if (needTwo && !second) {
      second = window.FloraCarlosSkills?.dodgeAsFlash?.(
        state, target, actor, card,
        {
          ...deps,
          afterCardResponded:
            window.NonokaLokiSkills?.afterCardResponded,
        },
        [response], item => canDodge(card, item));
    }
    if (needTwo && !second) {
      window.BattleLog.add(state,
        `${target.name} 需要两张闪才能抵消本次杀。`);
      return false;
    }
    cards.play(state, target, actor, [response, second].filter(Boolean));
    if (response.deflect) {
      if (window.WithererSkills?.deflect?.(
        state, target, actor, amount, source, card, damage)) {
        triggers.afterDodged(state, actor, target, card);
        return true;
      }
      return false;
    }
    window.BattleLog.add(state,
      `${target.name} 自动${cards.responseAction(card)}${second ? "两张闪" : cards.view(target, response, "闪").name}，抵消一次${cards.responseLabel(card)}伤害。`);
    if (hammer.queue(state, actor, target, amount, source, card)) {
      triggers.afterDodged(state, actor, target, card);
      state.battle.thunderHammer.afterDodgedFired = true;
      return true;
    }
    triggers.afterDodged(state, actor, target, card);
    return true;
  }
  return {
    shouldManualDodge, queueManualDodge, autoDodge, resolveManualDodge,
    confirmDeflectResult,
  };
};
