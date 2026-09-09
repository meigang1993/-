window.CadicisHeavyFire = (() => {
  const { alive, isKill, line, stat } = window.CadicisSkillUtils;

  function heavyFire(state, actor, card, deps) {
    const targets = state.battle?.enemies.filter(alive) || [];
    const amount = Math.max(0, stat(actor, "attack"));
    if (!targets.length || !amount) return;
    const damageTypes = window.BattleDamageAttributes?.resolve?.(
      card, card.name, actor
    ) || ["physical"];
    const attackType = window.BattleDamageAttributes?.attackType?.(
      card, card.name, actor
    ) || "physical";
    const attributeNames = damageTypes.filter(type => type !== "physical")
      .map(type => window.BattleDamageAttributes?.names?.[type] || type);
    const damageLabel = attributeNames.length
      ? `${attributeNames.join("、")}属性`
      : attackType === "magic" ? "魔法" : "物理";
    const damageCard = {
      name: "重火力支援", type: "skill", damageTypes, attackType,
      magicDamage: attackType === "magic", hybridAttack: !!card.hybridAttack,
      ignoreBlock: true, skipDamageModify: true,
    };
    card.cadicisHeavyFireDone = true;
    line(state, actor, "重火力支援");
    window.BattleLog.add(state,
      `${actor.name} 触发重火力支援，对所有敌方造成${amount}点${damageLabel}无视护甲伤害。`);
    targets.forEach(enemy => deps.damage?.(
      state, enemy, amount, "重火力支援", actor, { ...damageCard }));
  }

  function afterCardPlayed(state, actor, card, deps) {
    if (actor?.ref === "cadicis" && isKill(card)
      && !card.virtual && !card.cadicisHeavyFireDone) {
      heavyFire(state, actor, card, deps);
    }
  }

  return { afterCardPlayed, heavyFire };
})();
