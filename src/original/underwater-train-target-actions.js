window.UnderwaterTrainTargetActions = ({
  black, isSlash, singleSlash, counters,
}) => {
  const slimeCard = () => ({
    name: "粘液",
    type: "consume",
    statusKey: "slime",
    slime: true,
    targetless: true,
    temporary: false,
    suit: "",
    text: "状态牌，弃牌阶段不能弃置；使用此牌需消耗1点杀意，不能交给其他角色，可被拆解或偷窃移除。",
  });

  function prepareKill(state, actor, target, card) {
    if (!actor || !target || !card) return;
    if (actor.ai !== "mona_eagle_captain"
      || !actor.monaPiercingReady || !singleSlash(card)) return;
    card._tempSweep = true;
    if (!card.holy) card._tempHoly = true;
    card.sweep = true;
    card.holy = true;
    card.twoDodgesRequired = true;
    card.monaPiercingSweep = true;
    actor.monaPiercingReady = false;
    actor.monaPiercingUsed = true;
    window.BattleLines?.skill(state, actor, "圣天破军剑", target);
    window.BattleLines?.skill(state, actor, "圣剑无双", target);
  }

  function beforeKillTargeted(state, actor, target, card) {
    if (!actor || !target || !card) return;
    prepareKill(state, actor, target, card);
    if (target.ai === "mona_eagle_captain" && actor.side === "ally" && isSlash(card)) {
      counters.swordShieldCounter(state, target, actor, card);
    }
    if (actor.ai === "terror_slime" && target.side === "ally" && isSlash(card)) {
      addSlime(state, actor, target);
    }
    if (actor.ai === "shark_pirate_raider"
      && target.side === "ally" && singleSlash(card)) steal(state, actor, target);
    if (actor.ai === "shark_pirate_submarine" && black(card) && isSlash(card)) {
      if (!card.ignoreResponse) card._tempIgnoreResponse = true;
      card.ignoreResponse = true;
      card.sharkTorpedo = true;
      window.BattleLines?.skill(state, actor, "鲨影鱼雷", target);
    }
    if (actor.ai === "shark_captain_mordio"
      && target.side === "ally" && singleSlash(card)) {
      window.BattleLines?.skill(state, actor, "粉碎破坏者", target);
    }
    const singleEntitySlash = window.CardUtils.isEntitySingleKill(card);
    if (actor.side !== target.side && singleEntitySlash && actor.shockHandCannonReady) {
      card.shockHandCannonDouble = true;
      actor.shockHandCannonReady = false;
      actor.shockHandCannonExpiresThisTurn = false;
      window.BattleLog.add(state,
        `${actor.name} 的震感手炮触发，本次杀伤害翻倍。`);
    }
    if (actor.side !== target.side && singleSlash(card)
      && window.RelicSystem?.hasEquipped?.(state, actor, "剪刀刃")) {
      counters.scissorBlade(state, actor, target, card);
    }
  }

  function addSlime(state, actor, target) {
    const card = slimeCard();
    if (!window.BattleStatusCards?.add?.(state, target, card)) return;
    window.BattleLines?.skill(state, actor, "粘液打击", target);
    window.BattleLog.add(state,
      `${actor.name} 触发粘液打击，${target.name}手中生成一张粘液。`);
  }

  function steal(state, actor, target) {
    const index = target.hand.findIndex(card => !card._pendingDraw);
    if (index < 0) return;
    const [card] = target.hand.splice(index, 1);
    if (window.BattleStatusCards?.isStatus?.(card)) {
      window.BattleCards?.put(state.battle, target, card, "consumed",
        { forcedDiscard: true });
      window.BattleLines?.skill(state, actor, "冲锋掠夺", target);
      window.BattleLog.add(state,
        `${actor.name} 触发冲锋掠夺，移除并消耗${target.name}的${card.name}状态牌。`);
      return;
    }
    card.stolenFromUid = target.uid;
    if (state.battle.animQueue) card._pendingDraw = true;
    actor.hand.push(card);
    state.battle.animQueue?.push({
      type: "stealCard",
      fromUid: target.uid,
      fromSide: target.side,
      toUid: actor.uid,
      toSide: actor.side,
      count: 1,
      cards: [card],
    });
    window.BattleCards?.afterHandLost?.(state.battle, target);
    window.BattleLines?.skill(state, actor, "冲锋掠夺", target);
    window.BattleLog.add(state,
      `${actor.name} 触发冲锋掠夺，获得${target.name}一张手牌。`);
  }

  return { prepareKill, beforeKillTargeted };
};
