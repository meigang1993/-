window.OrcCombatSkills = deps => {
  const { alive, visible, isSlash, singleSlash, entitySingleSlash, fullSlash } = deps;

  function witchMove(state, actor) {
    if (actor.ai !== "demon_witch" || actor.usedMagicMissile || actor.magicMissileStopped) return null;
    const target = window.BattleAI?.helpers?.magicBulletTarget?.(actor, state.battle.allies)
      || alive(state.battle.allies).filter(unit => visible(unit).length)
        .sort((left, right) => visible(right).length - visible(left).length || left.hp - right.hp)[0];
    return target ? { card: { name: "魔法巡飞弹", _skill: true, magicMissile: true }, target } : null;
  }

  function useMagicMissile(state, actor, target, useCard) {
    actor.usedMagicMissile = true;
    window.BattleLines?.skill(state, actor, "魔法巡飞弹", target);
    useCard(state, actor, target, {
      name: "魔弹特攻", type: "tactic", magicBullet: true,
      _skill: true, virtual: true, magicMissileVirtual: true,
    });
    return true;
  }

  function afterMagicMissile(state, actor, target, card) {
    if (!card?.magicMissileVirtual || actor?.ai !== "demon_witch") return;
    if ((card.totalHpLoss || 0) > 0) return;
    actor.magicMissileStopped = true;
    window.BattleLog.add(state, `${actor.name} 的魔法巡飞弹未造成伤害，本阶段停止继续发动。`);
  }

  function beforeIntentCost(state, actor, card) {
    if (actor.ai !== "demon_beast_unit" || !isSlash(card)) return;
    if (actor.beastReloadSuit && actor.beastReloadSuit === card.suit) card.noIntentCost = true;
    if (!actor.beastReloadUsed && fullSlash(card) && card.suit) {
      actor.beastReloadUsed = true;
      actor.beastReloadSuit = card.suit;
      card.beastReloadTrigger = true;
      window.BattleLines?.skill(state, actor, "快速装弹");
      window.BattleLog.add(state, `${actor.name} 触发快速装弹，本回合${card.suit}杀牌不消耗杀意。`);
    }
  }

  function noIntentCost(actor, card) {
    return actor?.ai === "demon_beast_unit" && !card?.beastReloadTrigger
      && actor.beastReloadSuit && actor.beastReloadSuit === card?.suit && isSlash(card);
  }

  function prepareSlash(state, actor, target, card) {
    if (actor.ai === "demon_beast_unit" && singleSlash(card) && !card._beastSuppressionApplied) {
      card._beastOriginal = { name: card.name, text: card.text, power: card.power };
      card._beastSuppressionApplied = true;
      card._tempSweep = true;
      card.sweep = true;
      card.name = "机枪扫杀";
      window.BattleLines?.skill(state, actor, "火力压制", target);
      window.BattleLog.add(state, `${actor.name} 的火力压制触发，单体杀视为机枪扫杀。`);
    }
    if (actor.ai === "demon_mecha_cerberus"
      && entitySingleSlash(card) && !card._cerberusTripleApplied) {
      card._cerberusTripleApplied = true;
      card.gatlingRepeats = (card.gatlingRepeats || 1) + 2;
      window.BattleLines?.skill(state, actor, "三头齐攻", target);
      window.BattleLog.add(state, `${actor.name} 触发三头齐攻，本次杀额外结算2次。`);
    }
  }

  return {
    witchMove, useMagicMissile, afterMagicMissile,
    beforeIntentCost, noIntentCost, prepareSlash,
    beforeKillTargeted: prepareSlash,
  };
};
