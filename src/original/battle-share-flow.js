window.BattleShareFlow = deps => {
  const {
    active, enterEndPhase, advanceToInput, draw, waitEffects, isCurrentState,
    manualFlow, combat, continuePreparedTurn, finishTurn, runEnemyPlayPhase,
    record, canDiscardCard, discardCards, completeDiscardPhase,
  } = deps;
  const actionGuard = state => window.BattleActionGuard?.guard?.(state)
    || window.AppRuntimeErrors?.guard?.(state)
    || (() => isCurrentState(state));

  async function resolveNewMoonShare(state, targetUid, onStep) {
    const current = actionGuard(state);
    const battle = state.battle;
    const unit = battle?.allies.find(item => item.uid === battle.newMoonShare?.unitUid);
    if (!battle?.newMoonShare || !unit || battle.newMoonShare.unitUid !== unit.uid) return false;
    if (!window.NonokaLokiSkills?.resolveNewMoonShare?.(state, targetUid)) return false;
    const done = enterEndPhase(state, unit);
    if (onStep) onStep();
    if (done && current() && state.battle && !state.battle.locked) {
      await advanceToInput(state, onStep, current);
    }
    return true;
  }

  async function resolveGerdaComfort(state, targetUid, onStep) {
    const current = actionGuard(state);
    const battle = state.battle;
    const unit = active(battle);
    if (!battle?.gerdaComfort || !unit || battle.gerdaComfort.unitUid !== unit.uid) return false;
    if (!window.GerdaSkills?.resolveComfort?.(state, targetUid, { draw })) return false;
    const done = enterEndPhase(state, unit);
    if (onStep) onStep();
    if (done && current() && state.battle && !state.battle.locked) {
      await advanceToInput(state, onStep, current);
    }
    return true;
  }

  async function resolveKaiichiShare(state, targetUid, onStep) {
    const current = actionGuard(state);
    const result = window.HoshinoSkills?.resolveShare?.(state, targetUid);
    if (!result?.ok) return false;
    if (onStep) onStep();
    await waitEffects();
    if (!current() || !state.battle || state.battle.locked || !result.done) return true;
    if (!await manualFlow.resumeInterruptedActions(state, onStep, current)) return true;
    if (!current()) return true;
    combat.checkEnd(state);
    if (!state.battle || state.battle.locked) return true;
    await resumeKaiichiPhase(state, result, onStep, current);
    return true;
  }

  async function resumeKaiichiPhase(state, result, onStep, current) {
    if (!current()) return;
    const battle = state.battle;
    const unit = active(battle);
    if (!unit || unit.uid !== result.resumeUnitUid || battle.phase !== result.resumePhase) return;
    if (battle.phase === 4 && result.resumeEnemyUid === unit.uid) {
      await manualFlow.resumeAfterManualResponse(state, onStep, current);
      return;
    }
    if (battle.phase === 6) { await advanceToInput(state, onStep, current); return; }
    if (battle.phase !== 1) return;
    continuePreparedTurn(state, unit);
    if (onStep) onStep();
    await waitEffects();
    if (!current() || !state.battle || state.battle.locked) return;
    if (unit.hp <= 0) { await advanceToInput(state, onStep, current); return; }
    if (battle.awaitingExtractUid === unit.uid
      || battle.awaitingMimicUid === unit.uid
      || battle.awaitingSpeedAssaultUid === unit.uid) return;
    if (unit.skipPlayPhase) {
      record(state, `${unit.name} 因眩晕跳过出牌阶段。`);
      const done = finishTurn(state);
      combat.checkEnd(state);
      if (onStep) onStep();
      if (done && state.battle && !state.battle.locked) await advanceToInput(state, onStep, current);
      return;
    }
    battle.phase = 4;
    window.SakuraRisaSkills?.playPhaseStart?.(state, unit);
    record(state, `${unit.name} 可以出牌。`);
    if (onStep) onStep();
    if (unit.side === "ally") return;
    if (!await runEnemyPlayPhase(state, unit, onStep, true, current) || !current()) return;
    finishTurn(state);
    combat.checkEnd(state);
    if (onStep) onStep();
    await waitEffects();
    if (current() && state.battle && !state.battle.locked) {
      await advanceToInput(state, onStep, current);
    }
  }

  async function resolveMillerShare(state, targetUid, onStep) {
    const current = actionGuard(state);
    const battle = state.battle;
    const prompt = battle?.millerShare;
    const unit = battle?.allies.find(item => item.uid === prompt?.unitUid);
    if (!prompt || !unit || prompt.unitUid !== unit.uid
      || state.battle !== battle || battle.millerShare !== prompt) return false;
    const result = window.MillerSkills?.resolveShare?.(state, targetUid, {
      canDiscardCard, discardCards,
    });
    if (!result?.ok) { if (onStep) onStep(); return true; }
    if (onStep) onStep();
    await waitEffects();
    if (!current() || state.battle !== battle || battle.millerShare !== null
      || battle.locked) return true;
    const done = completeDiscardPhase(state, unit);
    if (onStep) onStep();
    if (done && current() && state.battle === battle && !battle.locked) {
      await advanceToInput(state, onStep, current);
    }
    return true;
  }

  return { resolveNewMoonShare, resolveGerdaComfort, resolveKaiichiShare, resolveMillerShare };
};
