window.BattleEffectDrainRecovery = recover => {
  function guardCommit(event) {
    if (typeof event?.commit !== "function") return null;
    const commit = event.commit;
    let attempted = false;
    event.commit = () => {
      if (attempted) return;
      attempted = true;
      return commit();
    };
    return () => event.commit();
  }

  function recoverEvent(state, event) {
    (event?.cards || []).forEach(card => { delete card._pendingDraw; });
    const battle = state.battle;
    if (event?.type === "judgement" && battle?.judgement?.id === event.id) {
      battle.judgement = null;
    }
    if (event?.type === "revealCards" && battle?.revealCards?.id === event.id) {
      battle.revealCards = null;
    }
    if (event?.type === "clash" && battle?.lastClash?.id === event.id) {
      battle.lastClash = null;
    }
    recover(state, false);
  }

  return { guardCommit, recoverEvent };
};
