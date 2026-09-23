window.BattleCardResumeFlow = (api, stateApi, hooksApi) => {
  const { specials, checkDefeat, allUnits } = api;

  function finalizeUse(state, actor, target, card, counted) {
    if (!card) return;
    const existing = stateApi.findAction(state.battle, card);
    if (existing || stateApi.paused(state.battle)) {
      const action =
        existing || stateApi.actionFor(state, actor, target, card, 3);
      action.counted = counted;
      card._deferCardFinalize = true;
      return;
    }
    hooksApi.runHooks(state, {
      actorUid: actor?.uid,
      targetUid: target?.uid,
      card,
      counted,
      hookIndex: 0,
      step: 3,
    });
  }

  function resume(state) {
    const battle = state.battle;
    const action = battle?.cardResumeQueue?.shift();
    if (!action || battle.locked) return false;
    if (!battle.cardResumeQueue.length) battle.cardResumeQueue = null;
    const units = allUnits(battle);
    const actor = units.find(unit => unit.uid === action.actorUid);
    const target = units.find(unit => unit.uid === action.targetUid);
    battle._resumingCardTail = true;
    try {
      if (action.step === 0) {
        action.step = 1;
        if (stateApi.paused(battle)) {
          stateApi.putAction(battle, action);
          return false;
        }
      }
      if (action.step === 1) {
        action.step = 2;
        action.card.totalHpLoss = action.hpLoss || 0;
        if (actor) specials.healBySyringe(state, actor, action.card);
        if (stateApi.paused(battle)) {
          stateApi.putAction(battle, action);
          return false;
        }
      }
      if (action.step === 2) {
        action.step = 3;
        if (actor && target) {
          specials.resolveGreenGatling(state, actor, target, action.card);
        }
        if (battle.greenGatlingResume) action.waitingGreen = true;
        if (stateApi.paused(battle) || action.waitingGreen) {
          stateApi.putAction(battle, action);
          return false;
        }
      }
      action.waitingGreen = false;
      const done = hooksApi.runHooks(state, action);
      checkDefeat(state);
      return done;
    } finally {
      delete battle._resumingCardTail;
    }
  }

  return { finalizeUse, resume };
};
