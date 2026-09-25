window.RuinsWithererSkills = (() => {
  const alive = units => (units || []).filter(unit => unit.hp > 0);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? unit.tempAttack || 0 : 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  const isTactic = card => card?.type === "tactic";
  // 实体牌：非技能伤害、非技能生成、非虚拟牌。
  // 判定必须与 CardUtils.isEntityKillCard（isKillCard && !card.virtual）保持一致：
  // 只要带 virtual 就不是实体牌，没有任何例外。
  // 转换杀走 CardUtils.convertAs 生成，带 convertedFrom 且不带 virtual，天然算实体牌；
  // 而 CardUtils.fromEntity 生成的虚拟牌一律带 virtual:true——即便它额外挂了
  // _entitySourceCard（如芙萝娅【神速之袭】的虚拟【刺杀】），也仍是虚拟牌，不能算实体。
  // 注意：燃烧/毒/感电/勒脖/锁魂镰刀/机尾机枪等技能伤害传的是 type:"skill" 的
  // 伤害载荷，既不带 _skill 也不带 virtual，必须按 type 排除，否则会被误判成实体牌。
  // "skill" 不在卡牌类型（slash/response/tactic/consume/obstacle）之内，可安全排除。
  // 饰品主动技把「实体手牌」转换而成的牌走 CardUtils.convertAs：带 convertedFrom、
  // 不带 virtual，本质是实体牌，因此额外标了 _entityConversion，此处视为实体牌。
  // 不能靠删掉 _skill 来实现：_skill 同时被伤害加成计算（battle-combat-attack-values.js）
  // 等多个位置依赖，删除会改变伤害值。
  // 已标注：魅魔钢叉、鬼王扑克、刺客胶衣（三件 convertAs 饰品口径统一）。
  const isEntityCard = card => !!card && card?.type !== "skill"
    && !card.generatedBySkill && !card.virtual
    && (!card._skill || !!card._entityConversion);

  // 魅魔吸精术的「对无性别角色造成的伤害为2倍」：判断的是被打者的性别，
  // 不能放进 modifyDamage（那里 target 恒为凋零者本人，且她自己是女性，条件永不成立），
  // 故改走统一伤害结算链的 outgoing 钩子。
  function modifyOutgoingDamage(state, actor, target, amount, card) {
    if (amount <= 0 || !actor || actor.ai !== "ruins_witherer") return amount;
    // 与外神之眼同一口径：技能伤害、技能生成牌、虚拟牌均不算「你使用的战术牌」。
    if (!isTactic(card) || !isEntityCard(card)) return amount;
    if (target?.gender === "male" || target?.gender === "female") return amount;
    log(state, `${actor.name} 的魅魔吸精术触发，对无性别目标伤害翻倍。`);
    return amount * 2;
  }

  function afterDamage(state, actor, target, card, hpLoss, damage) {
    if (!hpLoss) return;
    // 外神之眼只响应实体牌伤害：技能卡、技能生成的虚拟杀、无卡直接伤害均不触发，
    // 否则技能伤害会连锁触发，且与「实体牌」描述不符。
    if (target?.ai === "ruins_witherer" && isEntityCard(card)) {
      // 等本段受击动画演完再驱动外神之眼，多段/连击时每段各挂一次。
      const confuse = () => eyeOfOuterGod(state, actor, target);
      if (!(damage?.delayUntilHitSettled?.(state, confuse)
        || window.BattleDamageLifecycle?.delayUntilHitSettled?.(state, confuse))) confuse();
    }
    if (actor?.ai === "ruins_witherer" && isTactic(card) && isEntityCard(card)) {
      succubusDrain(state, actor, target, damage);
    }
  }

  // 外神之眼：受伤后令伤害来源对其同阵营其他存活角色视为使用一张虚拟【杀（普攻）】。
  // 「其他敌方」沿用百眼魅魔的措辞口径——从凋零者视角看，其敌方阵营内的其余角色。
  // 与半魅魔血等受击类一致：多段或连击伤害时逐段结算。
  function eyeOfOuterGod(state, attacker, witherer) {
    if (!attacker || attacker.hp <= 0 || attacker === witherer) return;
    const mates = (attacker.side === "ally"
      ? state.battle?.allies : state.battle?.enemies) || [];
    const others = mates.filter(unit => unit !== attacker && unit.hp > 0);
    window.BattleLines?.skill?.(state, witherer, "外神之眼", attacker);
    if (!others.length) {
      const amount = stat(attacker, "attack");
      const before = attacker.hp;
      attacker.hp = Math.max(0, attacker.hp - amount);
      const loss = before - attacker.hp;
      if (loss > 0) window.BattleSystem?.pushFloat?.(state.battle, attacker.uid, "hp-loss", loss);
      log(state, `${witherer.name} 的外神之眼触发，${attacker.name}无其他敌方角色，对自己造成${amount}点伤害。`);
      return;
    }
    const target = window.GameRandom?.sample?.(others, state) || others[0];
    const virtual = window.CardUtils?.copyPlayable?.(
      { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "" },
      { temporary: true, void: true, noIntentCost: true, generatedBySkill: "外神之眼" });
    if (!virtual) return;
    log(state, `${witherer.name} 的外神之眼触发，使${attacker.name}对${target.name}视为使用一张虚拟【杀】。`);
    window.BattleSystem?.useVirtualKill?.(state, attacker, target, virtual);
  }

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
    allies.forEach(ally => {
      if (ally.hp <= 0) return;
      fireHundredEyes(state, unit, ally, allies);
    });
  }

  function fireHundredEyes(state, witherer, ally, allies) {
    const others = allies.filter(other => other !== ally && other.hp > 0);
    const target = others.length
      ? (window.GameRandom?.sample?.(others, state) || others[0]) : ally;
    if (target === ally) {
      const amount = stat(ally, "attack");
      const before = ally.hp;
      ally.hp = Math.max(0, ally.hp - amount);
      const loss = before - ally.hp;
      if (loss > 0) window.BattleSystem?.pushFloat?.(state.battle, ally.uid, "hp-loss", loss);
      log(state, `${ally.name} 无可攻击目标，百眼魅魔使其受到自身${amount}点伤害。`);
      return;
    }
    const virtual = window.CardUtils?.copyPlayable?.(
      { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "" },
      { temporary: true, void: true, noIntentCost: true, generatedBySkill: "百眼魅魔" });
    if (!virtual) return;
    log(state, `${witherer.name} 的百眼魅魔使${ally.name}对${target.name}视为使用一张虚拟【杀】。`);
    window.BattleSystem?.useVirtualKill?.(state, ally, target, virtual);
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
