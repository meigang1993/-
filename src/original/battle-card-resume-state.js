window.BattleCardResumeState = () => {
  let sequence = 0;
  const paused = battle => !!(
    battle?.kaiichiShare || battle?.kaiichiShareQueue?.length
    || battle?.kaiichiShareScheduled);
  const settling = battle => !!(
    battle?.pendingVictory || battle?.pendingDefeat || battle?.victoryScreen
    || battle?.defeat || battle?.testComplete);
  function ensureId(card) {
    if (card && !card._cardResolutionId) {
      card._cardResolutionId = `card-${++sequence}`;
    }
    return card?._cardResolutionId;
  }

  function findAction(battle, card) {
    const id = card?._cardResolutionId;
    return id && battle?.cardResumeQueue?.find(action => action.id === id);
  }

  function putAction(battle, action, nested = false) {
    const queue = battle.cardResumeQueue ||= [];
    if (!queue.includes(action)) {
      if (nested || battle._resumingCardTail) queue.unshift(action);
      else queue.push(action);
    }
    return action;
  }

  function actionFor(state, actor, target, card, step = 3) {
    const battle = state.battle;
    const id = ensureId(card);
    let action = findAction(battle, card);
    if (!action) {
      action = {
        id,
        actorUid: actor?.uid,
        targetUid: target?.uid,
        card,
        step,
        hookIndex: 0,
        hpLoss: 0,
      };
      putAction(battle, action);
    } else {
      action.step = Math.min(action.step, step);
    }
    return action;
  }

  function deferDamageTail(state, actor, target, card) {
    const battle = state.battle;
    if (!battle || settling(battle) || !paused(battle)) return false;
    const action = actionFor(state, actor, target, card, 0);
    action.hpLoss = Math.max(
      action.hpLoss || 0, card.totalHpLoss || card.lastHpLoss || 0);
    card._deferCardFinalize = true;
    return true;
  }

  function recordHit(state, actor, target, card, result) {
    if (!result?.hpLoss || !card?._cardResolutionId) return;
    const action = findAction(state.battle, card);
    if (!action) return;
    action.hpLoss = (action.hpLoss || 0) + result.hpLoss;
  }

  return {
    paused, ensureId, findAction, putAction, actionFor,
    deferDamageTail, recordHit,
  };
};
