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
    (state, actor, target, card) =>
      window.RuinsRelicEffects?.afterCardPlayed?.(state, actor, target, card, deps.draw),
      (state, actor, target, card) =>
        window.CatherineSkills?.afterCardPlayed?.(state, actor, card),
      (state, actor, target, card) =>
        window.HitwellSkills?.afterCardPlayed?.(state, actor, card, api),
      // 卡露娜两个技能都排在最后：记忆泡泡会挂起战斗等待玩家选择，
      // 放前面会让后续角色的钩子被 paused 判定跳过。
      (state, actor, target, card) =>
        window.AbeKarunaDivaSkills?.afterCardPlayed?.(state, actor, card, deps),
      (state, actor, target, card) =>
        window.AbeKarunaBubbleSkills?.afterCardPlayed?.(state, actor, card),
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
      // 时停：出牌后的技能钩子归属出牌者，被时停时不触发。
      const actorStopped = !!window.MieryulaTimeStop?.isSkillDisabled?.(actor);
      if (action.counted && !action.card.skipAfterCardPlayed && !actorStopped) {
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
