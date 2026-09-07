window.BattleTurnInput = ({
  combat, record, waitEffects, isCurrentState, runEnemyPlayPhase,
  getFinishTurn, beginTurn,
}) => {
  const finishTurn = (...args) => getFinishTurn()(...args);

  async function advanceToInput(state, onStep, actionCurrent = null) {
    const runtimeCurrent = actionCurrent
      || window.AppRuntimeErrors?.guard?.(state) || (() => true);
    const current = () => runtimeCurrent() && isCurrentState(state);
    let guard = 0;
    while (current() && state.battle && guard++ < 12) {
      const unit = beginTurn(state);
      if (!unit || !state.battle) return;
      onStep?.();
      if (state.battle.locked) return;
      await waitEffects();
      if (!current() || !state.battle || state.battle.locked) return;
      if (unit.faceDownTurnSkipped) {
        delete unit.faceDownTurnSkipped;
        onStep?.();
        continue;
      }
      if (state.battle.activeUid !== unit.uid) return;
      if (unit.hp <= 0) {
        onStep?.();
        continue;
      }
      if (state.battle.awaitingExtractUid === unit.uid
        || state.battle.awaitingMimicUid === unit.uid
        || state.battle.awaitingSpeedAssaultUid === unit.uid) {
        onStep?.();
        return;
      }
      if (unit.skipPlayPhase) {
        record(state, `${unit.name} 因眩晕跳过出牌阶段。`);
        const done = finishTurn(state);
        combat.checkEnd(state);
        onStep?.();
        await waitEffects();
        if (!done) return;
        continue;
      }
      state.battle.phase = 4;
      window.SakuraRisaSkills?.playPhaseStart?.(state, unit);
      record(state, `${unit.name} 可以出牌。`);
      onStep?.();
      if (unit.side === "ally") return;
      if (!await runEnemyPlayPhase(state, unit, onStep, true, current)
        || !current()) return;
      finishTurn(state);
      combat.checkEnd(state);
      onStep?.();
      await waitEffects();
      if (!current()) return;
    }
  }

  return { advanceToInput };
};
