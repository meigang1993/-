window.FloraCarlosSkills = (() => {
  const assaultBattles = new WeakMap();
  const alive = u => u && u.hp > 0;
  const visible = u => (u.hand || []).filter(c => !c._pendingDraw);
  const hasSkill = (u, name) => (u?.skills || []).some(s => s.name === name);
  const isKill = c => window.CardUtils.isKillCard(c);
  const singleKill = c => window.CardUtils.isSingleKill(c);
  const stat = (u, k) => (u.stats?.[k] || 0) + (k === "attack" ? (u.tempAttack || 0) : k === "magic" ? (u.tempMagic || 0) : 0);
  const line = (state, unit, name, target) => window.BattleLines?.skill(state, unit, name, target);
  const virtualCard = (name, extra = {}) => window.CardUtils.fromEntity(name, extra);
  const initialDraw = u => Math.max(0, 4 + (u.stats?.initialDraw || 0));
  function handleSpecialCard(state, actor, target, card, deps, ctx) {
    if (card.speedAssault) return speedAssault(
      state, actor, target, card, deps, ctx);
    if (card.crazyShooting) return crazyShooting(state, actor, deps, ctx);
    return false;
  }
  function speedAssault(state, actor, target, sourceCard, deps, ctx) {
    const endPhase = state.battle?.phase === 6;
    const usageKey = endPhase ? "usedSpeedAssaultEnd" : "usedSpeedAssaultPrepare";
    if (actor[usageKey] || !target || target.side === actor.side) return true;
    actor[usageKey] = true; actor.usedSpeedAssault = true; actor.playedSlashThisTurn = true;
    line(state, actor, "神速之袭", target);
    discardOne(state, actor, target);
    const assaultMs =
      window.FloraSonicSkinFX?.assault?.(state, actor, target) || 0;
    const settlement = {
      actorUid: actor.uid, targetUid: target.uid,
      endPhase, draw: deps.draw, queued: false, settled: false, directHit: null,
      notBefore: assaultMs ? Date.now() + assaultMs : 0,
    };
    assaultBattles.set(settlement, state.battle);
    const assaultCard = virtualCard("刺杀", {
      _entitySourceCard: sourceCard, _speedAssaultSettlement: settlement,
    });
    ctx.damage(state, target, stat(actor, "attack"), "神速之袭", actor,
      assaultCard);
    queueSpeedAssaultSettlement(state, assaultCard);
    return true;
  }
  function recordSpeedAssaultHit(state, card, target, hpBefore, hpLoss) {
    const settlement = card?._speedAssaultSettlement;
    if (!settlement || settlement.directHit
      || state.battle !== assaultBattles.get(settlement)) return false;
    const actualLoss = Math.min(Math.max(0, hpBefore || 0), Math.max(0, hpLoss || 0));
    settlement.directHit = {
      targetUid: target?.uid, hpBefore, hpLoss: actualLoss,
      killed: hpBefore > 0 && actualLoss > 0 && target?.hp <= 0
        && !window.SakuraRisaSkills?.pendingRevival?.(target),
    };
    return true;
  }
  function queueSpeedAssaultSettlement(state, card) {
    const settlement = card?._speedAssaultSettlement;
    const battle = state.battle;
    if (!settlement || settlement.settled
      || battle !== assaultBattles.get(settlement) || !battle?.animQueue) return false;
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
      commit: () => commitSpeedAssault(state, settlement),
    };
    battle.animQueue.push(settlement.event);
    return true;
  }
  function commitSpeedAssault(state, settlement) {
    const battle = settlement && assaultBattles.get(settlement);
    if (!settlement || settlement.settled || state.battle !== battle) return false;
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
  function crazyShooting(state, actor, deps, ctx) {
    if (actor.usedCrazyShooting) return true;
    const i = ctx?.selectedCostCard ? ctx.selectedCostCard(actor) : state.battle.selectedCardIndex, cost = actor.hand[i];
    if (!cost || cost._pendingDraw || !["♥", "♦"].includes(cost.suit)) return true;
    actor.usedCrazyShooting = true; actor.hand.splice(i, 1); window.BattleCards?.put(state.battle, actor, cost, "discard");
    line(state, actor, "疯狂射击");
    window.BattleLog.add(state, `${actor.name} 将${cost.suit}${cost.name}转化为机枪扫杀使用。`);
    ctx.useCard(state, actor, actor, window.CardUtils.convertAs(
      "机枪扫杀", cost, { _skipHandMove: true, _entitySourceCard: cost }));
    return true;
  }
  function dodgeAsFlash(state, target, actor, card, deps, excluded = [], canUse = null) {
    if (!target?.skills?.some(s => s.name === "神速之翼")) return null;
    const c = visible(target).find(x => !excluded.includes(x) && (!canUse || canUse({ ...x, name: "闪", type: "response" })));
    if (!c) return null;
    const visualHandBefore = window.BattleCards.visibleHandCount(target);
    target.hand.splice(target.hand.indexOf(c), 1); window.BattleCards?.put(state.battle, target, c, "discard", { skipAnim: true });
    line(state, target, "神速之翼", actor);
    window.FloraSonicSkinFX?.wing?.(state, target, actor);
    window.BattleLog.add(state, `${target.name} 发动神速之翼，将${c.name}转化为闪使用。`);
    const response = { ...c, name: "闪", type: "response", convertedFrom: c.name, _entitySourceCard: c, _visualHandBefore: visualHandBefore };
    deps.afterCardResponded?.(state, target, actor, response, deps);
    return response;
  }
  function afterSlashDamage(state, actor, target, card, hpLoss, api) {
    if (!isKill(card) || target.hp <= 0) return;
    crazyBayonet(state, actor, target, card, hpLoss, api);
    speedBlade(state, actor, target, card, api);
  }
  function crazyBayonet(state, actor, target, card, hpLoss, api) {
    if (!hpLoss || actor?.ref !== "carlos" || !singleKill(card) || card._crazyBayonet) return;
    const n = visible(actor).filter(isKill).length;
    if (!n) return;
    card._crazyBayonet = true;
    line(state, actor, "疯狂刺刀", target);
    const amount = Math.max(0, stat(actor, "attack"));
    window.BattleLog.add(state, `${actor.name} 触发疯狂刺刀，按手牌杀牌数量追加${n}次攻击力伤害。`);
    for (let i = 0; i < n && target.hp > 0; i++) api.directDamage(state, target, amount, "疯狂刺刀", actor, 120 * i);
  }
  function speedBlade(state, actor, target, card, api) {
    if (!singleKill(card) || card._floraBlade || actor?.side !== "ally"
      || actor.ref === "flora" || target?.side !== "enemy") return;
    const flora = state.battle?.allies.find(u => u.ref === "flora"
      && u.uid !== actor.uid && alive(u) && hasSkill(u, "神速飞剑"));
    if (!flora || !alive(target)) return;
    const battle = state.battle;
    const turnNo = battle.turn || 0;
    if (battle.floraBladeTurn !== turnNo) {
      battle.floraBladeTurn = turnNo;
      battle.floraBladeTargets = [];
    }
    battle.floraBladeTargets ||= [];
    if (battle.floraBladeTargets?.includes(target.uid)) return;
    battle.floraBladeTargets.push(target.uid);
    card._floraBlade = true;
    line(state, flora, "神速飞剑", target);
    window.FloraSonicSkinFX?.flyingBlade?.(state, flora, target);
    window.BattleLog.add(state, `${flora.name}：有破绽，机会来了，看我神速飞剑。`);
    discardOne(state, flora, target);
    const slash = virtualCard("刺杀", { _floraBlade: true });
    if (window.FloraSonicSkinFX?.active?.(flora)) {
      slash._playedFlightDone = true;
      slash._playedTargetUid = target.uid;
    }
    api.damage(state, target, stat(flora, "attack"), "神速飞剑", flora, slash);
  }
  function discardOne(state, actor, target) {
    const i = target.hand.findIndex(c => !c._pendingDraw);
    if (i < 0) return;
    const d = target.hand.splice(i, 1)[0]; window.BattleCards?.put(state.battle, target, d, "discard", { forcedDiscard: true });
    window.BattleLog.add(state, `${actor.name} 的刺杀弃置${target.name}一张${d.name}。`);
  }
  return {
    handleSpecialCard, dodgeAsFlash, afterSlashDamage,
    recordSpeedAssaultHit, queueSpeedAssaultSettlement,
  };
})();
