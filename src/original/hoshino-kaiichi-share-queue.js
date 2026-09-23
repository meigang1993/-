window.HoshinoKaiichiShareQueue = ({ alive, allUnits }) => {
  function queueShare(state, unit, source) {
    const battle = state.battle;
    const others = battle.allies.filter(item => item.uid !== unit.uid && alive(item));
    const count = Math.min(2, unit.hand.length);
    if (!others.length || !count || unit.side !== "ally") return false;
    const active = allUnits(battle).find(item => item.uid === battle.activeUid);
    const resumeEnemyUid = active?.side === "enemy" && battle.phase === 4 ? active.uid : null;
    (battle.kaiichiShareQueue ||= []).push({
      unitUid: unit.uid,
      sourceUid: source?.uid || null,
      maxCount: count,
      indexes: [],
      resumeEnemyUid,
      resumeUnitUid: active?.uid || null,
      resumePhase: battle.phase,
    });
    if (!activateShare(state)) scheduleShare(state);
    return true;
  }

  function scheduleShare(state) {
    const battle = state.battle;
    if (!battle || battle.kaiichiShareScheduled || battle.kaiichiShare) return;
    battle.kaiichiShareScheduled = true;
    setTimeout(() => {
      if (!state.battle || state.battle !== battle) return;
      battle.kaiichiShareScheduled = false;
      activateShare(state);
      window.render?.();
    }, 0);
  }

  function activateShare(state) {
    const battle = state.battle;
    if (!battle || battle.locked || battle.kaiichiShare
      || !battle.kaiichiShareQueue?.length) return false;
    battle.kaiichiShare = battle.kaiichiShareQueue.shift();
    battle.locked = true;
    const unit = allUnits(battle).find(item => item.uid === battle.kaiichiShare.unitUid);
    const source = allUnits(battle).find(item => item.uid === battle.kaiichiShare.sourceUid);
    scheduleBloodCaption(state, unit, source, battle.kaiichiShare);
    return true;
  }

  function scheduleBloodCaption(state, unit, source, prompt = null) {
    const battle = state.battle;
    const deadline = performance.now() + 10000;
    if (typeof window.requestAnimationFrame !== "function") {
      if (prompt) prompt.captionShown = true;
      window.BattleLines?.skill(state, unit, "半魅魔血", source);
      return;
    }
    const show = () => {
      if (state.battle !== battle || !unit
        || prompt && battle.kaiichiShare !== prompt) return;
      const ready = prompt
        ? shareVisible(battle)
        : !battle.animQueue?.length
          && !window.BattleEffects?.animating && !window.BattleEffects?.draining;
      if (!ready) {
        if (performance.now() < deadline) window.requestAnimationFrame(show);
        else console.warn("半魅魔血提示等待动画超时");
        return;
      }
      if (prompt?.captionShown) return;
      if (prompt) prompt.captionShown = true;
      window.BattleLines?.skill(state, unit, "半魅魔血", source);
    };
    window.requestAnimationFrame(show);
  }

  function shareVisible(battle) {
    return !!(battle?.kaiichiShare && !battle.animQueue?.length
      && !window.BattleEffects?.animating && !window.BattleEffects?.draining);
  }

  return {
    queueShare, scheduleShare, activateShare, scheduleBloodCaption, shareVisible,
  };
};
