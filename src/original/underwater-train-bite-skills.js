window.UnderwaterTrainBiteSkills = ({ singleSlash }) => {
  const biteForm = {
    name: "咬杀",
    power: 0,
    scale: "attack",
    biteKill: true,
    text: "鲨鱼头套效果：此【杀（普攻）】视为【咬杀】，造成等同于对应攻击属性的伤害；造成生命值伤害后恢复等量生命值。",
  };
  const biteKeys = [...Object.keys(biteForm), "convertedFrom"];

  // 冰心双刺剑在「获得」阶段就把【杀（普攻）】就地改写成【刺杀】，而鲨鱼头套原本只认
  // 牌名仍为【杀（普攻）】的牌，两件同戴时鲨鱼头套被整件废掉——连"造成伤害后恢复
  // 等量生命"也一起丢失，玩家看不出任何提示。改为同时接受「由冰心双刺剑从【杀（普攻）】
  // 转换而来」的牌（_iceDagger 是冰心转换后保留的专属标记，实测 convertAs 不会剥除）。
  // 效果是两件叠加而非互相顶掉：刺杀的不消耗杀意与弃置手牌效果保留，再叠加咬杀的回血。
  const iceDaggerKill = card => !!card?._iceDagger && card?.convertedFrom === "杀（普攻）";

  function biteEligible(state, actor, card) {
    return !!(actor && card && singleSlash(card)
      && (card.name === "杀（普攻）" || iceDaggerKill(card))
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
