window.BattleManualFlow = deps => {
  const continuation = window.BattleManualContinuation(deps);
  const actions = window.BattleManualActions(
    deps, continuation.resumeAfterManualResponse);
  return { ...actions, ...continuation };
};
