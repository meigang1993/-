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
  async function finishSkippedPlayPhase(state, unit, onStep, current) {
    record(state, `${unit.name} 因${unit.skipPlayReason || "状态牌"}跳过出牌阶段。`);
    const done = finishTurn(state);
    combat.checkEnd(state);
    onStep?.();
    if (done && state.battle && !state.battle.locked) {
      await advanceToInput(state, onStep, current);
    }
  }
  async function resumeAfterManualResponse(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!current()) return;
    if (!await resume.resumeInterruptedActions(state, onStep, current)) return;
    await continueAfterInterruptedActions(state, onStep, current);
  }
  // 进入出牌阶段前的公共前置流程。返回 true 表示可以继续（敌方接着跑 AI 出牌），
  // false 表示已中断、调用方应直接 return。两阵营有两处不可合并的差异，用 opts 区分：
  //   guard    —— 我方分支额外校验 continuePreparedTurn 是否为函数
  //   reckless —— 我方分支额外等待「无谋冲拳」提示（该提示只出现在玩家侧）
  async function beginPlayPhase(state, unit, onStep, current, opts) {
    if (opts.guard && typeof continuePreparedTurn !== "function") return false;
    continuePreparedTurn(state, unit);
    onStep?.();
    await waitEffects();
    if (!current() || !state.battle || state.battle.locked
      || state.battle.activeUid !== unit.uid) return false;
    if (unit.hp <= 0) {
      await advanceToInput(state, onStep, current);
      return false;
    }
    if (state.battle.awaitingExtractUid === unit.uid
      || state.battle.awaitingMimicUid === unit.uid
      || state.battle.awaitingSpeedAssaultUid === unit.uid
      || (opts.reckless && state.battle.recklessPrompt)) return false;
    if (unit.skipPlayPhase) {
      await finishSkippedPlayPhase(state, unit, onStep, current);
      return false;
    }
    state.battle.phase = 4;
    window.SakuraRisaSkills?.playPhaseStart?.(state, unit); window.RuinsEnemySkills?.landmineRps?.playPhaseStart?.(state, unit);
    record(state, `${unit.name} 可以出牌。`);
    onStep?.();
    return true;
  }
  // 结束当前单位的回合并推进到下一个输入点。两处调用进入时 current() 均已为真
  // （敌方分支由 runEnemyPlayPhase 的返回值守住，函数尾部由 !current() 提前返回守住），
  // 因此这里无需重复守卫。块内再判 current() 是因为 waitEffects() 期间状态可能变化。
  async function finishTurnAndAdvance(state, onStep, current) {
    finishTurn(state);
    combat.checkEnd(state);
    onStep?.();
    await waitEffects();
    if (current() && state.battle && !state.battle.locked) {
      await advanceToInput(state, onStep, current);
    }
  }
  async function continueAfterInterruptedActions(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!current()) return;
    const unit = active(state.battle);
    if (unit?.side === "enemy" && state.battle.phase === 1) {
      if (!await beginPlayPhase(state, unit, onStep, current, { guard: false, reckless: false })) return;
      if (!unit.ai) return;
      if (!await runEnemyPlayPhase(state, unit, onStep, true, current)
        || !current()) return;
      await finishTurnAndAdvance(state, onStep, current);
      return;
    }
    if (unit?.side === "ally" && state.battle.phase === 1) {
      await beginPlayPhase(state, unit, onStep, current, { guard: true, reckless: true });
      return;
    }
    if (unit?.side === "enemy" && state.battle.phase === 4) {
      const continued = await runEnemyPlayPhase(state, unit, onStep, false, current);
      const waitingReaction = window.BattleReactionQueue?.pending?.(state.battle)
        || state.battle.counterTrigger || state.battle.counterTriggerQueue?.length;
      if (!continued && (unit.hp > 0 || waitingReaction || state.battle.locked)) return;
    }
    if (!current()) return;
    await finishTurnAndAdvance(state, onStep, current);
  }
  return {
    resumeAfterManualResponse,
    resumeInterruptedActions: resume.resumeInterruptedActions,
    continueAfterInterruptedActions,
  };
};
