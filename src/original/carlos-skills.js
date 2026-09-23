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
    ctx.useCard(state, actor, actor, window.CardUtils.convertAs(
      "机枪扫杀", cost,
      { _skipHandMove: true, _entitySourceCard: cost }));
    return true;
  }
  function afterSlashDamage(state, actor, target, card, hpLoss, api) {
    if (!hpLoss || actor?.ref !== "carlos" || !singleKill(card)
      || card._crazyBayonet) return;
    const count = visible(actor).filter(isKill).length;
    if (!count) return;
    card._crazyBayonet = true;
    window.BattleLines?.skill(state, actor, "疯狂刺刀", target);
    const amount = Math.max(0, stat(actor, "attack"));
    window.BattleLog.add(state,
      `${actor.name} 触发疯狂刺刀，按手牌杀牌数量追加${count}次攻击力伤害。`);
    for (let index = 0; index < count && target.hp > 0; index += 1) {
      api.directDamage(
        state, target, amount, "疯狂刺刀", actor, 120 * index);
    }
  }
  return { crazyShooting, afterSlashDamage };
})();
