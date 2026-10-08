window.CarlosSkills = (() => {
  const visible = unit => (unit.hand || []).filter(card => !card._pendingDraw);
  const isKill = card => window.CardUtils.isKillCard(card);
  const singleKill = card => window.CardUtils.isSingleKill(card);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? (unit.tempAttack || 0)
      : key === "magic" ? (unit.tempMagic || 0) : 0);
  function crazyShooting(state, actor, deps, ctx) {
    if (actor.usedCrazyShooting) return true;
    const index = ctx?.selectedCostCard
      ? ctx.selectedCostCard(actor) : state.battle.selectedCardIndex;
    const cost = actor.hand[index];
    if (!cost || cost._pendingDraw || !["♥", "♦"].includes(cost.suit)) {
      return true;
    }
    actor.usedCrazyShooting = true;
    actor.hand.splice(index, 1);
    window.BattleCards?.put(state.battle, actor, cost, "discard");
    window.BattleLines?.skill(state, actor, "疯狂射击");
    window.BattleLog.add(state,
      `${actor.name} 将${cost.suit}${cost.name}转化为机枪扫杀使用。`);
    // 疯狂射击转化出的【机枪扫杀】不消耗杀意：noIntentCost 在 spendIntent
    // 内由 hasNoIntentCost 读取，先于狂战标记抵扣，故不会白白吃掉狂战标记。
    ctx.useCard(state, actor, actor, window.CardUtils.convertAs(
      "机枪扫杀", cost,
      { _skipHandMove: true, _entitySourceCard: cost, noIntentCost: true }));
    return true;
  }
  function afterSlashDamage(state, actor, target, card, hpLoss, api) {
    // 疯狂刺刀按「造成伤害」判定，护甲吸收的伤害同样算造成：
    // 描述改为「造成生命值或护甲值伤害后」，故 blockLoss > 0 也触发。
    // 此前只判 hpLoss，被护甲完全吸收时不触发，与描述不符。
    const blockLoss = api?.blockLoss || 0;
    if (!(hpLoss > 0 || blockLoss > 0) || actor?.ref !== "carlos"
      || !singleKill(card) || card._crazyBayonet) return;
    const count = visible(actor).filter(isKill).length;
    if (!count) return;
    card._crazyBayonet = true;
    window.BattleLines?.skill(state, actor, "疯狂刺刀", target);
    const amount = Math.max(0, stat(actor, "attack"));
    window.BattleLog.add(state,
      `${actor.name} 触发疯狂刺刀，按手牌杀牌数量追加${count}次攻击力伤害。`);
    // 优先排入反应队列（与幻影剑舞 / 电钻火花同一套机制）：
    // 交牌、护驾等弹窗期间 battle.locked 为真，裸 for 循环直接调
    // directDamage 会被 locked 分支整段吞掉 —— 实测 X=3 只打出 2 段、
    // X=5 同样只剩 2 段（丢 3 段）。入队后由队列在解锁后 flush，
    // 追加段因此不会丢失。
    const extraCard = {
      name: "疯狂刺刀", type: "skill", _drillExtraHit: true,
    };
    const actions = [];
    for (let index = 0; index < count; index += 1) {
      const action = window.BattleReactionQueue?.directDamageAction?.(
        actor, target, amount, "疯狂刺刀", { ...extraCard }, 120 * index);
      if (action) actions.push(action);
    }
    if (actions.length && window.BattleReactionQueue?.enqueue?.(state, actions)) {
      window.BattleReactionQueue.flush(state, api.damage || api.directDamage);
      return;
    }
    for (let index = 0; index < count && target.hp > 0; index += 1) {
      // 兜底：队列不可用时沿用直接调用。
      // 追加段沿用 _drillExtraHit 标识（现仅作标记，受击链已改为逐段结算）：
      // 追加段同样会触发受击方的反击与收益类技能（逐段结算）。
      api.directDamage(
        state, target, amount, "疯狂刺刀", actor, 120 * index,
        { ...extraCard });
    }
  }
  return { crazyShooting, afterSlashDamage };
})();
