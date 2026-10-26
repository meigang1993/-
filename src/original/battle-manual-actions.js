window.BattleManualActions = (
  deps, resumeAfterManualResponse, resumeInterruptedActions,
) => {
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
  // 记忆泡泡的「放入 / 放弃」同样会解除战斗锁定，解锁后必须把被中断的
  // 残留段跑完：此前这两个动作直接调 combat 的裸函数，无人续跑，
  // 【格林机枪】追加的剩余【杀】会永久卡在 greenGatlingResume 里
  // （与「霹雳之锤解决后续跑」同一类问题）。
  // 只续跑残留段、不调用 continueAfterInterruptedActions：后者会继续推进
  // 回合流程，一路走到结束阶段把刚存进泡泡区的牌清空（已复现）。
  async function finishResumeOnly(state, changed, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!changed) return false;
    onStep?.();
    await waitEffects();
    if (!current() || !state.battle || state.battle.locked) return true;
    await resumeInterruptedActions?.(state, onStep, current);
    return true;
  }
  const storeKarunaBubble = (state, onStep, inherited) =>
    finishResumeOnly(state, combat.storeKarunaBubble(state), onStep, inherited);
  const skipKarunaBubble = (state, onStep, inherited) =>
    finishResumeOnly(state, combat.skipKarunaBubble(state), onStep, inherited);
  return {
    cancelThunderHammer, resolveThunderHammer, resolveManualDodge,
    confirmDeflectResult, resolveManualCounter,
    continueAfterCadicisResponsibility,
    storeKarunaBubble, skipKarunaBubble,
  };
};
