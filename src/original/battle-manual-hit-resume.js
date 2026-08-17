window.BattleManualHitResume = ({
  allUnits, combat, waitEffects, actionGuard,
}) => {
  async function resolveManualResume(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    while (current() && state.battle?.manualDodgeResume
      && !state.battle.locked) {
      const pending = state.battle.manualDodgeResume;
      const actor = allUnits(state.battle)
        .find(unit => unit.uid === pending.actorUid);
      const target = allUnits(state.battle)
        .find(unit => unit.uid === pending.targetUid);
      state.battle.manualDodgeResume = null;
      if (!actor || actor.hp <= 0) return;
      const groupCard = pending.groupCard || pending.card;
      if (!target || target.hp <= 0) {
        if (groupCard?.targetUids?.length
          && groupCard.nextTargetIndex != null) {
          state.battle.demonInvasionResume = {
            ...pending,
            card: groupCard,
            targetUids: groupCard.targetUids,
            nextTargetIndex: groupCard.nextTargetIndex,
          };
        }
        continue;
      }
      pending.remainingHits = Math.max(0, (pending.remainingHits || 0) - 1);
      const hitCard = { ...pending.card };
      const result = combat.damage(
        state, target, pending.amount, pending.source, actor, hitCard);
      combat.recordDeferredHit?.(
        state, actor, target, hitCard, result);
      if (state.battle?.manualDodge) {
        state.battle.manualDodge.remainingHits = pending.remainingHits;
        if (pending.groupCard) {
          state.battle.manualDodge.groupCard = pending.groupCard;
        }
      } else if (state.battle?.opheliaGuard) {
        state.battle.opheliaGuard.remainingHits = pending.remainingHits;
        if (pending.groupCard) {
          state.battle.opheliaGuard.groupCard = pending.groupCard;
        }
      } else if (pending.remainingHits > 0) {
        state.battle.manualDodgeResume = pending;
      } else if (groupCard?.targetUids?.length
        && groupCard.nextTargetIndex != null) {
        state.battle.demonInvasionResume = {
          ...pending,
          card: groupCard,
          targetUids: groupCard.targetUids,
          nextTargetIndex: groupCard.nextTargetIndex,
        };
      }
      onStep?.();
      await waitEffects();
      if (!current()) return;
    }
  }
  async function resumeDemonInvasion(state, onStep, inherited) {
    const current = actionGuard(state, inherited);
    while (current() && state.battle?.demonInvasionResume
      && !state.battle.locked) {
      const battle = state.battle;
      const pending = battle.demonInvasionResume;
      const units = new Map(allUnits(battle).map(unit => [unit.uid, unit]));
      const actor = units.get(pending.actorUid);
      const index = pending.nextTargetIndex || 0;
      const uid = pending.targetUids?.[index];
      const target = units.get(uid);
      const times = pending.card?.sweep
        ? (pending.card.gatlingRepeats || 1) : 1;
      battle.demonInvasionResume = null;
      if (!actor || !uid) return;
      const groupCard = {
        ...pending.card,
        targetUids: pending.targetUids,
        nextTargetIndex: index + 1,
      };
      let targetCard = groupCard;
      if (target?.hp > 0 && window.CardUtils?.isKillCard?.(groupCard)) {
        if (window.EnemySkills?.prepareGroupKillTarget) {
          targetCard = window.EnemySkills.prepareGroupKillTarget(
            state, actor, target, groupCard) || groupCard;
        } else if (groupCard._risaTargetedHit) {
          if (targetCard._tempIgnoreResponse) {
            delete targetCard.ignoreResponse;
            delete targetCard._tempIgnoreResponse;
          }
          window.SakuraRisaSkills?.beforeKillTargeted?.(
            state, actor, target, targetCard);
        }
      }
      if (target?.hp > 0) {
        for (let hitIndex = 0;
          hitIndex < times && target.hp > 0; hitIndex += 1) {
          const hitCard = { ...targetCard };
          const result = combat.damage(
            state, target, pending.amount, pending.source, actor, hitCard);
          combat.recordDeferredHit?.(
            state, actor, target, hitCard, result);
          const group = {
            card: pending.card,
            targetUids: pending.targetUids,
            nextTargetIndex: index + 1,
          };
          if (window.BattleReactionQueue?.captureHitContinuation?.(
            battle, actor, target, pending.amount, pending.source,
            targetCard, times - hitIndex - 1, group)) break;
        }
      }
      if (!state.battle?.locked && pending.targetUids
        && index + 1 < pending.targetUids.length) {
        state.battle.demonInvasionResume = {
          ...pending, nextTargetIndex: index + 1,
        };
      }
      onStep?.();
      await waitEffects();
      if (!current()) return;
    }
  }
  return { resolveManualResume, resumeDemonInvasion };
};
