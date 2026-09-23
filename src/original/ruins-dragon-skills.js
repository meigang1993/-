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
    // 死亡音波的记录仅在「龙结束阶段记录 → 我方角色回合内判定」这一轮内有效，
    // 龙自己回合开始时清空，避免上一轮的花色残留到下一轮（头像徽章常驻）。
    unit.ruinsDeathWaveSuits = [];
    unit.ruinsDeathWaveSuit = null;
  }

  // 电钻火花：描述为「你使用单体【杀】牌造成伤害时」——须在真正造成生命值伤害之后
  // 才摇骰追加结算次数。此前挂在 beforeKillUsed（出牌时、结算之前），被【闪】抵消
  // 时次数也已追加，与描述不符。
  function dragonDrill(state, actor, card) {
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
    if (actor.ai === "ruins_dragon") {
      dragonDrill(state, actor, card);
      return;
    }
    const dragon = (state.battle?.enemies || []).find(unit => unit.ai === "ruins_dragon" && unit.hp > 0);
    if (!dragon) return;
    if (!card?.type || card.type !== "slash") return;
    // 必须是"龙自己受到攻击"才计数：描述为「当你受到攻击次数达到你手牌数时」。
    // 此前只判攻击者与牌型，未校验受击者，导致打龙以外的目标也会累计，
    // 龙挨不到打也能发动机尾机枪。
    if (!target || target.uid !== dragon.uid) return;
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

  // 兼容旧存档字段 ruinsDeathWaveSuit（单花色）
  const recordedSuits = unit => (Array.isArray(unit?.ruinsDeathWaveSuits)
    ? unit.ruinsDeathWaveSuits.filter(suit => suits.includes(suit))
    : (suits.includes(unit?.ruinsDeathWaveSuit) ? [unit.ruinsDeathWaveSuit] : []));

  function recordDeathWave(state, dragon) {
    const counts = { "♥": 0, "♦": 0, "♠": 0, "♣": 0 };
    visible(dragon).forEach(card => { if (counts[card.suit] != null) counts[card.suit] += 1; });
    // 「记录手中1-3张牌的花色」：按手中张数从多到少取前3种花色，去重后不足3种则按实际数量。
    const picked = suits
      .filter(suit => counts[suit] > 0)
      .sort((left, right) => counts[right] - counts[left]
        || suits.indexOf(left) - suits.indexOf(right))
      .slice(0, 3);
    dragon.ruinsDeathWaveSuits = picked;
    dragon.ruinsDeathWaveSuit = null;
    if (!picked.length) return;
    window.BattleLines?.skill?.(state, dragon, "死亡音波");
    log(state, `${dragon.name} 发动死亡音波，记录${picked.join("、")}花色。`);
    state.battle?.animQueue?.push({
      type: "statusMark", id: window.GameRandom?.id?.("dw") || "dw",
      uid: dragon.uid, mark: picked.join(""), skill: "死亡音波",
    });
  }

  function checkDeathWave(state, unit) {
    if (!unit || unit.side !== "ally") return;
    const dragon = (state.battle?.enemies || []).find(enemy =>
      enemy.ai === "ruins_dragon" && enemy.hp > 0 && recordedSuits(enemy).length);
    if (!dragon) return;
    const recorded = recordedSuits(dragon);
    const used = unit.suitsUsedThisTurn || {};
    // 「未能使用你记录的花色」：记录的花色里只要有没用上的，回合结束就受伤一次。
    const missing = recorded.filter(suit => !used[suit]);
    // 「未能使用你记录的花色」：用上记录的任一花色即视为已使用，不触发伤害；
    // 仅当记录的花色全部未使用时才受伤。此前实现为「任一未使用即受伤」，记录 1-3 种
    // 花色时，用掉其中一种仍会挨打，与描述不符（实战用例 C 复现）。
    if (missing.length < recorded.length) return;
    const amount = stat(dragon, "attack");
    const before = unit.hp;
    unit.hp = Math.max(0, unit.hp - amount);
    const loss = before - unit.hp;
    if (loss > 0) {
      window.BattleSystem?.pushFloat?.(state.battle, unit.uid, "hp-loss", loss);
      window.BattleLines?.skill?.(state, dragon, "死亡音波", unit);
      log(state, `${unit.name} 未使用${missing.join("、")}花色，受到死亡音波${amount}点伤害。`);
    }
  }

  function beforeCardPlayed(state, actor, card) {
    if (!actor || !card || card._skill || card.virtual) return;
    if (actor.side !== "ally") return;
    actor.suitsUsedThisTurn ||= {};
    if (suits.includes(card.suit)) actor.suitsUsedThisTurn[card.suit] = true;
  }

  function allyTurnStart(state, unit) {
    if (unit?.side !== "ally") return;
    unit.suitsUsedThisTurn = {};
    // 机尾机枪是「敌方一名角色出牌阶段…每名角色回合限一次」——因此每个友方角色
    // 回合开始时都要重置受击计数与开火标记。此前 ruinsGunFired 从不重置，实际
    // 变成了每场战斗限一次。
    const dragon = (state?.battle?.enemies || []).find(enemy =>
      enemy.ai === "ruins_dragon" && enemy.hp > 0);
    if (!dragon) return;
    dragon.ruinsHitsThisTurn = 0;
    dragon.ruinsGunFired = false;
  }

  function aiMove(state, actor) {
    if (actor?.ai !== "ruins_dragon") return null;
    // AI：出牌阶段优先使用单体【杀】——电钻火花按骰子点数追加攻击次数，
    // 单体杀是伤害主轴，抢在战术牌之前出。
    if ((actor.intent || 0) <= 0) return null;
    const slash = visible(actor).find(card => window.CardUtils?.isSingleKill?.(card));
    if (!slash) return null;
    const targets = alive(state?.battle?.allies || []);
    if (!targets.length) return null;
    const target = targets.slice().sort((left, right) => left.hp - right.hp)[0];
    return { card: slash, target };
  }

  return {
    prepare, afterDamage, endTurn,
    beforeCardPlayed, allyTurnStart, aiMove, recordedSuits,
  };
})();
