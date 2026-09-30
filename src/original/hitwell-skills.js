window.HitwellSkills = (() => {
  const alive = unit => !!unit && unit.hp > 0;
  const isHitwell = unit => unit?.ref === "hitwell" || unit?.id === "hitwell";
  const hasSkill = (unit, name) =>
    (unit?.skills || []).some(skill => skill.name === name);
  const line = (state, unit, name) => window.BattleLines?.skill(state, unit, name);
  const attackOf = unit => (unit?.stats?.attack || 0) + (unit?.tempAttack || 0);
  const magicOf = unit => (unit?.stats?.magic || 0) + (unit?.tempMagic || 0);
  const heartsOf = unit =>
    (unit?.hand || []).filter(card => card?.suit === "♥" && !card._pendingDraw);

  // 天使血愈：希特威恢复生命值后，其同阵营的其他角色各恢复等量生命值。
  // 敌方不参与恢复——描述为"其他友方角色"，跨阵营回血会让玩家打不动敌人。
  // 只由希特威自身恢复触发；此处直接改 hp 而不走恢复函数，
  // 其他角色因此恢复时不会再触发本技能，避免无限连锁。
  function afterHeal(state, unit, healed, api) {
    if (!isHitwell(unit) || !alive(unit) || !healed || healed <= 0) return;
    if (!hasSkill(unit, "天使血愈")) return;
    const battle = state?.battle;
    if (!battle) return;
    const sideUnits = unit.side === "enemy" ? battle.enemies || [] : battle.allies || [];
    const others = sideUnits.filter(item => alive(item) && item.uid !== unit.uid);
    if (!others.length) return;
    line(state, unit, "天使血愈");
    let any = false;
    others.forEach(other => {
      const amount = Math.min(other.maxHp - other.hp, healed);
      if (amount <= 0) return;
      other.hp = Math.min(other.maxHp, other.hp + amount);
      window.BattleStats?.heal?.(battle, unit, amount);
      api?.pushFloat?.(battle, other.uid, "heal", amount);
      any = true;
    });
    if (!any) return;
    window.BattleLog.add(state,
      `${unit.name} 触发天使血愈，其他友方角色各恢复${healed}点生命。`);
    window.BertisGerlotSkills?.refreshArrogance?.(state);
  }

  // 神心自愈：希特威使用或打出♥红桃牌结算后，恢复等同于自身魔力值的生命。
  // 恢复后按天使血愈的约定联动：本技能自身恢复会再触发一次天使血愈，
  // 而天使血愈给其他角色恢复时直接改 hp、不再回调，因此不存在无限连锁。
  function afterCardPlayed(state, actor, card, api) {
    if (!isHitwell(actor) || !alive(actor)) return;
    if (!hasSkill(actor, "神心自愈")) return;
    if (card?.suit !== "♥") return;
    const battle = state?.battle;
    if (!battle) return;
    const amount = magicOf(actor);
    const cap = Math.min(actor.maxHp - actor.hp, Math.max(0, amount));
    const blocked = cap > 0
      && window.EnemySkills?.beforeHeal?.(state, actor, amount, actor, card, api?.damage) === 0;
    const healed = blocked ? 0 : cap;
    if (healed <= 0) return;
    line(state, actor, "神心自愈");
    actor.hp = Math.min(actor.maxHp, actor.hp + healed);
    window.BattleStats?.heal?.(battle, actor, healed);
    window.EnemySkills?.clearHolyScar?.(state, actor);
    api?.pushFloat?.(battle, actor.uid, "heal", healed);
    window.BattleLog.add(state,
      `${actor.name} 触发神心自愈，使用♥${card.name}恢复${healed}点生命。`);
    afterHeal(state, actor, healed, api);
    window.BertisGerlotSkills?.refreshArrogance?.(state);
  }

  // 心血之咒：希特威受到生命值伤害后，伤害来源须交出一张♥红桃牌；
  // 没有红桃牌可交时，希特威对其造成等同于自身攻击力的伤害。
  function afterDamage(state, actor, target, card, hpLoss, deps) {
    if (!hpLoss || hpLoss <= 0) return;
    if (!isHitwell(target) || !alive(target)) return;
    if (!hasSkill(target, "心血之咒")) return;
    const battle = state?.battle;
    if (!battle || !actor || actor.uid === target.uid || !alive(actor)) return;
    line(state, target, "心血之咒");
    const hearts = heartsOf(actor);
    if (hearts.length) {
      const given = hearts[0];
      actor.hand.splice(actor.hand.indexOf(given), 1);
      if (battle.animQueue) given._pendingDraw = true;
      target.hand.push(given);
      window.BattleCards?.syncStatusCards?.(target);
      battle.animQueue?.push({
        type: "stealCard", fromUid: actor.uid, fromSide: actor.side,
        toUid: target.uid, toSide: target.side, count: 1, cards: [given],
      });
      window.BattleCards?.afterHandLost?.(battle, actor);
      window.BattleLog.add(state,
        `${target.name} 触发心血之咒，${actor.name}交出一张♥${given.name}。`);
      return;
    }
    const amount = attackOf(target);
    if (amount <= 0) return;
    deps?.directDamage?.(state, actor, amount, "心血之咒", target, 0,
      { name: "心血之咒", type: "skill" });
    window.BattleLog.add(state,
      `${target.name} 触发心血之咒，${actor.name}未能交出♥红桃牌，受到${amount}点伤害。`);
  }

  return { afterHeal, afterCardPlayed, afterDamage };
})();
