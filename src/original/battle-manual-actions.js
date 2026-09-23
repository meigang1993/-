window.BattleManualActions = (deps, resumeAfterManualResponse) => {
  const { combat, waitEffects } = deps;
  const actionGuard = (state, inherited) => inherited
    || window.BattleActionGuard?.guard?.(state)
    || window.AppRuntimeErrors?.guard?.(state)
    || (() => !window.state || window.state === state);
  async function finishAction(state, changed, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!changed) return false;
    onStep?.();
    await waitEffects();
    if (!current() || !state.battle || state.battle.locked) return true;
    await resumeAfterManualResponse(state, onStep, current);
    return true;
  }
  const cancelThunderHammer = (state, onStep, inherited) =>
    finishAction(
      state, combat.cancelThunderHammer(state), onStep, inherited);
  const resolveThunderHammer = (state, cardIndex, onStep, inherited) =>
    finishAction(
      state, combat.resolveThunderHammer(state, cardIndex), onStep, inherited);
  const resolveManualDodge = (
    state, useDodge, index, onStep, deflectChoice, inherited,
  ) => finishAction(
    state,
    combat.resolveManualDodge(state, useDodge, index, deflectChoice),
    onStep,
    inherited,
  );
  const confirmDeflectResult = (state, onStep, inherited) =>
    finishAction(
      state, combat.confirmDeflectResult(state), onStep, inherited);
  const resolveManualCounter = (
    state, useCounter, index, onStep, inherited,
  ) => finishAction(
    state, combat.resolveManualCounter(state, useCounter, index),
    onStep, inherited);
  const continueAfterCadicisResponsibility = (state, onStep, inherited) =>
    finishAction(
      state, combat.continueAfterCadicisResponsibility(state),
      onStep, inherited);
  return {
    cancelThunderHammer, resolveThunderHammer, resolveManualDodge,
    confirmDeflectResult, resolveManualCounter,
    continueAfterCadicisResponsibility,
  };
};
