window.WithererSkills = (() => {
  const visible = u => (u?.hand || []).filter(c => !c._pendingDraw);
  const red = c => c?.suit === "♥" || c?.suit === "♦";
  const black = c => c?.suit === "♠" || c?.suit === "♣";
  const isSlash = c => window.CardUtils?.isKillCard?.(c) || c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || "");
  const berserkForm = { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", text: "暴走与极速：红色牌视为【杀（普攻）】使用。" };
  const berserkClearKeys = ["charge", "heal", "healPct", "healScale", "targetless", "allyTarget", "poison", "shock", "fire", "burnCard", "holy", "attackType", "magicDamage", "hybridAttack", "rageKill", "feint", "backflip", "revengeKill", "sweep", "reckless", "teamHealPct", "drawTeam", "duel", "drawCards", "discardTarget", "stealCard", "statusKey", "soulChain", "assassinate", "counterTactic", "comboAttack", "magicDuel", "magicBullet", "borrowSlash", "demonInvasion", "ignoreResponse", "fixedRepeats", "berserkKill", "biteKill", "bloodletting", "strangleKill", "warHorn", "pursueKill", "deflect", "armSelf", "armoredRam", "noIntentCost", "convertedFrom"];
  const alive = units => (units || []).filter(u => u.hp > 0);
  const hasSkill = (u, name) => (u?.skills || []).some(s => s.name === name);
  const identity = actor => actor?.id || actor?.ref;
  const isShiftUser = actor => ["xx_witherer_1124", "sonia"].includes(identity(actor));
  const shiftMode = actor => { const h = visible(actor), r = h.filter(red).length, b = h.filter(black).length; return r || b ? (r >= b ? "暴走" : "极速") : null; };
  const canShift = actor => isShiftUser(actor) && !!shiftMode(actor) && shiftMode(actor) !== actor.withererMode;
  function aiMove(state, actor, team, foes, hand, canPlay, ctx) {
    if (!["witherer_1124_split", "xx_witherer_1124"].includes(actor?.id) || !hasSkill(actor, "杀欲窥视")) return null;
    const peek = peekMove(actor, foes); if (peek) return peek;
    if (actor.id === "xx_witherer_1124") { const shift = shiftMove(actor); if (shift) return shift; const berserk = berserkSlashMove(actor, foes, ctx); if (berserk) return berserk; }
    const horn = hand.find(c => c.warHorn && canPlay(actor, c));
    if (horn && (actor.intent || 0) <= 0) return { card: horn, target: actor };
    return null;
  }
  function beforeEndMove(actor) {
    return canShift(actor) && shiftMode(actor) === "极速" ? { card: { name: "暴走与极速", _skill: true, withererShift: true, targetless: true }, target: actor } : null;
  }
  function peekMove(actor, foes) {
    if (actor.usedWithererPeek) return null;
    const target = alive(foes).filter(u => visible(u).length).sort((a, b) => visible(b).filter(isSlash).length - visible(a).filter(isSlash).length || visible(b).length - visible(a).length)[0];
    return target ? { card: { name: "杀欲窥视", _skill: true, withererPeek: true }, target } : null;
  }
  function usePeek(state, actor, target) {
    if (actor.usedWithererPeek) return false;
    actor.usedWithererPeek = true;
    const slashes = visible(target).filter(isSlash);
    window.BattleLines?.skill(state, actor, "杀欲窥视", target);
    slashes.forEach(c => {
      const copy = window.CardUtils.copyPlayable(c, { temporary: true, void: true, noIntentCost: true, withererPeekSlash: true, generatedBySkill: "杀欲窥视" });
      if (state.battle.animQueue) copy._pendingDraw = true;
      actor.hand.push(copy);
    });
    if (slashes.length) state.battle.animQueue?.push({ type: "gainCards", uid: actor.uid, side: actor.side, count: slashes.length, cards: actor.hand.slice(-slashes.length) });
    window.BattleLog.add(state, `${actor.name} 对${target.name}发动杀欲窥视，获得${slashes.length}张临时杀牌。`);
    refreshShiftState(actor);
    return true;
  }
  function shiftMove(actor) {
    return canShift(actor) ? { card: { name: "暴走与极速", _skill: true, withererShift: true, targetless: true }, target: actor } : null;
  }
  function useShift(state, actor) {
    if (!isShiftUser(actor)) return false;
    const next = shiftMode(actor);
    if (!next || next === actor.withererMode) return false;
    actor.withererMode = next;
    actor.withererModeMajority = next === "暴走" ? "red" : "black";
    actor.statuses = (actor.statuses || []).filter(s => s !== "暴走" && s !== "极速");
    actor.statuses.push(actor.withererMode);
    markSpeedCards(actor);
    window.BattleLines?.skill(state, actor, "暴走与极速");
    window.BattleLog.add(state, `${actor.name} 切换为${actor.withererMode}。`);
    return true;
  }
  function berserkSlashMove(actor, foes, ctx) {
    if (actor.withererMode !== "暴走") return null;
    const card = visible(actor).find(c => red(c)), target = ctx?.targetByPolicy?.(foes);
    if (!card || !target) return null;
    card.withererBerserkUse = true;
    return { card, target };
  }
  const canUseBerserkCard = (actor, card) => actor?.withererMode === "暴走" && red(card) && card?.type !== "status";
  function displayCard(actor, card) {
    if (!canUseBerserkCard(actor, card)) return card;
    const view = { ...card };
    berserkClearKeys.forEach(key => delete view[key]);
    return Object.assign(view, berserkForm, { noIntentCost: true, withererBerserkKill: true, convertedFrom: card.name });
  }
  function convertBerserkCard(state, actor, card) {
    if (!card || !(card.withererBerserkUse || canUseBerserkCard(actor, card))) return;
    card._withererOriginal = { name: card.name, type: card.type, power: card.power, scale: card.scale, text: card.text };
    berserkClearKeys.forEach(k => { card._withererOriginal[k] = card[k]; delete card[k]; });
    Object.assign(card, berserkForm, { noIntentCost: true, withererBerserkKill: true, convertedFrom: card._withererOriginal.name });
    window.BattleLines?.skill(state, actor, "暴走与极速");
  }
  function prepareSpeedCard(state, actor, card) {
    if (actor?.withererMode !== "极速" || !black(card) || card?.type === "response") return;
    if (!card.ignoreResponse) card._tempIgnoreResponse = true;
    card.ignoreResponse = true;
    window.BattleLines?.skill(state, actor, "暴走与极速");
  }
  function noIntentCost(actor, card) {
    const berserkRed = canUseBerserkCard(actor, card);
    return !!(card?.withererPeekSlash || card?.withererBerserkKill || berserkRed || card?.pursueKill && actor?.pursueFreeThisTurn);
  }
  function refreshShiftState(actor) {
    markSpeedCards(actor);
  }
  function markSpeedCards(actor) { visible(actor).forEach(c => actor.withererMode === "极速" && black(c) ? c.withererSpeedResponse = true : delete c.withererSpeedResponse); }
  function canCounterTacticCard(unit, card) { return unit?.withererMode === "极速" && black(card); }
  function responseCard(unit, card, name) {
    return unit?.withererMode === "极速" && black(card) && card?.name !== name
      ? { ...card, name, type: "response", convertedFrom: card.name, _entitySourceCard: card }
      : card;
  }
  const relics = window.WithererRelicSkills;
  function endTurn(state, unit) { refreshShiftState(unit); return relics.endTurn(state, unit); }
  return { aiMove, beforeEndMove, canShift, usePeek, useShift, canUseBerserkCard, displayCard, convertBerserkCard, prepareSpeedCard, noIntentCost, refreshShiftState, canCounterTacticCard, responseCard, endTurn, useWarHorn: relics.useWarHorn, canUseTongueActive: relics.canUseTongueActive, useTongueActive: relics.useTongueActive, prepare: relics.prepare, afterDamage: relics.afterDamage, afterDodged: relics.afterDodged, afterKillFailed: relics.afterKillFailed, deflect: relics.deflect };
})();
