window.AngelicaLukaSkills = (() => {
  const alive = u => u && u.hp > 0;
  const isKill = c => c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || "");
  const isEntitySlash = card => window.CardUtils.isKillCard(card)
    && !card.virtual && !card.convertedFrom && !card.withererBerserkKill;
  const line = (state, unit, name, target) => window.BattleLines?.skill(state, unit, name, target);
  const wolfCard = () => ({ name: "狼牙杀", type: "slash", suit: "", power: 0, scale: "attack", noIntentCost: true, lukaWolfFang: true, text: "指定一名敌方角色为目标，对其造成等同于攻击力的伤害；此牌不消耗杀意。" });
  function beforeCardPlayed(state, actor, card) {
    if (actor?.ref !== "angelica" || !isEntitySlash(card)) return;
    const turn = state?.battle?.turn;
    if (actor.angelicaMightTurn !== turn) {
      actor.angelicaMightTurn = turn;
      actor.angelicaSlashCount = 0;
    }
    actor.angelicaSlashCount = (actor.angelicaSlashCount || 0) + 1;
    card.angelicaMight = actor.angelicaSlashCount + 1;
    line(state, actor, "力大无穷");
    window.AngelicaBerserkerSkinFX?.might?.(state, actor, card);
    window.BattleLog.add(state, `${actor.name} 力大无穷：本回合第${actor.angelicaSlashCount}张实体【杀】，伤害×${card.angelicaMight}。`);
  }
  function modifyDamage(state, actor, amount, card) {
    if (!amount || actor?.ref !== "angelica" || !card?.angelicaMight) return amount;
    return amount * card.angelicaMight;
  }
  function canPayIntentWithRage(actor, card) {
    return actor?.ref === "angelica" && isEntitySlash(card)
      && (actor.rageMarks || 0) > 0;
  }
  function beforeIntentCost(state, actor, card) {
    if (!canPayIntentWithRage(actor, card)) return false;
    actor.rageMarks = Math.max(0, (actor.rageMarks || 0) - 1);
    line(state, actor, "狂战意志");
    window.AngelicaBerserkerSkinFX?.rageSpend?.(state, actor, 1);
    window.BattleLog.add(state, `${actor.name} 消耗1枚狂战标记代替杀意消耗（剩余${actor.rageMarks}枚）。`);
    return true;
  }
  function handleSpecialCard(state, actor, target, card, deps, ctx) {
    if (card.angelicaTaunt) return taunt(state, actor, ctx);
    return false;
  }
  function taunt(state, actor, ctx) {
    if (actor.usedAngelicaTaunt) return true;
    actor.usedAngelicaTaunt = true;
    line(state, actor, "挑衅", state.battle.enemies.find(e => e.ai === "pursuer_edis" && alive(e)));
    window.AngelicaBerserkerSkinFX?.taunt?.(state, actor);
    const enemies = state.battle.enemies.filter(alive);
    const actions = enemies.map(enemy => ({ kind: "angelicaTaunt", actorUid: actor.uid, targetUid: enemy.uid }));
    if (ctx.damage?.useCard && window.BattleReactionQueue?.enqueue?.(state, actions)) {
      window.BattleReactionQueue.flush(state, ctx.damage);
    } else enemies.forEach(enemy => resolveTauntTarget(state, actor, enemy, ctx.useCard));
    return true;
  }
  function resolveReactionAction(state, action, damage) {
    if (action?.kind !== "angelicaTaunt") return false;
    const units = state.battle?.allies.concat(state.battle.enemies) || [];
    const actor = units.find(unit => unit.uid === action.actorUid);
    const enemy = units.find(unit => unit.uid === action.targetUid);
    if (alive(actor) && alive(enemy)) resolveTauntTarget(state, actor, enemy, damage?.useCard);
    return true;
  }
  function resolveTauntTarget(state, actor, enemy, useCard) {
    const card = enemy.hand.find(c => window.CardUtils.isSingleKillCard(c));
    if (card && useCard) { card.angelicaTauntSlash = true; useCard(state, enemy, actor, card); }
    else discardOne(state, enemy, actor);
  }
  function discardOne(state, enemy, actor) {
    const i = enemy.hand.findIndex(c => !c._pendingDraw);
    if (i < 0) return window.BattleLog.add(state, `${enemy.name} 没有杀牌，也没有可弃置手牌。`);
    const card = enemy.hand.splice(i, 1)[0];
    window.BattleCards?.put(state.battle, enemy, card, "discard", { forcedDiscard: true });
    window.BattleLog.add(state, `${enemy.name} 没有杀牌，因${actor.name}的挑衅弃置${card.suit || ""}${card.name}。`);
  }
  function afterDamage(state, actor, target, card, hpLoss, deps) {
    if (!hpLoss) return;
    gainRage(state, actor, "狂战造成伤害", target);
    gainRage(state, target, "狂战受到伤害", actor);
    if (actor?.ref === "luka" && isKill(card)) bloodSlaughter(state, actor, hpLoss, deps);
  }
  function gainRage(state, unit, lineName, target) {
    if (!alive(unit) || unit.ref !== "angelica") return;
    unit.rageMarks = Math.min(99, (unit.rageMarks || 0) + 1);
    line(state, unit, lineName, target);
    window.AngelicaBerserkerSkinFX?.rageGain?.(state, unit, lineName === "狂战受到伤害");
    window.BattleLog.add(state, `${unit.name} 获得1枚狂战标记（${unit.rageMarks}）。`);
  }
  function bloodSlaughter(state, actor, hpLoss, deps) {
    line(state, actor, "嗜血杀戮");
    if (actor.hp >= actor.maxHp) { const drawn = deps.draw(actor, 1, state.battle), result = window.BattleDrawFeedback.action(actor, 1, drawn); window.BattleLog.add(state, `${actor.name} 生命已满，嗜血杀戮${actor.drawLockedThisTurn ? result : `改为${result}`}。`); return; }
    const healed = Math.min(actor.maxHp - actor.hp, hpLoss);
    actor.hp += healed;
    window.BattleStats?.heal?.(state.battle, actor, healed);
    window.EnemySkills?.clearHolyScar?.(state, actor);
    deps.pushFloat?.(state.battle, actor.uid, "heal", healed);
    window.EnemySkills?.onHeal?.(state, deps.draw);
    window.ElranaAceNanaliSkills?.afterHeal?.(state, actor, deps);
    window.BertisGerlotSkills?.refreshArrogance?.(state);
    window.BattleLog.add(state, `${actor.name} 触发嗜血杀戮，恢复${healed}点生命。`);
  }
  function battleStart(state) {
    (state.battle?.allies || []).filter(u => u.ref === "luka").forEach(u => recoverWolf(state, u, false, "all"));
    (state.battle?.allies || []).filter(u => u.ref === "angelica")
      .forEach(u => window.AngelicaBerserkerSkinFX?.queueEntry?.(state, u));
  }
  function beginTurn(state, unit) {
    if (unit?.ref === "luka") recoverWolf(state, unit, true, "all");
    if (unit?.ref === "angelica") {
      unit.angelicaSlashCount = 0;
      unit.angelicaMightTurn = null;
    }
  }
  function afterCardPlayed(state, actor, card) { if (actor?.ref === "luka" && card?.type === "tactic" && !card._lukaChecked) { card._lukaChecked = true; recoverWolf(state, actor, true, "discard"); } }
  function recoverWolf(state, unit, speak, mode) {
    const inHand = unit.hand.filter(c => c.lukaWolfFang);
    const sources = mode === "discard" ? [unit.discard] : [unit.discard, unit.consumed, unit.deck];
    const found = sources.filter(Boolean).flatMap(p => p.filter(c => c.lukaWolfFang));
    found.forEach(c => sources.forEach(p => { const i = p?.indexOf(c) ?? -1; if (i >= 0) p.splice(i, 1); }));
    if (inHand.length > 1) inHand.slice(1).forEach(c => unit.hand.splice(unit.hand.indexOf(c), 1));
    if (!inHand.length && (found[0] || mode === "all")) {
      const card = found[0] || wolfCard();
      if (state.battle?.animQueue) card._pendingDraw = true;
      unit.hand.push(card); state.battle?.animQueue?.push({ type: "gainCards", uid: unit.uid, side: unit.side, fromUid: unit.uid, count: 1, cards: [card] });
      if (speak) line(state, unit, "狼牙回战");
    }
  }
  return { beforeCardPlayed, modifyDamage, canPayIntentWithRage, beforeIntentCost, handleSpecialCard, resolveReactionAction, afterDamage, battleStart, beginTurn, afterCardPlayed };
})();
