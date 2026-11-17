window.RuinsWithererSkills = (() => {
  const common = window.RuinsWithererCommon;
  if (!common) throw new Error("[ruins-witherer-common] 凋零者公共 helper 未装配："
    + "ruins-witherer-common.js 必须先于 ruins-witherer-skills.js 加载");
  const {
    alive, visible, stat, log, isTactic, isEntityCard, timeStopped,
  } = common;

  // 魅魔吸精术的「对无性别角色造成的伤害为2倍」：判断的是被打者的性别，
  // 不能放进 modifyDamage（那里 target 恒为凋零者本人，且她自己是女性，条件永不成立），
  // 故改走统一伤害结算链的 outgoing 钩子。
  function modifyOutgoingDamage(state, actor, target, amount, card) {
    if (amount <= 0 || !actor || actor.ai !== "ruins_witherer") return amount;
    if (timeStopped(actor)) return amount;
    // 与外神之眼同一口径：技能伤害、技能生成牌、虚拟牌均不算「你使用的战术牌」。
    if (!isTactic(card) || !isEntityCard(card)) return amount;
    if (target?.gender === "male" || target?.gender === "female") return amount;
    log(state, `${actor.name} 的魅魔吸精术触发，对无性别目标伤害翻倍。`);
    return amount * 2;
  }

  function afterDamage(state, actor, target, card, hpLoss, damage) {
    if (!hpLoss) return;
    if (timeStopped(target) || timeStopped(actor)) return; // 时停：被动技失效
    // 外神之眼只响应实体牌伤害：技能卡、技能生成的虚拟杀、无卡直接伤害均不触发，
    // 否则技能伤害会连锁触发，且与「实体牌」描述不符。
    // 外神之眼逐段结算：多段/连击的每一段只要是实体牌就各自触发一次。
    // （追加段本身是 type:"skill"，isEntityCard 会排除，故电钻火花仍只触发第一段。）
    if (target?.ai === "ruins_witherer" && isEntityCard(card)) {
      // 等本段受击动画演完再驱动外神之眼。
      const confuse = () => eyeOfOuterGod(state, actor, target);
      if (!(damage?.delayUntilHitSettled?.(state, confuse)
        || window.BattleDamageLifecycle?.delayUntilHitSettled?.(state, confuse))) confuse();
    }
    if (actor?.ai === "ruins_witherer" && isTactic(card) && isEntityCard(card)) {
      succubusDrain(state, actor, target, damage);
    }
  }

  if (!window.RuinsWithererVirtualKill) throw new Error("[ruins-witherer-virtual-kill] 模块未装配：ruins-witherer-virtual-kill.js 必须先于 ruins-witherer-skills.js 加载");
  const { eyeOfOuterGod, fireHundredEyes } = window.RuinsWithererVirtualKill({ stat, log });

  function succubusDrain(state, actor, target, damage) {
    if (!target || target.hp <= 0) return;
    if (target.gender === "male") stealFrom(state, actor, target, damage);
    else if (target.gender === "female") discardFrom(state, actor, target);
  }

  function stealFrom(state, actor, target, damage) {
    const candidate = visible(target).find(card =>
      !window.BattleStatusCards?.isStatus?.(card));
    if (!candidate) return;
    const index = target.hand.indexOf(candidate);
    if (index < 0) return;
    target.hand.splice(index, 1);
    if (!candidate.stolenFromUid) candidate.stolenFromUid = target.uid;
    if (state.battle?.animQueue) candidate._pendingDraw = true;
    actor.hand.push(candidate);
    state.battle.animQueue?.push({
      type: "stealCard", fromUid: target.uid, fromSide: target.side,
      toUid: actor.uid, toSide: actor.side, count: 1, cards: [candidate],
    });
    window.BattleLines?.skill?.(state, actor, "魅魔吸精术", target);
    log(state, `${actor.name} 的魅魔吸精术触发，获得${target.name}一张${candidate.suit || ""}${candidate.name}。`);
  }

  function discardFrom(state, actor, target) {
    const candidate = visible(target).find(card =>
      !window.BattleStatusCards?.isStatus?.(card));
    if (!candidate) return;
    const index = target.hand.indexOf(candidate);
    if (index < 0) return;
    target.hand.splice(index, 1);
    window.BattleCards?.put?.(state.battle, target, candidate, "discard", { showDiscard: true });
    window.BattleLines?.skill?.(state, actor, "魅魔吸精术", target);
    log(state, `${actor.name} 的魅魔吸精术触发，弃置${target.name}一张${candidate.suit || ""}${candidate.name}。`);
  }

  function endTurn(state, unit) {
    if (unit?.ai !== "ruins_witherer") return;
    if (timeStopped(unit)) return; // 时停：百眼魅魔不发动，红桃牌也不弃
    const hearts = visible(unit).filter(card => card.suit === "♥");
    if (!hearts.length) return;
    hearts.forEach(card => {
      const index = unit.hand.indexOf(card);
      if (index >= 0) unit.hand.splice(index, 1);
      window.BattleCards?.put?.(state.battle, unit, card, "discard", { showDiscard: true });
    });
    window.BattleLines?.skill?.(state, unit, "百眼魅魔");
    log(state, `${unit.name} 发动百眼魅魔，弃置${hearts.length}张红桃牌。`);
    const allies = alive(state.battle.allies);
    // 逐一驱动，中途被同伴打倒的角色不再行动（描述为「所有敌方角色」，阵亡者不算）。
    //
    // 驱动期间必须推迟交牌窗：半魅魔血（星野海一）受击即触发，会立刻置 locked，
    // 而 resolveCard 开头有 `if (battle.locked) return;`——一旦中途被锁，
    // 排在后面的角色就会被静默跳过，表现为「百眼魅魔只打了一半就断了」
    // （实测 3 人只结算 2 次伤害，第三人毫发无伤也无日志）。
    // 故整段驱动期间只把交牌请求入队，等循环跑完再统一激活。
    const battle = state.battle;
    battle._deferSharePrompts = true;
    try {
      allies.forEach(ally => {
        if (ally.hp <= 0) return;
        fireHundredEyes(state, unit, ally, allies);
      });
    } finally {
      delete battle._deferSharePrompts;
    }
    // HoshinoKaiichiShare / …ShareQueue 都是工厂（需传 alive/allUnits 才返回实例），
    // 直接取 window.HoshinoKaiichiShareQueue.activateShare 会拿到 undefined。
    // 两者只对外暴露各自的子集：…Share 有 activateShare、…ShareQueue 有 scheduleShare。
    const deps = {
      alive: item => !!item && item.hp > 0,
      allUnits: field => (field?.allies || []).concat(field?.enemies || []),
    };
    const share = window.HoshinoKaiichiShare?.(deps);
    if (share?.activateShare?.(state) !== true) {
      window.HoshinoKaiichiShareQueue?.(deps)?.scheduleShare?.(state);
    }
  }

  // AI逻辑：出牌阶段优先使用战术牌对男性角色造成伤害。
  // 只对 1312 本人生效，其余角色拿到的偏好为 null / 0，不影响通用 AI。
  function aiTacticBonus(actor) {
    return actor?.ai === "ruins_witherer" ? 12 : 0;
  }
  function aiTacticTarget(ctx, actor, foes) {
    if (actor?.ai !== "ruins_witherer" || !ctx) return null;
    const males = (ctx.alive?.(foes) || []).filter(unit => unit.gender === "male");
    if (!males.length) return null;
    return ctx.topBy?.(males, unit => -ctx.visible(unit)) || males[0];
  }

  return { modifyOutgoingDamage, afterDamage, endTurn, aiTacticBonus, aiTacticTarget };
})();
