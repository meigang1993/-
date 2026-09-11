window.AngelicaLukaSkills = (() => {
  const alive = u => u && u.hp > 0;
  const RAGE_MAX = 10;
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
    line(state, actor, "力量爆发");
    window.AngelicaBerserkerSkinFX?.might?.(state, actor, card);
    window.BattleLog.add(state, `${actor.name} 力量爆发：本回合第${actor.angelicaSlashCount}张实体【杀】，伤害×${card.angelicaMight}。`);
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
  function canUseCrimsonRampage(actor) {
    return actor?.ref === "angelica" && !actor.usedCrimsonRampage
      && (actor.rageMarks || 0) > 0;
  }
  function crimsonRampage(state, actor, deps, ctx) {
    if (actor.usedCrimsonRampage || !(actor.rageMarks || 0)) return true;
    actor.usedCrimsonRampage = true;
    const spent = actor.rageMarks;
    actor.rageMarks = 0;
    line(state, actor, "猩红暴走");
    window.AngelicaBerserkerSkinFX?.crimsonRampage?.(state, actor, spent);
    window.BattleLog.add(state, `${actor.name} 发动猩红暴走，弃置${spent}枚狂战标记。`);
    const drawn = deps?.draw?.(actor, spent, state.battle) ?? 0;
    const drawText = window.BattleDrawFeedback?.action?.(actor, spent, drawn)
      ?? `摸${drawn}张牌`;
    window.BattleLog.add(state, `${actor.name} ${drawText}。`);
    const heal = Math.round(spent * (actor.maxHp || 0) * 0.1);
    const healed = Math.max(0, Math.min(actor.maxHp - actor.hp, heal));
    if (healed > 0) {
      actor.hp += healed;
      window.BattleStats?.heal?.(state.battle, actor, healed);
      window.EnemySkills?.clearHolyScar?.(state, actor);
      ctx?.pushFloat?.(state.battle, actor.uid, "heal", healed);
      window.EnemySkills?.onHeal?.(state, deps?.draw);
      window.ElranaAceNanaliSkills?.afterHeal?.(state, actor, deps);
      window.BertisGerlotSkills?.refreshArrogance?.(state);
      window.BattleLog.add(state, `${actor.name} 恢复${healed}点生命（${spent}枚×生命上限${actor.maxHp}的10%）。`);
    } else {
      window.BattleLog.add(state, `${actor.name} 生命已满，未恢复生命。`);
    }
    return true;
  }
  function handleSpecialCard(state, actor, target, card, deps, ctx) {
    if (card?.crimsonRampage) return crimsonRampage(state, actor, deps, ctx);
    return false;
  }
  function afterDamage(state, actor, target, card, hpLoss, deps) {
    if (!hpLoss) return;
    const schedule = deps?.damage?.scheduleAfterDamage;
    const award = () => {
      gainRage(state, actor, "狂战造成伤害", target);
      gainRage(state, target, "狂战受到伤害", actor);
    };
    if (typeof schedule === "function") schedule(award);
    else award();
    if (actor?.ref === "luka" && isKill(card)) bloodSlaughter(state, actor, hpLoss, deps);
  }
  function gainRage(state, unit, lineName, target) {
    if (!alive(unit) || unit.ref !== "angelica") return;
    const before = unit.rageMarks || 0;
    unit.rageMarks = Math.min(RAGE_MAX, before + 1);
    line(state, unit, lineName, target);
    window.AngelicaBerserkerSkinFX?.rageGain?.(state, unit, lineName === "狂战受到伤害");
    window.BattleLog.add(state, unit.rageMarks === before
      ? `${unit.name} 狂战标记已达上限${RAGE_MAX}枚，不再获得。`
      : `${unit.name} 获得1枚狂战标记（${unit.rageMarks}）。`);
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
  return { beforeCardPlayed, modifyDamage, canPayIntentWithRage, beforeIntentCost, canUseCrimsonRampage, handleSpecialCard, afterDamage, battleStart, beginTurn, afterCardPlayed };
})();
