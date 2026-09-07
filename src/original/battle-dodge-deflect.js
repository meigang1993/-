window.BattleDodgeDeflect = ({
  deps, canDodge, cards, ctx, damage, hammer, triggers, resume,
  settleAssault, clearManual,
}) => {
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
  return { confirmDeflectResult, autoDodge };
};
