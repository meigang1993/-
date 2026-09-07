window.BattleDamageRelics = (() => {
  function canEdisSwordHitAgain(state, actor, target, card) {
    return target?.hp > 0
      && window.CardUtils.isEntitySingleKill(card)
      && !card._edisSwordExtra
      && window.RelicSystem?.hasEquipped?.(state, actor, "伊迪斯电锯剑");
  }

  function queueEdisSwordHit(state, actor, target, amount, card) {
    const battle = state.battle;
    const settling = battle?.pendingVictory || battle?.pendingDefeat
      || battle?.victoryScreen || battle?.defeat || battle?.testComplete;
    if (settling) return false;
    const extraCard = { ...card, _edisSwordExtra: true, _extraSlashResolution: true, ignoreResponse: true };
    delete extraCard._edisHit;
    delete extraCard._extraSlashTextQueued;
    const action = window.BattleReactionQueue?.resolvedHitAction?.(
      actor, target, amount, "伊迪斯电锯剑", extraCard
    );
    return window.BattleReactionQueue?.prepend?.(state, action) || false;
  }

  function resolveEdisSwordHit(state, actor, target, amount, card, hitWithoutDodge) {
    if (!canEdisSwordHitAgain(state, actor, target, card)) return null;
    window.BattleLog.add(state, `${actor.name} 的伊迪斯电锯剑触发，此杀追加第2次伤害。`);
    if (state.battle?.locked) {
      queueEdisSwordHit(state, actor, target, amount, card);
      return null;
    }
    const oldHit = card._edisHit;
    const oldIgnoreResponse = card.ignoreResponse;
    const oldExtraResolution = card._extraSlashResolution;
    const oldExtraSlashTextQueued = card._extraSlashTextQueued;
    card._edisSwordExtra = true;
    card._extraSlashResolution = true;
    delete card._extraSlashTextQueued;
    card.ignoreResponse = true;
    delete card._edisHit;
    try {
      return hitWithoutDodge(state, actor, target, amount, "伊迪斯电锯剑", card);
    } finally {
      delete card._edisSwordExtra;
      if (oldExtraResolution === undefined) delete card._extraSlashResolution;
      else card._extraSlashResolution = oldExtraResolution;
      if (oldExtraSlashTextQueued === undefined) delete card._extraSlashTextQueued;
      else card._extraSlashTextQueued = oldExtraSlashTextQueued;
      card.ignoreResponse = oldIgnoreResponse;
      card._edisHit = oldHit;
    }
  }

  return { canEdisSwordHitAgain, queueEdisSwordHit, resolveEdisSwordHit };
})();
