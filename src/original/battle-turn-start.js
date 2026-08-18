window.BattleTurnStart = ({
  active, allUnits, combat, draw, intentMax, nextAnim, nextRoundUnit,
  tempAttack, turnDrawCount, record, waitEffects, getFinishTurn, advanceToInput,
}) => {
  function relicPrepare(state, unit) {
    window.BattleRelicTurns.prepare(state, unit, combat.useCard, record);
  }
  const prepareSequence = window.BattlePrepareSequence({
    combat, draw, intentMax, nextAnim, record, relicPrepare,
  });
  const shouldPromptReckless = (unit, battle) =>
    !unit.recklessPromptDone
    && unit.hand.some(card => card.reckless && !card._pendingDraw)
    && (unit.side === "enemy" ? battle.allies : battle.enemies)
      .some(enemy => enemy.hp > 0);
  const shouldPromptSpeedAssault = (unit, battle) =>
    unit.side === "ally"
    && !unit.usedSpeedAssaultPrepare
    && UICommon.skillsOf(unit).some(skill => skill.name === "神速之袭")
    && battle.enemies.some(enemy => enemy.hp > 0);
  const shouldPromptMimic = unit =>
    unit.side === "ally"
    && UICommon.skillsOf(unit).some(skill => skill.name === "模仿之音");
  const shouldPromptExtract = (unit, battle) =>
    unit.side === "ally"
    && UICommon.skillsOf(unit).some(skill => skill.name === "榨取精华")
    && battle.allies.some(ally => ally.gender === "male" && ally.hp > 0);

  function continueStartPhase(state, unit) {
    const battle = state.battle;
    if (!battle || battle.locked) return;
    battle.awaitingExtractUid = null;
    battle.awaitingMimicUid = null;
    battle.awaitingSpeedAssaultUid = null;
    battle.phase = 2;
    unit.skipPlayPhase = false;
    if (unit.usedSpeedAssaultPrepare) {
      record(state, `${unit.name} 跳过判定阶段和摸牌阶段。`);
      return;
    }
    resolveJudgement(unit, state);
    battle.phase = 3;
    if (unit.skipDrawPhase) record(state, `${unit.name} 因封魔跳过摸牌阶段。`);
    else draw(unit, turnDrawCount(unit), battle);
  }

  const finishTurn = (...args) => getFinishTurn()(...args);
  const preparePrompts = window.BattlePreparePrompts({
    active, waitEffects, continueStartPhase, shouldPromptReckless,
    shouldPromptSpeedAssault, shouldPromptMimic, shouldPromptExtract,
    record, allUnits, tempAttack, combat, finishTurn, advanceToInput,
  });
  const skipExtract = preparePrompts.skipExtract;
  const resolveReckless = preparePrompts.resolveReckless;
  const resolveJudgement = (...args) => preparePrompts.resolveJudgement(...args);
  const queueRecklessPrompt = (...args) =>
    preparePrompts.queueRecklessPrompt(...args);
  const autoReckless = (...args) => preparePrompts.autoReckless(...args);

  function triggerReckless(unit, card, battle) {
    return preparePrompts.triggerReckless(window.state, unit, card, battle);
  }

  function beginTurn(state) {
    const battle = state.battle;
    if (!battle || battle.locked) return null;
    const unit = nextRoundUnit(battle);
    if (!unit) return null;
    battle.activeUid = unit.uid;
    battle.phase = 1;
    battle.prepareUnitUid = unit.uid;
    battle.prepareStep = 0;
    window.BattleTurnState.resetBeginTurn(unit, battle, intentMax(unit));
    window.SakuraRisaSkills?.beginTurn?.(state, unit);
    if (battle.locked || window.BattleCounterTriggers?.pending?.(battle)
      || window.BattleReactionQueue?.pending?.(battle)) return unit;
    if (window.GuardKellySkills?.consumeFaceDown?.(state, unit)) {
      window.BattleTurnState.resetBeginTurn(unit, battle, intentMax(unit));
      unit.faceDownTurnSkipped = true;
      battle.phase = 6;
      window.BattleTurnState.cleanupTurn(battle, unit, true, allUnits(battle));
      return unit;
    }
    window.ElranaAceNanaliSkills?.beforeBeginTurn?.(state, unit);
    if (battle.locked || window.BattleCounterTriggers?.pending?.(battle)
      || window.BattleReactionQueue?.pending?.(battle)) return unit;
    window.BertisGerlotSkills?.refreshArrogance?.(state);
    window.BakarSkills?.beginTurn?.(state, unit);
    if (battle.locked || window.BattleCounterTriggers?.pending?.(battle)
      || window.BattleReactionQueue?.pending?.(battle)) return unit;
    window.HoshinoSkills?.beginTurn?.(state, unit);
    if (battle.locked || window.BattleCounterTriggers?.pending?.(battle)
      || window.BattleReactionQueue?.pending?.(battle)) return unit;
    return continuePreparedTurn(state, unit);
  }

  function continuePreparedTurn(state, unit) {
    const battle = state.battle;
    if (!prepareSequence.resolve(state, unit)) return unit;
    if (unit.hp <= 0) {
      record(state, `${unit.name} 已无法行动。`);
      battle.phase = 6;
      window.BattleTurnState.cleanupTurn(
        battle, active(battle), false, allUnits(battle));
      return unit;
    }
    if (shouldPromptReckless(unit, battle)) {
      if (unit.side === "ally" && state.settings?.manualResponse) {
        queueRecklessPrompt(state, unit);
        return unit;
      }
      autoReckless(state, unit, battle);
      if (!state.battle || state.battle.locked || unit.hp <= 0) return unit;
    }
    if (shouldPromptSpeedAssault(unit, battle)) {
      battle.awaitingSpeedAssaultUid = unit.uid;
      record(state, `${unit.name} 可以发动神速之袭。`);
      return unit;
    }
    if (shouldPromptMimic(unit)) {
      battle.awaitingMimicUid = unit.uid;
      record(state, `${unit.name} 可以发动模仿之音。`);
      return unit;
    }
    if (shouldPromptExtract(unit, battle)) {
      battle.awaitingExtractUid = unit.uid;
      battle.extractPrompted = true;
      record(state, `${unit.name} 可以发动榨取精华。`);
      return unit;
    }
    continueStartPhase(state, unit);
    return unit;
  }

  return {
    beginTurn, continuePreparedTurn, resolveReckless, skipExtract, triggerReckless,
  };
};
