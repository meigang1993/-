window.BattleManualFlow = (deps) => {
  const { active, allUnits, combat, finishTurn, advanceToInput, runEnemyPlayPhase, waitEffects } = deps;
  const actionGuard = (state, inherited) => inherited
    || window.BattleActionGuard?.guard?.(state)
    || window.AppRuntimeErrors?.guard?.(state)
    || (() => !window.state || window.state === state);
  async function cancelThunderHammer(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!combat.cancelThunderHammer(state)) return false;
    if (onStep) onStep(); await waitEffects(); if (!current() || !state.battle || state.battle.locked) return true;
    await resumeAfterManualResponse(state, onStep, current); return true;
  }
  async function resolveThunderHammer(state, cardIndex, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!combat.resolveThunderHammer(state, cardIndex)) return false;
    if (onStep) onStep(); await waitEffects(); if (!current() || !state.battle || state.battle.locked) return true;
    await resumeAfterManualResponse(state, onStep, current); return true;
  }
  async function resolveManualDodge(state, useDodge, index, onStep, deflectChoice, inherited) {
    const current = actionGuard(state, inherited);
    if (!combat.resolveManualDodge(state, useDodge, index, deflectChoice)) return false;
    if (onStep) onStep(); await waitEffects(); if (!current() || !state.battle || state.battle.locked) return true;
    await resumeAfterManualResponse(state, onStep, current); return true;
  }
  async function confirmDeflectResult(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!combat.confirmDeflectResult(state)) return false;
    if (onStep) onStep(); await waitEffects(); if (!current() || !state.battle || state.battle.locked) return true;
    await resumeAfterManualResponse(state, onStep, current); return true;
  }
  async function resolveManualCounter(state, useCounter, index, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!combat.resolveManualCounter(state, useCounter, index)) return false;
    if (onStep) onStep(); await waitEffects(); if (!current() || !state.battle || state.battle.locked) return true;
    await resumeAfterManualResponse(state, onStep, current); return true;
  }
  async function continueAfterCadicisResponsibility(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!combat.continueAfterCadicisResponsibility(state)) return false;
    if (onStep) onStep(); await waitEffects(); if (!current() || !state.battle || state.battle.locked) return true;
    await resumeAfterManualResponse(state, onStep, current); return true;
  }
  async function resumeAfterManualResponse(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!current()) return;
    if (!await resumeInterruptedActions(state, onStep, current)) return;
    await continueAfterInterruptedActions(state, onStep, current);
  }
  async function continueAfterInterruptedActions(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!current()) return;
    const unit = active(state.battle);
    if (unit?.side === "enemy" && state.battle.phase === 4
      && !await runEnemyPlayPhase(state, unit, onStep, false, current)) return;
    if (!current()) return;
    finishTurn(state); combat.checkEnd(state); if (onStep) onStep(); await waitEffects(); if (current() && state.battle && !state.battle.locked) await advanceToInput(state, onStep, current);
  }
  async function resumeInterruptedActions(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    let guard = 0;
    while (current() && state.battle && !state.battle.locked && guard++ < 160) {
      const b = state.battle;
      if (b.reactionQueue?.length || b.kaiichiShareQueue?.length) {
        window.BattleReactionQueue?.flush?.(state, combat.damage);
        if (onStep) onStep(); await waitEffects();
        if (!current() || !state.battle || state.battle.locked) return false;
        continue;
      }
      if (b.manualDodgeResume) { await resolveManualResume(state, onStep, current); continue; }
      if (b.demonInvasionResume) { await resumeDemonInvasion(state, onStep, current); continue; }
      if (b.groupHealResume) {
        combat.resumeGroupHeal?.(state);
        if (onStep) onStep(); await waitEffects();
        if (!current() || !state.battle || state.battle.locked) return false;
        continue;
      }
      const cardTail = b.cardResumeQueue?.[0];
      if (cardTail && !(cardTail.waitingGreen && b.greenGatlingResume)) {
        combat.resumeCardTail?.(state);
        if (onStep) onStep(); await waitEffects();
        if (!current() || !state.battle || state.battle.locked) return false;
        continue;
      }
      window.BakarSkills?.completeInvasion?.(state);
      if (b.comboAttackResume) { await resumeComboAttack(state, onStep, current); continue; }
      if (b.greenGatlingResume) { await resumeGreenGatling(state, onStep, current); continue; }
      if (cardTail) continue;
      return true;
    }
    return false;
  }
  async function resumeComboAttack(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!current() || !state.battle?.comboAttackResume || state.battle.locked) return;
    combat.resumeComboAttack(state);
    if (onStep) onStep(); await waitEffects(); if (!current()) return;
  }
  async function resumeGreenGatling(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    if (!current()) return;
    const p = state.battle?.greenGatlingResume;
    if (!p) return;
    state.battle.greenGatlingResume = null;
    const actor = allUnits(state.battle).find(u => u.uid === p.actorUid), target = allUnits(state.battle).find(u => u.uid === p.targetUid);
    if (actor && target) combat.resumeGreenGatling(state, actor, target, p.card);
    if (onStep) onStep(); await waitEffects(); if (!current()) return;
  }
  async function resolveManualResume(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    while (current() && state.battle?.manualDodgeResume && !state.battle.locked) {
      const p = state.battle.manualDodgeResume, actor = allUnits(state.battle).find(u => u.uid === p.actorUid), target = allUnits(state.battle).find(u => u.uid === p.targetUid);
      state.battle.manualDodgeResume = null;
      if (!actor || actor.hp <= 0) return;
      if (!target || target.hp <= 0) {
        const groupCard = p.groupCard || p.card;
        if (groupCard?.targetUids?.length && groupCard.nextTargetIndex != null) state.battle.demonInvasionResume = { ...p, card: groupCard, targetUids: groupCard.targetUids, nextTargetIndex: groupCard.nextTargetIndex };
        continue;
      }
      p.remainingHits = Math.max(0, (p.remainingHits || 0) - 1);
      const hitCard = { ...p.card };
      const result = combat.damage(state, target, p.amount, p.source, actor, hitCard);
      combat.recordDeferredHit?.(state, actor, target, hitCard, result);
      const groupCard = p.groupCard || p.card;
      if (state.battle?.manualDodge) { state.battle.manualDodge.remainingHits = p.remainingHits; if (p.groupCard) state.battle.manualDodge.groupCard = p.groupCard; }
      else if (state.battle?.opheliaGuard) { state.battle.opheliaGuard.remainingHits = p.remainingHits; if (p.groupCard) state.battle.opheliaGuard.groupCard = p.groupCard; }
      else if (p.remainingHits > 0) state.battle.manualDodgeResume = p;
      else if (groupCard?.targetUids?.length && groupCard.nextTargetIndex != null) state.battle.demonInvasionResume = { ...p, card: groupCard, targetUids: groupCard.targetUids, nextTargetIndex: groupCard.nextTargetIndex };
      if (onStep) onStep(); await waitEffects(); if (!current()) return;
    }
  }
  async function resumeDemonInvasion(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    while (current() && state.battle?.demonInvasionResume && !state.battle.locked) {
      const b = state.battle, p = b.demonInvasionResume, units = new Map(allUnits(b).map(u => [u.uid, u])), actor = units.get(p.actorUid), idx = p.nextTargetIndex || 0, uid = p.targetUids?.[idx], target = units.get(uid), times = p.card?.sweep ? (p.card.gatlingRepeats || 1) : 1;
      b.demonInvasionResume = null;
      if (!actor || !uid) return;
      const groupCard = { ...p.card, targetUids: p.targetUids, nextTargetIndex: idx + 1 };
      let targetCard = groupCard;
      if (target?.hp > 0 && window.CardUtils?.isKillCard?.(groupCard)) {
        if (window.EnemySkills?.prepareGroupKillTarget) targetCard = window.EnemySkills.prepareGroupKillTarget(state, actor, target, groupCard) || groupCard;
        else if (groupCard._risaTargetedHit) {
          if (targetCard._tempIgnoreResponse) { delete targetCard.ignoreResponse; delete targetCard._tempIgnoreResponse; }
          window.SakuraRisaSkills?.beforeKillTargeted?.(state, actor, target, targetCard);
        }
      }
      if (target?.hp > 0) for (let i = 0; i < times && target.hp > 0; i++) {
        const hitCard = { ...targetCard };
        const result = combat.damage(state, target, p.amount, p.source, actor, hitCard);
        combat.recordDeferredHit?.(state, actor, target, hitCard, result);
        const group = { card: p.card, targetUids: p.targetUids, nextTargetIndex: idx + 1 };
        if (window.BattleReactionQueue?.captureHitContinuation?.(b, actor, target, p.amount, p.source, targetCard, times - i - 1, group)) break;
      }
      if (!state.battle?.locked && p.targetUids && idx + 1 < p.targetUids.length) state.battle.demonInvasionResume = { ...p, nextTargetIndex: idx + 1 };
      if (onStep) onStep(); await waitEffects(); if (!current()) return;
    }
  }
  return {
    cancelThunderHammer,
    resolveThunderHammer,
    resolveManualDodge,
    confirmDeflectResult,
    resolveManualCounter,
    continueAfterCadicisResponsibility,
    resumeAfterManualResponse,
    resumeInterruptedActions,
    continueAfterInterruptedActions,
  };
};
