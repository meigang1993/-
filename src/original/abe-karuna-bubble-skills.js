// 安倍卡露娜【记忆泡泡】：已结算的实体牌可存入泡泡手牌区，
// 出牌阶段可就地直接使用，以此法使用的【杀】不消耗杀意；回合结束后该区域清空。
// 区域本身的容量、牌堆摘取与渲染委托给 abe-karuna-bubble-zone.js。
window.AbeKarunaBubbleSkills = (() => {
  // 惰性取全局：zone 排在本文件之前（ORDER_DEPENDENCIES 校验顺序），
  // 即便清单顺序被调整也不会在加载期抛错，只会在调用时安全降级。
  const Z = () => window.AbeKarunaBubbleZone;

  function afterCardPlayed(state, actor, card) {
    const zone = Z();
    const battle = state?.battle;
    if (!zone || !battle || actor?.ref !== "abe_karuna" || !card) return;
    if (!zone.alive(actor)) return;
    if (card._repeat || card._skill || card._skipHandMove || card.type === "status") return;
    // 泡泡区直接使用的牌：用掉即离区，不再询问「放入」（此前取回再打出会无限循环）。
    // 必须排在最前：消耗牌若先被别的分支 return，会一边被烧、一边留在区内。
    if (card._bubbleCast) {
      const bubble = zone.bubbleOf(actor);
      const at = bubble.indexOf(card);
      if (at >= 0) bubble.splice(at, 1);
      return;
    }
    if (!zone.hasSkill(actor, "记忆泡泡")) return;
    // 只有实体牌才触发：虚拟牌与技能生成/打出的牌不是玩家真实打出并结算的牌，
    // 不提供存入机会，否则一次性产物会变成可反复调用的储备。
    if (!zone.isEntityCard(card)) return;
    if (battle.pendingVictory || battle.pendingDefeat || battle.defeat) return;
    if (zone.bubbleOf(actor).length >= zone.MAX) return;
    // 结算完毕时若已有别的提示挂起（如霹雳之锤），不能把本次机会丢掉：
    // 此前直接 return，卡露娜的【杀】被【闪】抵消后撞上锤子挂起，提示永久消失。
    if (battle.locked || battle.karunaBubble) {
      if (!battle.karunaBubblePending) {
        battle.karunaBubblePending = { actorUid: actor.uid, card };
      }
      return;
    }
    battle.karunaBubble = { actorUid: actor.uid, card };
    battle.locked = true;
    window.BattleLog.add(state,
      `${actor.name} 的记忆泡泡可发动：将刚使用的${card.suit || ""}${card.name}放入泡泡手牌区？`);
  }

  // 补问：上一次询问未处理完时又有牌结算，机会只会暂存在 karunaBubblePending；
  // 此前仅霹雳之锤的 flush 消费它，其余场景（续跑连续追加）会静默丢失。
  function flushPending(state) {
    const zone = Z();
    const battle = state?.battle;
    const pending = battle?.karunaBubblePending;
    if (!zone || !pending || battle.karunaBubble || battle.thunderHammer || battle.locked) {
      return false;
    }
    const actor = battle.allies.concat(battle.enemies)
      .find(unit => unit.uid === pending.actorUid);
    battle.karunaBubblePending = null;
    if (!actor || !zone.alive(actor) || !zone.hasSkill(actor, "记忆泡泡")) return false;
    if (zone.bubbleOf(actor).length >= zone.MAX) return false;
    battle.karunaBubble = { actorUid: pending.actorUid, card: pending.card };
    battle.locked = true;
    window.BattleLog.add(state, `${actor.name} 的记忆泡泡可发动：将刚使用的`
      + `${pending.card.suit || ""}${pending.card.name}放入泡泡手牌区？`);
    return true;
  }

  function store(state) {
    const zone = Z();
    const battle = state?.battle, pick = battle?.karunaBubble;
    if (!zone || !pick) return false;
    const actor = battle.allies.concat(battle.enemies)
      .find(unit => unit.uid === pick.actorUid);
    battle.karunaBubble = null;
    battle.locked = false;
    if (!actor) return false;
    const card = pick.card;
    // 消耗牌结算后进的是消耗区而非弃牌堆，两处都要摘；
    // 两处都找不到说明牌已不在玩家可及之处，不得凭空进区（否则就是复制牌）。
    let removed = zone.removeFromPile(zone.pileOf(actor), card);
    if (!removed) removed = zone.removeFromPile(zone.consumedOf(actor), card);
    if (!removed) return false;
    const bubble = zone.bubbleOf(actor);
    bubble.push(card);
    window.BattleLines?.skill(state, actor, "记忆泡泡");
    window.BattleLog.add(state, `${actor.name} 将${card.suit || ""}${card.name}`
      + `存入泡泡手牌区（${bubble.length}/${zone.MAX}）。`);
    // 补问上一次询问期间暂存的牌（连续追加时可能已排队）。
    flushPending(state);
    return true;
  }

  function skip(state) {
    const battle = state?.battle;
    if (!battle?.karunaBubble) return false;
    const actor = battle.allies.concat(battle.enemies)
      .find(unit => unit.uid === battle.karunaBubble.actorUid);
    battle.karunaBubble = null;
    battle.locked = false;
    if (actor) {
      window.BattleLog.add(state, `${actor.name} 放弃发动记忆泡泡。`);
    }
    flushPending(state);
    return true;
  }

  // 点击泡泡区的牌：就地选中并直接使用（牌不进手牌），指定目标后结算。
  // 此前「取回到手牌再打出」会让牌留存到下回合，泡泡区变成额外手牌位。
  function select(state, index) {
    const zone = Z();
    const battle = state?.battle;
    const actor = window.BattleSystem?.active?.(battle);
    if (!zone || !battle || !actor || battle.locked || actor.ref !== "abe_karuna") return false;
    // 技能描述限定「出牌阶段」才能使用泡泡手牌区（phase 4）。
    // 此前只判 locked，导致弃牌阶段（phase 5）乃至其他阶段也能取回——
    // 等于凭空多一次免费出牌机会，且取回的牌不受弃牌阶段约束。
    if (battle.phase !== 4) return false;
    const bubble = zone.bubbleOf(actor);
    const card = bubble[index];
    if (!card) return false;
    // 同一时刻只认一张泡泡牌：换选时先抹掉旧标记，
    // 避免取消后残留的免杀意标记跟到弃牌堆、被回收后错误生效。
    bubble.forEach(item => { delete item._bubbleFree; delete item._bubbleCast; });
    // 先打免杀意标记再判可打出：泡泡区的【杀】不消耗杀意，
    // 若先判后打，杀意耗尽时 canPlay 会把本可用的牌挡下。
    card._bubbleFree = true;
    card._bubbleCast = true;
    if (window.BattleSystem?.canPlay
      && !window.BattleSystem.canPlay(actor, card, battle)) {
      delete card._bubbleFree; delete card._bubbleCast;
      return false;
    }
    window.BattleSystem?.cancelSelection?.(state);
    // 走技能牌通道：selectedSkillCard 不要求牌在手牌里，
    // 于是可以"在泡泡区直接使用"，无需先塞进手牌。
    battle.selectedSkillCard = card;
    window.BattleLog.add(state, `${actor.name} 选择泡泡手牌区的${card.suit || ""}${card.name}。`);
    return true;
  }

  const isIntentFree = card => !!card?._bubbleFree;

  // 已选中同一张泡泡牌时再次点击 → 与手牌区一致：不必再点「确定」，直接打出。
  // 只有无需指定目标的牌（targetless / allyTarget）走这条快速通道；
  // 需要选目标的牌（如【杀】）仍须点敌人，与手牌区行为保持一致。
  function isPicked(state, index) {
    const zone = Z();
    const battle = state?.battle;
    if (!zone || !battle) return false;
    const actor = window.BattleSystem?.active?.(battle);
    if (!actor) return false;
    const card = zone.bubbleOf(actor)[index];
    if (!card || battle.selectedSkillCard !== card) return false;
    const view = window.CardUtils?.battleView?.(state, actor, card) || card;
    return !!(view.targetless || view.allyTarget);
  }

  return {
    get MAX() { return Z()?.MAX ?? 2; },
    afterCardPlayed, store, skip, select, isPicked, isIntentFree, flushPending,
    endTurn: (state, unit) => Z()?.endTurn?.(state, unit),
    render: (unit, U) => Z()?.render?.(unit, U) || "",
  };
})();
