window.RuinsDragonSkills = (() => {
  const alive = units => (units || []).filter(unit => unit.hp > 0);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? unit.tempAttack || 0 : 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  const suits = ["♥", "♦", "♠", "♣"];

  function prepare(state, unit) {
    if (unit?.ai !== "ruins_dragon") return;
    unit.ruinsHitsThisTurn = 0;
  }

  function beforeKillUsed(state, actor, card) {
    if (actor?.ai !== "ruins_dragon") return;
    if (!window.CardUtils?.isSingleKill?.(card) && !card?.dragonDrill) return;
    if (card._dragonDrillApplied) return;
    card._dragonDrillApplied = true;
    const roll = window.GameRandom?.int?.(1, 6, state) || 3;
    card.gatlingRepeats = (card.gatlingRepeats || 1) + roll;
    state.battle?.animQueue?.push({
      type: "dice", id: window.GameRandom?.id?.("dr") || "dr",
      value: roll, skill: "电钻火花", uid: actor.uid,
    });
    window.BattleLines?.skill?.(state, actor, "电钻火花");
    log(state, `${actor.name} 发动电钻火花，骰子点数${roll}，本次杀额外结算${roll}次。`);
  }

  function afterDamage(state, actor, target, card, hpLoss, damage) {
    if (!actor || !hpLoss) return;
    if (actor.ai === "ruins_dragon") return;
    const dragon = (state.battle?.enemies || []).find(unit => unit.ai === "ruins_dragon" && unit.hp > 0);
    if (!dragon) return;
    if (!card?.type || card.type !== "slash") return;
    dragon.ruinsHitsThisTurn = (dragon.ruinsHitsThisTurn || 0) + 1;
    const threshold = Math.max(1, visible(dragon).length || dragon.handLimit || 1);
    if (dragon.ruinsHitsThisTurn < threshold || dragon.ruinsGunFired) return;
    dragon.ruinsGunFired = true;
    fireTailGun(state, dragon, damage);
  }

  function fireTailGun(state, dragon, damage) {
    const targets = alive(state.battle.allies);
    if (!targets.length) return;
    const amount = stat(dragon, "attack");
    const card = {
      name: "机尾机枪", type: "skill", sweep: true, ignoreResponse: true,
      skipDamageModify: true, magicDamage: false,
    };
    let dealt = 0;
    window.BattleLines?.skill?.(state, dragon, "机尾机枪");
    targets.forEach(target => {
      const before = target.hp;
      damage(state, target, amount, "机尾机枪", dragon, { ...card });
      dealt += Math.max(0, before - target.hp);
    });
    if (dealt > 0) {
      dragon.block = (dragon.block || 0) + dealt;
      window.BattleSystem?.pushFloat?.(state.battle, dragon.uid, "armor-gain", dealt);
      log(state, `${dragon.name} 发动机尾机枪，造成${dealt}点伤害并获得${dealt}点护甲。`);
    }
  }

  function endTurn(state, unit) {
    if (unit?.ai !== "ruins_dragon") {
      checkDeathWave(state, unit);
      return;
    }
    recordDeathWave(state, unit);
  }

  function recordDeathWave(state, dragon) {
    const counts = { "♥": 0, "♦": 0, "♠": 0, "♣": 0 };
    visible(dragon).forEach(card => { if (counts[card.suit] != null) counts[card.suit] += 1; });
    let best = null, bestCount = 0;
    suits.forEach(suit => {
      if (counts[suit] > bestCount) { best = suit; bestCount = counts[suit]; }
    });
    dragon.ruinsDeathWaveSuit = best;
    if (best) {
      window.BattleLines?.skill?.(state, dragon, "死亡音波");
      log(state, `${dragon.name} 发动死亡音波，记录${best}花色。`);
      state.battle?.animQueue?.push({
        type: "statusMark", id: window.GameRandom?.id?.("dw") || "dw",
        uid: dragon.uid, mark: best, skill: "死亡音波",
      });
    }
  }

  function checkDeathWave(state, unit) {
    if (!unit || unit.side !== "ally") return;
    const dragon = (state.battle?.enemies || []).find(enemy =>
      enemy.ai === "ruins_dragon" && enemy.hp > 0 && enemy.ruinsDeathWaveSuit);
    if (!dragon) return;
    const suit = dragon.ruinsDeathWaveSuit;
    const used = (unit.suitsUsedThisTurn || {})[suit];
    if (used) return;
    const amount = stat(dragon, "attack");
    const before = unit.hp;
    unit.hp = Math.max(0, unit.hp - amount);
    const loss = before - unit.hp;
    if (loss > 0) {
      window.BattleSystem?.pushFloat?.(state.battle, unit.uid, "hp-loss", loss);
      window.BattleLines?.skill?.(state, dragon, "死亡音波", unit);
      log(state, `${unit.name} 未使用${suit}花色，受到死亡音波${amount}点伤害。`);
    }
  }

  function beforeCardPlayed(state, actor, card) {
    if (!actor || !card || card._skill || card.virtual) return;
    if (actor.side !== "ally") return;
    actor.suitsUsedThisTurn ||= {};
    if (suits.includes(card.suit)) actor.suitsUsedThisTurn[card.suit] = true;
  }

  function allyTurnStart(_state, unit) {
    if (unit?.side === "ally") unit.suitsUsedThisTurn = {};
  }

  function aiMove(state, actor) {
    if (actor?.ai !== "ruins_dragon" || actor.usedDeathWaveRecord) return null;
    return null;
  }

  return {
    prepare, beforeKillUsed, afterDamage, endTurn,
    beforeCardPlayed, allyTurnStart, aiMove,
  };
})();
