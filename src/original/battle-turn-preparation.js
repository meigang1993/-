window.BattleTurnPreparation = ({
  active,
  allUnits,
  combat,
  draw,
  intentMax,
  nextAnim,
  nextRoundUnit,
  tempAttack,
  turnDrawCount,
  record,
  waitEffects,
  isCurrentState,
  runEnemyPlayPhase,
  getFinishTurn,
}) => {
  let start;
  let input;
  const advanceToInput = (...args) => input.advanceToInput(...args);
  start = window.BattleTurnStart({
    active, allUnits, combat, draw, intentMax, nextAnim, nextRoundUnit,
    tempAttack, turnDrawCount, record, waitEffects, getFinishTurn, advanceToInput,
  });
  input = window.BattleTurnInput({
    combat, record, waitEffects, isCurrentState, runEnemyPlayPhase,
    getFinishTurn, beginTurn: start.beginTurn,
  });
  return {
    continuePreparedTurn: start.continuePreparedTurn,
    advanceToInput,
    resolveReckless: start.resolveReckless,
    skipExtract: start.skipExtract,
    triggerReckless: start.triggerReckless,
  };
};
