window.BattleEffectDrainRecovery = recover => {
  function guardCommit(event) {
    if (typeof event?.commit !== "function") return null;
    const commit = event.commit;
    let complete = false;
    let running = false;
    event.commit = () => {
      if (complete || running) return;
      running = true;
      event.runtimeCommitState = "running";
      try {
        const result = commit();
        complete = true;
        event.runtimeCommitState = "complete";
        return result;
      } catch (error) {
        event.runtimeCommitState = "failed";
        throw error;
      } finally {
        running = false;
      }
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
    if (event?.runtimeRecovery === "restart"
      && event.runtimeCommitState !== "complete" && battle?.animQueue
      && !battle.animQueue.includes(event)) {
      battle.animQueue.unshift(event);
    }
    recover(state, false);
  }

  return { guardCommit, recoverEvent };
};
