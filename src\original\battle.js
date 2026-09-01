window.BattleSystem = (() => {
  let nextAnim = 1;
  let combat = null;
  let turnFlow = null;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const waitEffects = async () => { await window.BattleEffects?.whenIdle?.(); };
  const isCurrentState = state => !window.state || window.state === state;
  const reactionPending = battle => !!(
    window.BattleReactionQueue?.pending?.(battle)
    || battle?.manualDodgeResume
    || battle?.demonInvasionResume
    || battle?.groupHealResume
    || battle?.counterTrigger
    || battle?.counterTriggerQueue?.length
    || battle?.cardResumeQueue?.length
    || battle?.comboAttackResume
    || battle?.greenGatlingResume
  );
  const runtime = window.BattleRuntimeHelpers();
  const {
    active, allUnits, canDiscardAny, canDiscardCard, discardNeed, handLimit,
    hidePlayed, initialDrawCount, intentMax, isKillCard, nextRoundUnit, order,
    revealPending, revealPlayed, shiftAnim, tempAttack, turnDrawCount, visibleHand,
  } = runtime;
  const clearBattleLog = state =>
    window.BattleLog?.clear?.(state) || (state.battleLog = []);
  const record = (state, text) => window.BattleLog?.add?.(state, text);
  const setup = window.BattleSetup();
  const session = window.BattleSession({
    setup,
    cleanupBattlePrompts: window.BattleTurnState.cleanupPrompts,
    clearBattleLog,
    record,
    wait,
    waitEffects,
    isCurrentState,
    initialDrawCount,
    revealPending,
    nextAnim: () => nextAnim++,
    getCombat: () => combat,
    getAdvanceToInput: () => turnFlow.advanceToInput,
  });

  function triggerReckless(unit, card, battle) {
    return turnFlow.triggerReckless(unit, card, battle);
  }

  combat = window.BattleCombat({
    active,
    draw: session.draw,
    finishBattle: session.finishBattle,
    isKillCard,
    intentMax,
    tempAttack,
    triggerReckless,
    nextAnim: () => nextAnim++,
  });
  const outcomes = window.BattleOutcomes({
    clearBattleLog,
    finishBattle: session.finishBattle,
    combat,
  });
  turnFlow = window.BattleTurnFlow({
    active,
    allUnits,
    canDiscardAny,
    canDiscardCard,
    discardNeed,
    handLimit,
    intentMax,
    isKillCard,
    nextRoundUnit,
    tempAttack,
    turnDrawCount,
    visibleHand,
    combat,
    draw: session.draw,
    finishBattle: session.finishBattle,
    record,
    wait,
    waitEffects,
    isCurrentState,
    reactionPending,
    nextAnim: () => nextAnim++,
  });
  const resolution = window.BattleResolutionActions({
    active,
    allUnits,
    combat,
    manualFlow: turnFlow.manualFlow,
    waitEffects,
    isCurrentState,
  });

  function triggerBattleCourage(state, event) {
    return combat.triggerBattleCourage(state, event);
  }

  return {
    start: session.start,
    retryAssets: setup.retryAssets,
    endPlay: turnFlow.endPlay,
    discardCard: turnFlow.discardCard,
    confirmDiscard: turnFlow.confirmDiscard,
    toggleMillerShareCard: turnFlow.toggleMillerShareCard,
    toggleNewMoonCard: turnFlow.toggleNewMoonCard,
    resolveNewMoonShare: turnFlow.resolveNewMoonShare,
    resolveGerdaComfort: turnFlow.resolveGerdaComfort,
    toggleKaiichiShareCard: turnFlow.toggleKaiichiShareCard,
    resolveKaiichiShare: turnFlow.resolveKaiichiShare,
    resolveMillerShare: turnFlow.resolveMillerShare,
    cancelThunderHammer: turnFlow.manualFlow.cancelThunderHammer,
    resolveManualDodge: turnFlow.manualFlow.resolveManualDodge,
    confirmDeflectResult: turnFlow.manualFlow.confirmDeflectResult,
    resolveManualCounter: turnFlow.manualFlow.resolveManualCounter,
    continueAfterCadicisResponsibility:
      turnFlow.manualFlow.continueAfterCadicisResponsibility,
    ...resolution,
    resolveReckless: turnFlow.resolveReckless,
    skipExtract: turnFlow.skipExtract,
    skipPrepareSkill: turnFlow.skipTimedSkill,
    playActiveCard: combat.playActiveCard,
    useCard: combat.useCard,
    selectCard: combat.selectCard,
    selectSkill: combat.selectSkill,
    selectExtract: combat.selectExtract,
    selectMimic: combat.selectMimic,
    selectPrepareSkill: combat.selectPrepareSkill,
    chooseTarget: combat.chooseTarget,
    cancelSelection: combat.cancelSelection,
    playSelectedCard: combat.playSelectedCard,
    canSelectHandCost: combat.canSelectHandCost,
    canPlay: combat.canPlay,
    active,
    finishBattle: session.finishBattle,
    continueVictory: outcomes.continueVictory,
    retreat: outcomes.retreat,
    returnHall: outcomes.returnHall,
    checkDefeat: combat.checkDefeat,
    checkEnd: combat.checkEnd,
    order,
    revealPlayed,
    hidePlayed,
    triggerBattleCourage,
    triggerReckless,
    settlePending: outcomes.settlePending,
    shiftAnim,
    holdVisual: combat.holdVisual,
    pushFloat: combat.pushFloat,
    draw: session.draw,
    damage: combat.damage,
  };
})();
