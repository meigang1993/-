window.BattleCardResumeHooks = (api, stateApi) => {
  const { deps, damage, allUnits } = api;
  const hooks = [
    state => window.EdisSkills?.flushCopies?.(state),
    (state, actor, target, card) =>
      window.GuestCharacterSkills?.afterCardPlayed?.(
        state, actor, target, card, deps),
    (state, actor, target, card) =>
      window.NonokaLokiSkills?.afterCardPlayed?.(
        state, actor, target, card, deps),
    (state, actor, target, card) =>
      window.WendyCadicisSkills?.afterCardPlayed?.(
        state, actor, target, card, { ...deps, damage }),
    (state, actor, target, card) =>
      window.AngelicaLukaSkills?.afterCardPlayed?.(state, actor, card),
    (state, actor, target, card) =>
      window.UnderwaterTrainSkills?.afterCardPlayed?.(
        state, actor, card, damage, deps.draw),
    (state, actor, target, card) =>
      window.GuardKellySkills?.afterCardPlayed?.(state, actor, card),
    (state, actor, target, card) =>
      window.BakarSkills?.afterCardPlayed?.(state, actor, card),
    (state, actor, target, card) =>
      window.HoshinoSkills?.afterCardPlayed?.(
        state, actor, target, card,
        { ...deps, damage, pushFloat: api.pushFloat }),
  ];

  function cleanup(card) {
    delete card.lastHpLoss;
    delete card.totalHpLoss;
    delete card._deferCardFinalize;
    window.BattleCardCleanup.clearPlayFlags(card);
    delete card._cardResolutionId;
  }

  function runHooks(state, action) {
    const battle = state.battle;
    if (!battle) {
      cleanup(action.card);
      return true;
    }
    const units = allUnits(battle);
    const actor = units.find(unit => unit.uid === action.actorUid);
    const target = units.find(unit => unit.uid === action.targetUid);
    try {
      if (action.counted && !action.resolvedHookDone) {
        action.resolvedHookDone = true;
        window.GuestCharacterSkills?.afterCardResolved?.(
          state, actor, target, action.card, deps);
        if (stateApi.paused(battle)) {
          stateApi.putAction(battle, action);
          return false;
        }
      }
      if (action.counted && !action.card.skipAfterCardPlayed) {
        while (action.hookIndex < hooks.length) {
          hooks[action.hookIndex++](state, actor, target, action.card);
          if (stateApi.paused(battle)) {
            stateApi.putAction(battle, action);
            return false;
          }
        }
      }
    } catch (error) {
      cleanup(action.card);
      throw error;
    }
    cleanup(action.card);
    return true;
  }

  return { runHooks };
};
