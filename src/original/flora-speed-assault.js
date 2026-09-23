window.FloraSpeedAssault = (() => {
  const assaultBattles = new WeakMap();
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? (unit.tempAttack || 0)
      : key === "magic" ? (unit.tempMagic || 0) : 0);
  const initialDraw = unit => Math.max(
    0, 4 + (unit.stats?.initialDraw || 0));
  function discardOne(state, actor, target) {
    const index = target.hand.findIndex(card => !card._pendingDraw);
    if (index < 0) return;
    const discarded = target.hand.splice(index, 1)[0];
    window.BattleCards?.put(state.battle, target, discarded, "discard",
      { forcedDiscard: true });
    window.BattleLog.add(state,
      `${actor.name} 的刺杀弃置${target.name}一张${discarded.name}。`);
  }
  function use(state, actor, target, sourceCard, deps, ctx) {
    const endPhase = state.battle?.phase === 6;
    const usageKey = endPhase
      ? "usedSpeedAssaultEnd" : "usedSpeedAssaultPrepare";
    if (actor[usageKey] || !target || target.side === actor.side) return true;
    actor[usageKey] = true;
    actor.usedSpeedAssault = true;
    actor.playedSlashThisTurn = true;
    window.BattleLines?.skill(state, actor, "神速之袭", target);
    discardOne(state, actor, target);
    const assaultMs =
      window.FloraSonicSkinFX?.assault?.(state, actor, target) || 0;
    const settlement = {
      actorUid: actor.uid,
      targetUid: target.uid,
      endPhase,
      draw: deps.draw,
      queued: false,
      settled: false,
      directHit: null,
      notBefore: assaultMs ? Date.now() + assaultMs : 0,
    };
    assaultBattles.set(settlement, state.battle);
    const assaultCard = window.CardUtils.fromEntity("刺杀", {
      _entitySourceCard: sourceCard,
      _speedAssaultSettlement: settlement,
    });
    ctx.damage(state, target, stat(actor, "attack"), "神速之袭", actor,
      assaultCard);
    queueSettlement(state, assaultCard);
    return true;
  }
  function recordHit(state, card, target, hpBefore, hpLoss) {
    const settlement = card?._speedAssaultSettlement;
    if (!settlement || settlement.directHit
      || state.battle !== assaultBattles.get(settlement)) return false;
    const actualLoss = Math.min(
      Math.max(0, hpBefore || 0), Math.max(0, hpLoss || 0));
    settlement.directHit = {
      targetUid: target?.uid,
      hpBefore,
      hpLoss: actualLoss,
      killed: hpBefore > 0 && actualLoss > 0 && target?.hp <= 0
        && !window.SakuraRisaSkills?.pendingRevival?.(target),
    };
    return true;
  }
  function queueSettlement(state, card) {
    const settlement = card?._speedAssaultSettlement;
    const battle = state.battle;
    if (!settlement || settlement.settled
      || battle !== assaultBattles.get(settlement)
      || !battle?.animQueue) return false;
    if (settlement.queued) {
      const index = battle.animQueue.indexOf(settlement.event);
      if (index >= 0 && index !== battle.animQueue.length - 1) {
        battle.animQueue.splice(index, 1);
        battle.animQueue.push(settlement.event);
      }
      return index >= 0;
    }
    if (battle.locked && !settlement.directHit) return false;
    settlement.queued = true;
    settlement.event = {
      type: "battleCommit",
      notBefore: settlement.notBefore,
      runtimeRecovery: "restart",
      commit: () => commit(state, settlement),
    };
    battle.animQueue.push(settlement.event);
    return true;
  }
  function commit(state, settlement) {
    const battle = settlement && assaultBattles.get(settlement);
    if (!settlement || settlement.settled || state.battle !== battle) {
      return false;
    }
    const actor = battle.allies.concat(battle.enemies || [])
      .find(unit => unit.uid === settlement.actorUid);
    if (!actor) return false;
    if (settlement.directHit?.killed) {
      if (!settlement.defeatFxDone) {
        window.FloraSonicSkinFX?.assaultDefeat?.(state, actor);
        settlement.defeatFxDone = true;
      }
      if (!settlement.rewardDone) {
        const count = initialDraw(actor);
        settlement.rewardText = window.BattleDrawTransaction.run(
          state, battle, () => {
            const drawn = settlement.draw(actor, count, battle);
            return window.BattleDrawFeedback.action(actor, count, drawn);
          });
        settlement.rewardDone = true;
      }
      if (!settlement.rewardLogDone) {
        window.BattleLog.add(state,
          `${actor.name} 击杀目标，神速之袭${settlement.rewardText}。`);
        settlement.rewardLogDone = true;
      }
    }
    if (settlement.endPhase && actor.hp > 0 && !settlement.faceDownDone) {
      window.GuardKellySkills?.markFaceDown?.(state, actor);
      settlement.faceDownDone = true;
    }
    settlement.settled = true;
    return true;
  }
  return { use, recordHit, queueSettlement };
})();
