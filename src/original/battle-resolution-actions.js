window.BattleResolutionActions = ({
  active,
  allUnits,
  combat,
  manualFlow,
  waitEffects,
  isCurrentState,
}) => {
  const actionGuard = state => window.BattleActionGuard?.guard?.(state)
    || window.AppRuntimeErrors?.guard?.(state)
    || (() => isCurrentState(state));
  async function resolveHandReveal(state, index, onStep) {
    const current = actionGuard(state);
    const prompt = state.battle?.handReveal;
    const actor = prompt && allUnits(state.battle)
      .find(unit => unit.uid === prompt.actorUid);
    const ok = combat.resolveHandReveal(state, index);
    const resolved = ok && state.battle?.handReveal !== prompt;
    if (!resolved) return ok;
    onStep?.();
    await waitEffects();
    if (actor?.side === "enemy" && current()
      && state.battle && !state.battle.locked) {
      await manualFlow.resumeAfterManualResponse(state, onStep, current);
    }
    return ok;
  }

  async function resolveOpheliaGuard(state, uid, onStep) {
    const current = actionGuard(state);
    const wasEnemy = active(state.battle)?.side === "enemy";
    if (!combat.resolveOpheliaGuard(state, uid)) return false;
    onStep?.();
    await waitEffects();
    if (current() && wasEnemy && state.battle && !state.battle.locked) {
      await manualFlow.resumeAfterManualResponse(state, onStep, current);
    }
    return true;
  }

  async function resolveDimensionTransfer(state, uid, onStep) {
    const current = actionGuard(state);
    const wasEnemy = active(state.battle)?.side === "enemy";
    if (!combat.resolveDimensionTransfer(state, uid)) return false;
    onStep?.();
    await waitEffects();
    if (!current() || !state.battle || state.battle.locked) return true;
    if (wasEnemy) {
      await manualFlow.resumeInterruptedActions(state, onStep, current);
      if (current() && state.battle && !state.battle.locked) {
        await manualFlow.continueAfterInterruptedActions(state, onStep, current);
      }
    } else await manualFlow.resumeInterruptedActions(state, onStep, current);
    return true;
  }

  function resolveRisaEye(state, choice, onStep) {
    const ok = window.SakuraRisaSkills?.resolveEyeChoice?.(state, choice) || false;
    if (ok) onStep?.();
    return ok;
  }

  function confirmRisaEye(state, onStep) {
    const ok = window.SakuraRisaSkills?.confirmEyeResult?.(state) || false;
    if (ok) onStep?.();
    return ok;
  }

  return {
    resolveHandReveal,
    resolveOpheliaGuard,
    resolveDimensionTransfer,
    resolveRisaEye,
    confirmRisaEye,
  };
};
