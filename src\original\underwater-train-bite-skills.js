window.UnderwaterTrainBiteSkills = ({ singleSlash }) => {
  const biteForm = {
    name: "咬杀",
    power: 0,
    scale: "attack",
    biteKill: true,
    text: "鲨鱼头套效果：此【杀（普攻）】视为【咬杀】，造成等同于对应攻击属性的伤害；造成生命值伤害后恢复等量生命值。",
  };
  const biteKeys = [...Object.keys(biteForm), "convertedFrom"];

  function biteEligible(state, actor, card) {
    return !!(actor && card && card.name === "杀（普攻）" && singleSlash(card)
      && window.RelicSystem?.hasEquipped?.(state, actor, "鲨鱼头套"));
  }

  function displayBiteCard(state, actor, card) {
    if (!biteEligible(state, actor, card)
      || card.virtual && !card._playedFromHand && !actor?.hand?.includes(card)) return card;
    return { ...card, ...biteForm, convertedFrom: card.convertedFrom || "杀（普攻）" };
  }

  function prepareBite(state, actor, card) {
    if (!biteEligible(state, actor, card) || card._tempBiteKillBase
      || card.virtual && !card._playedFromHand) return false;
    card._tempBiteKillBase = biteKeys.map(key => ({
      key,
      present: Object.hasOwn(card, key),
      value: card[key],
    }));
    Object.assign(card, biteForm, { convertedFrom: card.convertedFrom || "杀（普攻）" });
    window.BattleLog.add(state,
      `${actor.name} 的鲨鱼头套触发，将杀（普攻）视为咬杀。`);
    return true;
  }

  function afterDamage(state, actor, card, hpLoss) {
    if (!hpLoss || !card?.biteKill) return;
    const healed = Math.min(actor.maxHp - actor.hp, hpLoss);
    if (!healed) return;
    actor.hp += healed;
    window.BattleStats?.heal?.(state.battle, actor, healed);
    window.EnemySkills?.clearHolyScar?.(state, actor);
    window.EnemySkills?.onHeal?.(state, window.BattleSystem?.draw);
    window.BattleSystem?.pushFloat?.(state.battle, actor.uid, "heal", healed);
    window.BattleLog.add(state, `${actor.name} 的咬杀恢复${healed}点生命。`);
  }

  return { prepareBite, displayBiteCard, afterDamage };
};
