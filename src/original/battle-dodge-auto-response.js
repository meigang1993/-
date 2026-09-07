window.BattleDodgeAutoResponse = deps => {
  const {
    canDodge, cards, damage, hammer, triggers,
    settleAssault, responseContext,
  } = deps;

  function autoDodge(state, actor, target, amount, source, card, response) {
    const needTwo = card?.krowFemaleTarget || card?.twoDodgesRequired;
    let second = needTwo
      && target.hand.find(item => item !== response && canDodge(card, item));
    if (needTwo && !second) {
      second = window.FloraCarlosSkills?.dodgeAsFlash?.(
        state, target, actor, card, responseContext, [response],
        item => canDodge(card, item));
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
    settleAssault(state, card);
    return true;
  }

  return { autoDodge };
};
