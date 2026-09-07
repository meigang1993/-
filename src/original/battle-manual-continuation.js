window.BattleManualContinuation = deps => {
  const {
    active, allUnits, combat, finishTurn, advanceToInput,
    runEnemyPlayPhase, waitEffects, continuePreparedTurn, record,
  } = deps;
  const actionGuard = (state, inherited) => inherited
    || window.BattleActionGuard?.guard?.(state)
    || window.AppRuntimeErrors?.guard?.(state)
    || (() => !window.state || window.state === state);
  const hitResume = window.BattleManualHitResume({
    allUnits, combat, waitEffects, actionGuard,
  });
  const resume = window.BattleManualContinuationResume({
    allUnits, combat, waitEffects, actionGuard, hitResume, record,
  });
  async function resumeAfterManualResponse(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!current()) return;
    if (!await resume.resumeInterruptedActions(state, onStep, current)) return;
    await continueAfterInterruptedActions(state, onStep, current);
  }
  async function continueAfterInterruptedActions(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!current()) return;
    const unit = active(state.battle);
    if (unit?.side === "enemy" && state.battle.phase === 1) {
      continuePreparedTurn(state, unit);
      onStep?.();
      await waitEffects();
      if (!current() || !state.battle || state.battle.locked
        || state.battle.activeUid !== unit.uid) return;
      if (unit.hp <= 0) {
        await advanceToInput(state, onStep, current);
        return;
      }
      if (state.battle.awaitingExtractUid === unit.uid
        || state.battle.awaitingMimicUid === unit.uid
        || state.battle.awaitingSpeedAssaultUid === unit.uid) return;
      if (unit.skipPlayPhase) {
        record(state, `${unit.name} 因眩晕跳过出牌阶段。`);
        const done = finishTurn(state);
        combat.checkEnd(state);
        onStep?.();
        if (done && state.battle && !state.battle.locked) {
          await advanceToInput(state, onStep, current);
        }
        return;
      }
      state.battle.phase = 4;
      window.SakuraRisaSkills?.playPhaseStart?.(state, unit);
      record(state, `${unit.name} 可以出牌。`);
      onStep?.();
      if (!unit.ai) return;
      if (!await runEnemyPlayPhase(state, unit, onStep, true, current)
        || !current()) return;
      finishTurn(state);
      combat.checkEnd(state);
      onStep?.();
      await waitEffects();
      if (current() && state.battle && !state.battle.locked) {
        await advanceToInput(state, onStep, current);
      }
      return;
    }
    if (unit?.side === "ally" && state.battle.phase === 1) {
      if (typeof continuePreparedTurn !== "function") return;
      continuePreparedTurn(state, unit);
      onStep?.();
      await waitEffects();
      if (!current() || !state.battle || state.battle.locked
        || state.battle.activeUid !== unit.uid) return;
      if (unit.hp <= 0) {
        await advanceToInput(state, onStep, current);
        return;
      }
      if (state.battle.awaitingExtractUid === unit.uid
        || state.battle.awaitingMimicUid === unit.uid
        || state.battle.awaitingSpeedAssaultUid === unit.uid
        || state.battle.recklessPrompt) return;
      if (unit.skipPlayPhase) {
        record(state, `${unit.name} 因眩晕跳过出牌阶段。`);
        const done = finishTurn(state);
        combat.checkEnd(state);
        onStep?.();
        if (done && state.battle && !state.battle.locked) {
          await advanceToInput(state, onStep, current);
        }
        return;
      }
      state.battle.phase = 4;
      window.SakuraRisaSkills?.playPhaseStart?.(state, unit);
      record(state, `${unit.name} 可以出牌。`);
      onStep?.();
      return;
    }
    if (unit?.side === "enemy" && state.battle.phase === 4) {
      const continued = await runEnemyPlayPhase(state, unit, onStep, false, current);
      const waitingReaction = window.BattleReactionQueue?.pending?.(state.battle)
        || state.battle.counterTrigger || state.battle.counterTriggerQueue?.length;
      if (!continued && (unit.hp > 0 || waitingReaction || state.battle.locked)) return;
    }
    if (!current()) return;
    finishTurn(state);
    combat.checkEnd(state);
    onStep?.();
    await waitEffects();
    if (current() && state.battle && !state.battle.locked) {
      await advanceToInput(state, onStep, current);
    }
  }
  return {
    resumeAfterManualResponse,
    resumeInterruptedActions: resume.resumeInterruptedActions,
    continueAfterInterruptedActions,
  };
};
