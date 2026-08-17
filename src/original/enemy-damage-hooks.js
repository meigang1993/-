window.EnemyDamageHooks = ({ hasSkill, machine, discardOne, status }) => {
  function modifyDamage(state, target, amount, card) {
    const isKill = card?.type === "slash" || /杀(?:（[^）]*）)?$/.test(card?.name || "");
    let result = amount;
    if (card?.krowFemaleTarget) {
      result *= 2;
      window.BattleLog.add(state, "克罗博士的肉欲之欢触发，对女性目标伤害翻倍。");
    }
    if (card?.holy && target.holyScar) {
      result *= 2;
      window.BattleLog.add(state, `${target.name} 的圣痕触发，受到圣属性伤害翻倍。`);
    }
    if (isKill && (card?._minotaurPreventUids
      || card?._entitySourceCard?._minotaurPreventUids)?.includes(target.uid)) return 0;
    if (isKill && target.lockSuit && card?.suit && target.lockSuit === card.suit) {
      const root = card._entitySourceCard || card;
      if (!card.ignoreResponse) card._tempIgnoreResponse = true;
      card.ignoreResponse = true;
      card.lockSuitResponse = true;
      result *= 2;
      if (!root.lockSuitApplied) {
        root.lockSuitApplied = true;
        window.BattleLog.add(state,
          `${target.name} 的${target.lockSuit}锁定标记触发，伤害翻倍且不可响应。`);
      }
    }
    return result;
  }

  function afterDamage(state, actor, target, card, hpLoss, damage, cardUser = actor) {
    window.GuardKellySkills?.afterDamage?.(state, actor, target, card, hpLoss, cardUser);
    if (hpLoss && target.shock && !card?.shockBonus) {
      damage(state, target, target.shock, "感电", actor, {
        name: "感电", type: "skill", shockBonus: true, ignoreResponse: true,
        ignoreBlock: true, skipDamageModify: true,
      });
      if (target.hp <= 0) return;
    }
    if (hpLoss && card?.shock && !card?._soulChain) status.addShock(state, target, 1);
    if (hpLoss && card?.holy && !card?._soulChain) status.addHolyScar(state, target);
    if (hpLoss && card?.poison && !card?.poisonTick && !card?._soulChain) {
      status.addPoison(state, target, 1, actor);
    }
    if (hpLoss && card?.type === "slash" && hasSkill(actor, "毒针") && !card?.poison) {
      window.BattleLines?.skill(state, actor, "毒针");
      status.addPoison(state, target, 1, actor);
    }
    machine.afterDamage(state, actor, target, hpLoss, damage);
    window.UnderwaterTrainSkills?.afterDamage?.(state, actor, target, card, hpLoss, damage);
    if (!hpLoss || actor.ai !== "goblin" || !card || card.type !== "slash") return;
    const discarded = discardOne(target);
    if (!discarded) return;
    window.BattleCards?.put(state.battle, target, discarded, "consumed");
    window.BattleLines?.skill(state, actor, "激光射线");
    window.BattleLog.add(state, `${actor.name} 触发激光射线，消耗${target.name}一张手牌。`);
  }

  return { modifyDamage, afterDamage };
};
