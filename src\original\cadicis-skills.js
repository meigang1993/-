window.CadicisSkills = (() => {
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const alive = unit => unit && unit.hp > 0;
  const isKill = card => card?.type === "slash"
    || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  const isSingleKill = card => isKill(card)
    && !card.sweep && !card.targetless && !card.allTargets && !card.aoeLineShown;
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? (unit.tempAttack || 0)
      : key === "magic" ? (unit.tempMagic || 0) : 0);
  const line = (state, unit, name, target) =>
    window.BattleLines?.skill(state, unit, name, target);
  const reveal = (state, title, cards) => state.battle.animQueue?.push({
    type: "revealCards", id: window.GameRandom.id("rv"), title,
    cards: cards.map(card => ({ ...card })),
  });
  const responsibilityVisible = battle =>
    window.BattleLines?.promptVisible?.(battle, "cadicisResponsibility")
    ?? !!(battle?.cadicisResponsibility && !battle.animQueue?.length
      && !window.BattleEffects?.animating && !window.BattleEffects?.draining);

  function plan(state, actor, deps) {
    if (actor.usedCadicisPlan) return true;
    const selected = deps?.selectedHand?.(state, actor);
    const picked = selected?.ok
      && (isKill(selected.card) || selected.card.type === "tactic")
      ? selected.card : null;
    if (!picked) {
      window.BattleLog.add(state,
        `${actor.name} 没有选择可展示的杀牌或战术牌。`);
      return true;
    }
    actor.usedCadicisPlan = true;
    actor.cadicisPlanName = picked.name;
    line(state, actor, "战场指挥官");
    reveal(state, "战场指挥官", [picked]);
    window.BattleLog.add(state,
      `${actor.name} 展示${picked.suit || ""}${picked.name}并记录作战计划。`);
    return true;
  }

  function afterCardPlayed(state, actor, card, deps) {
    if (actor?.ref === "cadicis" && isKill(card)
      && !card.virtual && !card.cadicisHeavyFireDone) {
      heavyFire(state, actor, card, deps);
    }
  }

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

  function beforeKillTargeted(state, actor, target, card, deps) {
    if (!isSingleKill(card) || target.side !== "ally"
      || card.cadicisResponsibilityDone) return;
    const cadicis = state.battle.allies.find(unit =>
      unit.ref === "cadicis" && unit.uid !== target.uid && alive(unit));
    if (!cadicis) return;
    card.cadicisResponsibilityDone = true;
    const count = target.ref === "wendy" ? 2 : 1;
    const drawn = deps.draw(cadicis, count, state.battle);
    state.battle.cadicisResponsibility = {
      cadicisUid: cadicis.uid, targetUid: target.uid, count, remaining: count,
      actorUid: actor.uid, card: { ...card },
      comboPartnerUid: state.battle.comboPartnerUid || null,
    };
    state.battle.locked = true;
    window.BattleLines?.skillWhenPromptVisible?.(
      state, cadicis, "指挥官责任", target,
      "cadicisResponsibility", state.battle.cadicisResponsibility);
    const drawText = window.BattleDrawFeedback.action(cadicis, count, drawn);
    const separator = window.BattleDrawFeedback.count(count, drawn) ? "后" : "；";
    window.BattleLog.add(state,
      `${cadicis.name} 触发指挥官责任，${drawText}${separator}请选择${count}张手牌交给${target.name}。`);
  }

  function resolveResponsibility(state, cardIndex) {
    const battle = state.battle;
    const prompt = battle?.cadicisResponsibility;
    if (!prompt || !responsibilityVisible(battle)) return false;
    const cadicis = battle.allies.find(unit => unit.uid === prompt.cadicisUid);
    const target = battle.allies.find(unit =>
      unit.uid === prompt.targetUid && alive(unit));
    const card = cadicis?.hand?.[cardIndex];
    if (!cadicis || !target || !card || card._pendingDraw) return false;
    const fromBefore = visible(cadicis).length;
    const toBefore = visible(target).length;
    cadicis.hand.splice(cardIndex, 1);
    card._pendingDraw = true;
    target.hand.push(card);
    window.BattleCards?.syncStatusCards?.(target);
    battle.animQueue?.push({
      type: "giveCards", fromUid: cadicis.uid, fromSide: cadicis.side,
      toUid: target.uid, toSide: target.side, count: 1, cards: [card],
      fromBefore, toBefore,
    });
    window.BattleCards?.afterHandLost?.(battle, cadicis);
    prompt.remaining = Math.max(0,
      (prompt.remaining || prompt.count || 1) - 1);
    window.BattleLog.add(state,
      `${cadicis.name} 将${card.name}交给${target.name}。`);
    if (prompt.remaining > 0 && visible(cadicis).length) return true;
    battle.cadicisResponsibilityResume = {
      actorUid: prompt.actorUid, targetUid: prompt.targetUid, card: prompt.card,
      comboPartnerUid: prompt.comboPartnerUid || null,
    };
    battle.cadicisResponsibility = null;
    battle.locked = false;
    return true;
  }

  function applyPlan(state, actor, target, card) {
    const planned = isKill(card) || card?.type === "tactic";
    const cadicis = planned && actor?.side === "ally"
      && state.battle?.allies.find(unit => unit.ref === "cadicis"
        && alive(unit) && unit.uid !== actor?.uid
        && unit.cadicisPlanName === card?.name);
    if (!cadicis) return null;
    if (!card.ignoreResponse) card._tempIgnoreResponse = true;
    card.ignoreResponse = true;
    if (!card.cadicisPlanApplied) {
      card.cadicisPlanApplied = true;
      line(state, cadicis, "战场指挥官", target);
      window.BattleLog.add(state,
        `${actor.name} 按${cadicis.name}记录的${card.name}执行作战计划，伤害翻倍且不可被响应。`);
    }
    return cadicis;
  }

  const modifySlashDamage = (state, actor, target, amount, card) =>
    isKill(card) && applyPlan(state, actor, target, card) ? amount * 2 : amount;
  const modifyTacticDamage = (_state, _actor, _target, amount, card) =>
    card?.type === "tactic" && card.cadicisPlanApplied ? amount * 2 : amount;

  return {
    afterCardPlayed, applyPlan, beforeKillTargeted, modifySlashDamage,
    modifyTacticDamage, plan, responsibilityVisible, resolveResponsibility,
  };
})();
