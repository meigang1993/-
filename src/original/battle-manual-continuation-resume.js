window.BattleManualContinuationResume = deps => {
  const {
    allUnits, combat, waitEffects, actionGuard, hitResume, record,
  } = deps;
  async function resumeInterruptedActions(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    let guard = 0;
    while (current() && state.battle && !state.battle.locked
      && guard++ < 160) {
      const battle = state.battle;
      if (battle.reactionQueue?.length
        || battle.kaiichiShareQueue?.length) {
        window.BattleReactionQueue?.flush?.(state, combat.damage);
        onStep?.();
        await waitEffects();
        if (!current() || !state.battle || state.battle.locked) return false;
        continue;
      }
      if (battle.manualDodgeResume) {
        await hitResume.resolveManualResume(state, onStep, current);
        continue;
      }
      if (battle.demonInvasionResume) {
        await hitResume.resumeDemonInvasion(state, onStep, current);
        continue;
      }
      if (battle.groupHealResume) {
        combat.resumeGroupHeal?.(state);
        onStep?.();
        await waitEffects();
        if (!current() || !state.battle || state.battle.locked) return false;
        continue;
      }
      const cardTail = battle.cardResumeQueue?.[0];
      if (cardTail && !(cardTail.waitingGreen
        && battle.greenGatlingResume)) {
        combat.resumeCardTail?.(state);
        onStep?.();
        await waitEffects();
        if (!current() || !state.battle || state.battle.locked) return false;
        continue;
      }
      window.BakarSkills?.completeInvasion?.(state);
      if (battle.comboAttackResume) {
        await resumeComboAttack(state, onStep, current);
        continue;
      }
      if (battle.greenGatlingResume) {
        await resumeGreenGatling(state, onStep, current);
        continue;
      }
      if (cardTail) continue;
      return true;
    }
    return false;
  }
  async function resumeComboAttack(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!current() || !state.battle?.comboAttackResume
      || state.battle.locked) return;
    combat.resumeComboAttack(state);
    onStep?.();
    await waitEffects();
  }
  async function resumeGreenGatling(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!current()) return;
    const pending = state.battle?.greenGatlingResume;
    if (!pending) return;
    state.battle.greenGatlingResume = null;
    const actor = allUnits(state.battle)
      .find(unit => unit.uid === pending.actorUid);
    const target = allUnits(state.battle)
      .find(unit => unit.uid === pending.targetUid);
    if (actor && target) {
      combat.resumeGreenGatling(state, actor, target, pending.card);
    }
    onStep?.();
    await waitEffects();
  }
  return {
    resumeInterruptedActions, resumeComboAttack, resumeGreenGatling,
  };
};
