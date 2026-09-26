window.RuinsDragonSkills = (() => {
  const alive = units => (units || []).filter(unit => unit.hp > 0);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? unit.tempAttack || 0 : 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  const suits = ["♥", "♦", "♠", "♣"];
  // 死亡音波的实现拆分到 ruins-dragon-deathwave.js（主文件 200 行硬约束）。
  const DW = new Proxy({}, { get: (_, key) => window.RuinsDragonDeathWave?.[key] });

  function prepare(state, unit) {
    if (unit?.ai !== "ruins_dragon") return;
    unit.ruinsHitsThisTurn = 0;
    // 死亡音波的记录仅在「龙结束阶段记录 → 我方角色回合内判定」这一轮内有效，
    // 龙自己回合开始时清空，避免上一轮的花色残留到下一轮（头像徽章常驻）。
    unit.ruinsDeathWaveSuits = [];
    unit.ruinsDeathWaveSuit = null;
  }

  // 电钻火花：描述为「你使用单体【杀】牌造成伤害时」——须在真正造成生命值伤害之后
  // 才摇骰追加。此前挂在 beforeKillUsed（出牌时、结算之前），被【闪】抵消
  // 时次数也已追加，与描述不符。
  // 追加形式由「增加杀的结算次数」改为「追加多段伤害」（与卡洛斯疯狂刺刀一致）：
  // 增加 gatlingRepeats 会把整张杀重跑一遍（每段都重新走一次完整出牌结算），
  // 现改为按骰子点数直接追加等量攻击力伤害段。
  function dragonDrill(state, actor, target, card, directDamage) {
    if (!window.CardUtils?.isSingleKill?.(card) && !card?.dragonDrill) return;
    if (card._dragonDrillApplied) return;
    card._dragonDrillApplied = true;
    const roll = window.GameRandom?.int?.(1, 6, state) || 3;
    state.battle?.animQueue?.push({
      type: "dice", id: window.GameRandom?.id?.("dr") || "dr",
      value: roll, skill: "电钻火花", uid: actor.uid,
    });
    window.BattleLines?.skill?.(state, actor, "电钻火花");
    log(state,
      `${actor.name} 发动电钻火花，骰子点数${roll}，追加${roll}次攻击力伤害。`);
    if (!directDamage || !target) return;
    const amount = Math.max(0, stat(actor, "attack"));
    // 追加段沿用 _drillExtraHit：整张杀仍属同一次攻击，反击只应在第一段触发，
    // 否则骰子点数会线性放大反击次数。
    const extraCard = {
      name: "电钻火花", type: "skill", _drillExtraHit: true,
      ignoreResponse: true, skipDamageModify: true,
    };
    // 优先排入反应队列：交牌/护驾等弹窗期间 battle.locked 为真，
    // 直接调 directDamage 会被 locked 分支整段吞掉（返回 hpLoss 0）。
    // 队列在解锁后才 flush，追加段因此不会丢失。
    const actions = [];
    for (let index = 0; index < roll; index += 1) {
      const action = window.BattleReactionQueue?.directDamageAction?.(
        actor, target, amount, "电钻火花", { ...extraCard }, 120 * index);
      if (action) actions.push(action);
    }
    if (actions.length
      && window.BattleReactionQueue?.enqueue?.(state, actions)) return;
    for (let index = 0; index < roll && target.hp > 0; index += 1) {
      directDamage(
        state, target, amount, "电钻火花", actor, 120 * index, extraCard);
    }
  }

  function afterDamage(state, actor, target, card, hpLoss, damage, directDamage = null) {
    if (!actor || !hpLoss) return;
    if (actor.ai === "ruins_dragon") {
      dragonDrill(state, actor, target, card, directDamage);
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
    // 阈值为「当前手牌数」。此前写成 visible(...).length || dragon.handLimit，
    // 手牌数为 0 时 0 是 falsy，阈值退化为手牌上限（4），触发条件变成「攒够手牌上限
    // 次攻击」而非「手牌数次」，与描述不符。
    const threshold = Math.max(1, visible(dragon).length);
    if (dragon.ruinsHitsThisTurn < threshold || dragon.ruinsGunFired) return;
    dragon.ruinsGunFired = true;
    fireTailGun(state, dragon, damage);
  }

  function fireTailGun(state, dragon, damage) {
    const targets = alive(state.battle.allies);
    if (!targets.length) return;
    const amount = stat(dragon, "attack");
    // 描述为「视为使用一张虚拟【机枪扫杀】」：必须以实体牌【机枪扫杀】为模板建虚拟牌，
    // 才能继承 type:"slash" / sweep:true / targetless:true / scale:"attack" 等原牌字段。
    // 此前是手搓 { name:"机尾机枪", type:"skill" }，既不是杀牌，也没有 allTargets /
    // aoeLineShown，导致：①不绘制全体目标线；②isGroupTargetCard 判 false，群体牌
    // 相关判定（群体响应口径、群体触发、目标线渲染）全部失效。
    // responseKind:"dodge" 保留：真正的【机枪扫杀】靠它才进响应判定，可被【闪】响应。
    const card = window.CardUtils.fromEntity("机枪扫杀", {
      allTargets: targets.map(unit => unit.uid),
      aoeLineShown: true,
      responseKind: "dodge",
      // 本牌是技能生成的虚拟牌，不走普通出牌的暴击表现。
      // 改成以【机枪扫杀】为模板后 isKillCard 成立、攻击力 13 ≥ 5，
      // 会命中 battle-damage-hit 的 critical 判定，飘字被放大 1.3 倍并加粒子，
      // 与「锁定技造成技能伤害」的定位不符（数值不变，纯视觉副作用）。
      skipCriticalFx: true,
    });
    let dealt = 0;
    window.BattleLines?.skill?.(state, dragon, "机尾机枪");
    // 全体目标线：与无限暗刃（edis-skills）同一范式，推 virtualPlay 动画。
    state.battle.tailGunSeq = (state.battle.tailGunSeq || 0) + 1;
    state.battle.animQueue?.push({
      type: "virtualPlay", id: `tailgun${state.battle.tailGunSeq}`, uid: dragon.uid,
      targetUids: card.allTargets, card, enemyLine: dragon.side === "enemy", show: true,
    });
    targets.forEach(target => {
      // 护甲按「对每名角色造成的伤害量」累加：直接用 damage 返回的 hpLoss，
      // 被【闪】响应时为 0，不会误给护甲。
      const result = damage(state, target, amount, "机尾机枪", dragon, { ...card });
      dealt += Math.max(0, result?.hpLoss || 0);
    });
    if (dealt > 0) {
      dragon.block = (dragon.block || 0) + dealt;
      window.BattleSystem?.pushFloat?.(state.battle, dragon.uid, "armor-gain", dealt);
      log(state, `${dragon.name} 发动机尾机枪，造成${dealt}点伤害并获得${dealt}点护甲。`);
    }
  }

  function endTurn(state, unit) {
    if (unit?.ai !== "ruins_dragon") {
      DW.checkDeathWave?.(state, unit);
      return;
    }
    DW.recordDeathWave?.(state, unit);
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
    beforeCardPlayed, allyTurnStart, aiMove,
    recordedSuits: unit => DW.recordedSuits?.(unit) || [],
  };
})();
