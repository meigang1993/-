window.BattleTurnFlow = deps => {
  const autoEnemy = window.BattleAutoEnemy(deps);
  const enemyTurn = window.BattleEnemyTurn({
    wait: deps.wait,
    waitEffects: deps.waitEffects,
    autoEnemy,
    isKillCard: deps.isKillCard,
    nextAnim: deps.nextAnim,
  });
  const runEnemyPlayPhase = enemyTurn.runEnemyPlayPhase;
  let completion = null;
  const preparation = window.BattleTurnPreparation({
    ...deps,
    runEnemyPlayPhase,
    getFinishTurn: () => completion.finishTurn,
  });
  completion = window.BattleTurnCompletion({
    ...deps,
    runEnemyPlayPhase,
    advanceToInput: preparation.advanceToInput,
    continuePreparedTurn: preparation.continuePreparedTurn,
  });
  const skipTimedSkill = (state, onStep) =>
    state?.battle?.phase === 6
      ? completion.resumeEndSpeedAssault(state, onStep)
      : preparation.skipExtract(state, onStep);
  return {
    ...completion,
    resolveReckless: preparation.resolveReckless,
    skipExtract: preparation.skipExtract,
    skipTimedSkill,
    triggerReckless: preparation.triggerReckless,
    advanceToInput: preparation.advanceToInput,
  };
};
