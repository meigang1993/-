window.RuinsRelicEffects = (() => {
  const alive = units => (units || []).filter(u => u.hp > 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  const isSlash = card => window.CardUtils?.isKillCard?.(card) || card?.type === "slash";
  const isKillOwned = (target, index) => isSlash((target?.hand || [])[index])
    && !(target?.hand || [])[index]?._pendingDraw;

  function missileLauncherBlock(state, actor, target, card, responseCards, response) {
    if (!window.RelicSystem?.hasEquipped?.(state, actor, "导弹发射器")) return true;
    if (!isSlash(card)) return true;
    const slashIndex = (target.hand || []).findIndex((_, i) => i !== responseCards.indexOf(response) && isKillOwned(target, i));
    if (slashIndex < 0) {
      log(state, `${actor.name} 的导弹发射器触发：${target.name}需额外弃1张杀才能响应闪，响应失败。`);
      return false;
    }
    const extra = target.hand.splice(slashIndex, 1)[0];
    window.BattleCards?.put?.(state.battle, target, extra, "discard", { showDiscard: true });
    log(state, `${actor.name} 的导弹发射器触发：${target.name}额外弃1张${extra.suit || ""}${extra.name}作为响应代价。`);
    return true;
  }

  // 冰心双刺剑逻辑已拆至 ruins-relic-ice-dagger.js（含「离手还原」）：
  // 本文件加入还原后超过 200 行硬约束，故仅保留代理。
  const iceDagger = () => window.RuinsRelicIceDagger;
  const convertIceDaggers = (state, unit, cards) =>
    iceDagger()?.convertIceDaggers?.(state, unit, cards) ?? 0;
  const afterCardsLanded = event => iceDagger()?.afterCardsLanded?.(event) ?? 0;


  function afterDraw(state, unit, cards, draw, ctx) {
    if (!cards || !cards.length) return;
    const battle = state?.battle;
    if (!battle) return;
    convertIceDaggers(state, unit, cards);
    if (battle.phase === 4 && window.RelicSystem?.hasEquipped?.(state, unit, "螺旋桨")) {
      triggerPropeller(state, unit, ctx);
    }
    if (battle.phase === 2 && window.RelicSystem?.hasEquipped?.(state, unit, "物资货物")) {
      triggerSupplyCargo(state, unit, cards.length, draw);
    }
  }

  function triggerSupplyCargo(state, unit, count, draw) {
    if (typeof draw !== "function" || count <= 0) return;
    const battle = state.battle;
    const team = (unit.side === "ally" ? battle.allies : battle.enemies) || [];
    const others = team.filter(m => m !== unit && m.hp > 0);
    if (!others.length) return;
    others.forEach(ally => {
      const cards = draw(ally, count, battle);
      if (!cards.length) return;
      // 同推进器：draw() 内部已为 recipient 推过 drawBatch，此处不可再推，
      // 否则同一批牌会播两次飞入动画，且手牌数显示会被多加一次。
    });
    window.BattleLines?.skill?.(state, unit, "物资货物");
    log(state, `${unit.name} 的物资货物触发：友方${others.length}名角色各摸${count}张牌。`);
  }

  function triggerPropeller(state, unit, ctx) {
    const foes = (unit?.side === "ally" ? state.battle.allies : state.battle.enemies) || [];
    const pool = alive((unit.side === "ally" ? state.battle.enemies : state.battle.allies) || []);
    if (!pool.length) return;
    const target = window.GameRandom?.sample?.(pool, state) || pool[0];
    const virtual = window.CardUtils?.copyPlayable?.(
      { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "" },
      { temporary: true, void: true, noIntentCost: true, generatedBySkill: "螺旋桨" });
    if (!virtual) return;
    window.BattleLines?.skill?.(state, unit, "螺旋桨", target);
    log(state, `${unit.name} 的螺旋桨触发，对${target.name}视为使用一张虚拟【杀】。`);
    const combat = ctx?.getCombat && ctx.getCombat();
    if (combat?.useVirtualKill) combat.useVirtualKill(state, unit, target, virtual);
    else window.BattleSystem?.useVirtualKill?.(state, unit, target, virtual);
  }

  // 推进器（被动）：根据你使用牌指定的目标数摸等量牌。
  // 目标数口径与牌型一致：群体/无目标牌按敌方存活数计，单体牌按 1 计。
  function thrusterTargetCount(state, actor, card, target) {
    const battle = state?.battle;
    if (!battle) return 0;
    if (card?.sweep || card?.targetless || card?.allTargets) {
      const foes = alive(actor?.side === "ally" ? battle.enemies : battle.allies);
      return foes.length;
    }
    return target ? 1 : 0;
  }

  function afterCardPlayed(state, actor, target, card, draw) {
    if (!actor || !card || card._thrusterApplied) return;
    if (card.virtual || card._skill) return;
    if (!window.RelicSystem?.hasEquipped?.(state, actor, "推进器")) return;
    const count = thrusterTargetCount(state, actor, card, target);
    if (count <= 0) return;
    card._thrusterApplied = true;
    if (typeof draw !== "function") return;
    const cards = draw(actor, count, state.battle) || [];
    if (!cards.length) return;
    // 注意：draw() 内部已经为 recipient 推过一次 drawBatch 动画，这里不能再推。
    // 否则同一批牌会播两次飞入动画（表现为"多飞出一张"），且 syncIncomingHand
    // 会被调用两次导致手牌数显示不同步。
    window.BattleLines?.skill?.(state, actor, "推进器");
    log(state, `${actor.name} 的推进器触发，本牌指定${count}个目标，摸${cards.length}张牌。`);
  }

  // 智能大脑（被动）：战术牌造成的伤害翻倍。
  function tacticDamage(state, actor, card, amount) {
    if (card?.type !== "tactic" || card._skill) return amount;
    if (!window.RelicSystem?.hasEquipped?.(state, actor, "智能大脑")) return amount;
    if (!card._smartBrainLogged) {
      card._smartBrainLogged = true;
      window.BattleLines?.skill?.(state, actor, "智能大脑");
      log(state, `${actor.name} 的智能大脑触发，战术牌${card.name}造成的伤害翻倍。`);
    }
    return amount * 2;
  }

  // 粉色魅魔装（被动）：红色牌对你无效；你使用的红色牌不可响应。
  const RED_SUITS = new Set(["♥", "♦"]);
  const isRed = card => RED_SUITS.has(card?.suit);

  function modifyIncomingDamage(state, target, amount, card) {
    if (amount <= 0 || !isRed(card) || card?._skill) return amount;
    if (!window.RelicSystem?.hasEquipped?.(state, target, "粉色魅魔装")) return amount;
    if (!card._pinkImmuneLogged) {
      card._pinkImmuneLogged = true;
      window.BattleLines?.skill?.(state, target, "粉色魅魔装");
      log(state, `${target.name} 的粉色魅魔装触发，红色牌${card.suit}${card.name}对其无效。`);
    }
    return 0;
  }

  // 不可响应的标记必须在响应牌候选计算之前打上，故挂在响应检查前。
  function beforeResponseCheck(state, actor, target, card) {
    if (!isRed(card) || card?.ignoreResponse || card?._skill) return;
    if (!window.RelicSystem?.hasEquipped?.(state, actor, "粉色魅魔装")) return;
    card.ignoreResponse = true;
    if (!card._pinkUnrespondableLogged) {
      card._pinkUnrespondableLogged = true;
      window.BattleLines?.skill?.(state, actor, "粉色魅魔装");
      log(state, `${actor.name} 的粉色魅魔装触发，其使用的红色牌${card.suit}${card.name}不可被响应。`);
    }
  }

  return {
    missileLauncherBlock, afterDraw, afterCardsLanded, afterCardPlayed, tacticDamage,
    modifyIncomingDamage, beforeResponseCheck,
  };
})();
