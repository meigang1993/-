window.EnemySkills = (() => {
  const alive = units => units.filter(unit => unit.hp > 0);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? unit.tempAttack || 0 : 0)
    + (key === "magic" ? unit.tempMagic || 0 : 0);
  const black = card => card.suit === "♠" || card.suit === "♣";
  const validSuit = card => ["♠", "♥", "♣", "♦"].includes(card?.suit);
  const hasSkill = (unit, name) => unit.skills?.some(skill => skill.name === name);
  const markStatus = (target, status) => {
    target.statuses ||= [];
    if (!target.statuses.includes(status)) target.statuses.push(status);
  };
  const drawJudge = (battle, actor, skill, successOf) => {
    window.BattlePileStats?.reshuffle(actor);
    const card = actor.deck.pop() || { suit: "♠", name: "判定" };
    const success = successOf(card);
    const id = window.GameRandom.id("jg");
    window.BattleSystem?.holdVisual?.(actor);
    if (!card._pendingDraw) actor.discard.push(card);
    const event = {
      type: "judgement", id, skill, suit: card.suit, name: card.name, card,
      discardTo: actor.discard, success, color: black(card) ? "black" : "red", uid: actor.uid,
    };
    battle.animQueue?.push(event);
    return { card, success, event };
  };
  const discardOne = unit => {
    const index = unit.hand.findIndex(card => !card._pendingDraw);
    return index >= 0 ? unit.hand.splice(index, 1)[0] : null;
  };
  const hpPct = unit => unit.hp / Math.max(1, unit.maxHp || unit.stats?.maxHp || 1);
  const isKillName = card => card?.type === "slash" || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  const cardRisk = card => (isKillName(card) ? 3 : 0) + (card.name === "闪" ? 2 : 0)
    + (card.counterTactic ? 2 : 0) + (card.heal || card.healPct || card.teamHealPct ? 1 : 0);
  const machine = window.MachineFactorySkills({ alive, stat, black, hpPct, markStatus, drawJudge });
  const status = window.EnemyStatusEffects({ alive, markStatus });
  const hooks = window.EnemyCombatHooks({
    black, hasSkill, drawJudge, machine, discardOne, status,
  });
  const tactical = window.EnemyTacticalSkills({
    alive, stat, validSuit, cardRisk, discardOne, status,
  });

  function prepare(state, unit, damage, nextAnim) {
    const battle = state.battle;
    if (battle.enemyPrepareUnitUid !== unit.uid) {
      battle.enemyPrepareUnitUid = unit.uid;
      battle.enemyPrepareStep = 0;
      battle.enemyPrepareHandled = false;
    }
    while (!battle.locked && battle.enemyPrepareStep < 4) {
      const step = battle.enemyPrepareStep++;
      if (step === 0) window.OrcDungeonSkills?.prepare?.(state, unit);
      if (step === 1) window.WithererSkills?.prepare?.(state, unit, damage);
      if (step === 2) {
        battle.enemyPrepareHandled = !!(window.RuinsEnemySkills?.prepare?.(state, unit, damage)
          || window.UnderwaterTrainSkills?.prepare?.(state, unit, damage)
          || window.AbeMikeSkills?.prepare?.(state, unit, damage));
      }
      if (step === 3 && !battle.enemyPrepareHandled) {
        if (unit.ai === "succubus") succubusPrepare(state, unit, damage);
        else machine.prepare(state, unit, damage, nextAnim);
      }
      if (battle.locked
        || window.BattleCounterTriggers?.pending?.(battle)
        || window.BattleReactionQueue?.pending?.(battle)) return false;
    }
    if (battle.locked) return false;
    delete battle.enemyPrepareUnitUid;
    delete battle.enemyPrepareStep;
    delete battle.enemyPrepareHandled;
    return true;
  }

  function succubusPrepare(state, unit, damage) {
    const targets = alive(state.battle.allies);
    const target = window.GameRandom.sample(targets, state);
    if (!target) return;
    const { actorCard, targetCard, success } = window.BattlePileStats.clash(unit, target);
    const event = {
      type: "clash",
      ...window.BattlePileStats.clashSnapshot({ actorCard, targetCard }),
      a: actorCard?.suit || "无", t: targetCard?.suit || "无",
      result: success ? "成功" : "抵抗", targetUid: success ? null : unit.uid,
      id: `cl${Date.now()}`, uid: unit.uid,
    };
    state.battle.lastClash = event;
    state.battle.animQueue?.push(event);
    window.BattleLines?.skill(state, unit, "爱之鞭挞");
    window.BattleLog.add(state, `机器魅魔发动爱之鞭挞：${event.a} 对 ${event.t}，${success ? "拼花成功" : "拼花失败"}。`);
    if (success) {
      damage(state, target, unit.hand.filter(card => card.suit === "♥" && !card._pendingDraw).length
        + stat(unit, "magic"), "爱之鞭挞", unit, {
        name: "爱之鞭挞", type: "skill", magicDamage: true, ignoreResponse: true,
      });
    }
  }

  function endTurn(state, unit, draw, damage) {
    window.EdisSkills?.onTurnEnd?.(state, unit);
    window.AbeMikeSkills?.endTurn?.(state, unit, damage);
    window.OrcDungeonSkills?.endTurn?.(state, unit, damage);
    window.WithererSkills?.endTurn?.(state, unit);
    window.RuinsEnemySkills?.endTurn?.(state, unit);
    window.GuardKellySkills?.endTurn?.(state, unit, draw);
    if (unit.ai === "radar") unit.radarUsed = false;
    if (unit.ai === "krow_doctor") unit.grenadeUsed = false;
    machine.endTurn(unit);
    if (unit.ai !== "elrana_clone") return;
    const red = unit.hand.filter(card => !card._pendingDraw && !black(card)).length;
    const value = red + stat(unit, "magic");
    const healed = Math.min(unit.maxHp - unit.hp, value);
    unit.hp = Math.min(unit.maxHp, unit.hp + value);
    if (!healed) return;
    window.BattleStats?.heal?.(state.battle, unit, healed);
    status.clearHolyScar(state, unit);
    window.BattleLines?.skill(state, unit, "再生之躯");
    window.BattleLog.add(state, `${unit.name} 触发再生之躯，恢复${healed}点生命。`);
    status.onHeal(state, draw);
  }

  function resolveReactionAction(state, action, damage) {
    if (action?.kind === "machineHammer") {
      const units = state.battle?.allies.concat(state.battle.enemies) || [];
      const actor = units.find(unit => unit.uid === action.actorUid);
      const target = units.find(unit => unit.uid === action.targetUid && unit.hp > 0);
      return !actor || !target || machine.resolveHammerTarget(state, actor, target, damage);
    }
    return window.OrcDungeonSkills?.resolveReactionAction?.(state, action, damage) || false;
  }

  return {
    prepare, radarMove: tactical.radarMove, grenadeMove: tactical.grenadeMove,
    hammerMove: (_state, actor) => machine.hammerMove(actor),
    useRadar: tactical.useRadar, useGrenade: tactical.useGrenade,
    useHammer: (state, actor, damage) => machine.useHammer(state, actor, damage),
    addPoison: status.addPoison, addShock: status.addShock,
    absorbDefense: (state, target, amount, meta) => machine.absorbDefense(state, target, amount, meta),
    beforeHeal: (state, target, amount, actor, card, damage) =>
      window.EdisSkills?.beforeHeal?.(state, target, amount, actor, card, damage),
    clearHolyScar: status.clearHolyScar, onHeal: status.onHeal, tickPoison: status.tickPoison,
    beforeKillUsed: hooks.beforeKillUsed,
    beforeKillTargeted: (state, actor, target, card) => {
      hooks.beforeKillTargeted(state, actor, target, card);
      window.RuinsEnemySkills?.beforeKillTargeted?.(state, actor, target, card);
    },
    prepareGroupKillTarget: hooks.prepareGroupKillTarget,
    modifyDamage: (state, target, amount, card) => {
      const base = hooks.modifyDamage(state, target, amount, card);
      return window.RuinsEnemySkills?.modifyDamage?.(state, target, base, card) ?? base;
    },
    afterDamage: (state, actor, target, card, hpLoss, damage) => {
      hooks.afterDamage(state, actor, target, card, hpLoss, damage);
      window.RuinsEnemySkills?.afterDamage?.(state, actor, target, card, hpLoss, damage);
    },
    endTurn, resolveReactionAction,
  };
})();
