window.BattleTurnCompletion = ({
  active,
  allUnits,
  canDiscardAny,
  canDiscardCard,
  discardNeed,
  handLimit,
  visibleHand,
  combat,
  draw,
  record,
  waitEffects,
  isCurrentState,
  runEnemyPlayPhase,
  advanceToInput,
  continuePreparedTurn,
}) => {
  function finishTurn(state) {
    const battle = state.battle;
    const unit = active(battle);
    if (!unit || battle.locked) return true;
    battle.phase = 5;
    battle.selectedCardIndex = null;
    battle.selectedCostCardIndex = null;
    battle.selectedSkillCard = null;
    battle.selectedBagIndexes = null;
    battle.pendingTargetUid = null;
    battle.discardPick = null;
    window.SakuraRisaSkills?.playPhaseEnd?.(state, unit);
    window.BattleRelicTurns.finishPlay(state, unit, record);
    return enterDiscardOrEnd(state, unit);
  }

  async function endPlay(state, onStep) {
    if (state.battle?.locked || state.battle.phase !== 4) return;
    const done = finishTurn(state);
    combat.checkEnd(state);
    onStep?.();
    if (done && state.battle && !state.battle.locked) {
      await advanceToInput(state, onStep);
    }
  }

  const manualFlow = window.BattleManualFlow({
    active,
    allUnits,
    combat,
    finishTurn,
    advanceToInput,
    runEnemyPlayPhase,
    waitEffects,
  });
  const discardTools = window.BattleDiscardOverflow({
    visibleHand,
    handLimit,
    draw,
    combat,
  });
  const endPhase = window.BattleEndPhase({ allUnits, combat, draw });
  const enterEndPhase = (state, unit) => endPhase.run(state, unit);
  async function resumeEndSpeedAssault(state, onStep) {
    const battle = state?.battle;
    const unit = battle && active(battle);
    if (!battle || battle.locked || battle.phase !== 6
      || battle.awaitingSpeedAssaultUid !== unit?.uid) return false;
    battle.awaitingSpeedAssaultUid = null;
    const done = enterEndPhase(state, unit);
    onStep?.();
    if (done && state.battle && !state.battle.locked) {
      await advanceToInput(state, onStep);
    }
    return true;
  }
  const discardFlow = window.BattleDiscardFlow({
    active,
    visibleHand,
    handLimit,
    canDiscardCard,
    canDiscardAny,
    discardNeed,
    discardOverflow: discardTools.discardOverflow,
    enterEndPhase,
    draw,
    combat,
    record,
    advanceToInput,
    manualFlow,
  });
  const {
    enterDiscardOrEnd,
    completeDiscardPhase,
    confirmDiscard,
    discardCard,
    discardCards,
    toggleMillerShareCard,
  } = discardFlow;
  const shareFlow = window.BattleShareFlow({
    active,
    enterEndPhase,
    advanceToInput,
    draw,
    waitEffects,
    isCurrentState,
    manualFlow,
    combat,
    continuePreparedTurn,
    finishTurn,
    runEnemyPlayPhase,
    record,
    canDiscardCard,
    discardCards,
    completeDiscardPhase,
  });

  function toggleKaiichiShareCard(state, cardIndex) {
    return window.HoshinoSkills?.toggleShareCard?.(state, cardIndex) || false;
  }

  function toggleNewMoonCard(state, cardIndex) {
    return window.NonokaLokiSkills?.toggleNewMoonCard?.(state, cardIndex) || false;
  }

  return {
    finishTurn,
    endPlay,
    resumeEndSpeedAssault,
    confirmDiscard,
    discardCard,
    toggleMillerShareCard,
    toggleKaiichiShareCard,
    toggleNewMoonCard,
    resolveNewMoonShare: shareFlow.resolveNewMoonShare,
    resolveGerdaComfort: shareFlow.resolveGerdaComfort,
    resolveKaiichiShare: shareFlow.resolveKaiichiShare,
    resolveMillerShare: shareFlow.resolveMillerShare,
    manualFlow,
  };
};
