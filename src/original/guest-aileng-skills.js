window.GuestAilengSkills = (() => {
  const alive = unit => unit && unit.hp > 0;
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const isSlash = card => card?.type === "slash" || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  const hasSkill = (unit, name) => (unit?.skills || []).some(skill => skill.name === name);
  const stat = (unit, key) => (unit.stats?.[key] || 0) + (key === "attack" ? (unit.tempAttack || 0) : key === "magic" ? (unit.tempMagic || 0) : 0);
  const line = (state, unit, name, target) => window.BattleLines?.skill(state, unit, name, target);
  const chargeFallbackText = "出牌阶段限一次，你可以指定一名友方女性角色，你弃置所有红桃牌，令其摸等量牌。若目标为贝丝妲，改为你弃置所有手牌，令贝丝妲摸等量牌，然后你受到等同于贝丝妲魔力的伤害；若你仍存活，你翻面并跳过下一个完整回合。若目标为七位姐姐之一且其对应儿子存活，该儿子获得1枚“绿帽”标记；若目标为娜娜莉或贝丝妲且罗卡尔存活，罗卡尔获得1枚“绿帽”标记。每名角色至多拥有5枚“绿帽”，每枚令手牌上限、杀意上限各+1，攻击力+30%。";

  function chargeSkill() {
    const text = GameData.characters?.find(character => character.id === "aileng")?.skills?.find(skill => skill.name === "征服欲望")?.derivedSkills?.find(skill => skill.name === "充能精华")?.text || chargeFallbackText;
    return { name: "充能精华", type: "active", icon: "⚔️", text, card: { name: "充能精华", type: "tactic", allyTarget: true, ailengCharge: true, icon: "⚔️", text } };
  }
  function normalizeSkills(unit, baseSkills = unit?.skills) {
    if (unit?.ref !== "aileng" || !Array.isArray(baseSkills)) return baseSkills;
    return baseSkills.map(skill => skill?.name === "充能精华" ? chargeSkill() : skill);
  }
  function skills(unit) {
    if (unit?.ref !== "aileng" || hasSkill(unit, "征服欲望") || hasSkill(unit, "充能精华")) return [];
    return [chargeSkill()];
  }
  function endTurn(state, unit) {
    if (unit?.ref === "aileng") unit.ailengDamageHits = 0;
  }
  function handleSpecialCard(state, actor, target, card, deps, ctx) {
    if (card.ailengBet) return ailengBet(state, actor, card, deps, ctx);
    if (card.ailengCharge) return ailengCharge(state, actor, target, deps, ctx);
    return false;
  }
  function ailengBet(state, actor, card, deps, ctx) {
    if (actor.usedAilengBet) return true;
    const indexes = [...new Set(card?._bagIndexes || state.battle.selectedBagIndexes || [])].filter(index => actor.hand[index] && !actor.hand[index]._pendingDraw).sort((a, b) => b - a);
    if (!indexes.length) { window.BattleLog.add(state, `${actor.name} 发动计算下注失败：至少需要选择一张手牌弃置。`); return false; }
    const all = indexes.length === visible(actor).length;
    actor.usedAilengBet = true;
    const cards = indexes.map(index => actor.hand.splice(index, 1)[0]);
    ctx.putMany(state, actor, cards, "discard", { showDiscard: true });
    const count = indexes.length + (all ? 1 : 0);
    const drawn = deps.draw(actor, count, state.battle);
    if (all) actor.intent = deps.intentMax(actor);
    line(state, actor, "计算下注"); window.BattleLog.add(state, `${actor.name} 发动计算下注，弃置${indexes.length}张牌并${window.BattleDrawFeedback.action(actor, count, drawn)}${all ? "，重置杀意" : ""}。`);
    return true;
  }
  function ailengCharge(state, actor, target, deps, ctx) {
    if (actor.usedAilengCharge || !target || target.side !== actor.side || target.gender !== "female") return false;
    actor.usedAilengCharge = true; line(state, actor, "充能精华", target);
    const cards = target.ref === "besta" ? visible(actor).slice() : visible(actor).filter(card => card.suit === "♥");
    cards.forEach(card => actor.hand.splice(actor.hand.indexOf(card), 1));
    ctx.putMany(state, actor, cards, "discard", { showDiscard: true }); const drawn = deps.draw(target, cards.length, state.battle); applyGreenHat(state, target);
    if (target.ref === "besta") {
      deps.damage(state, actor, stat(target, "magic"), "充能精华", target, { name: "充能精华", type: "skill", magicDamage: true, ignoreResponse: true, skipDamageModify: true });
      window.GuardKellySkills?.markFaceDown?.(state, actor);
    }
    window.BattleLog.add(state, `${actor.name} 对${target.name}发动充能精华，自身弃置${cards.length}张牌并令${target.name}${window.BattleDrawFeedback.action(target, cards.length, drawn)}。`);
    return true;
  }
  function applyGreenHat(state, target) {
    const map = { angelica: "luka", nonoka: "loki", elrana: "ace", manny: "miller", wendy: "cadicis", flora: "carlos", bertis: "gerlot", nanali: "lokar", besta: "lokar" };
    const id = map[target.ref], unit = state.battle.allies.find(item => item.ref === id && alive(item)); if (!window.GreenHat.grant(unit)) return;
    window.BattleLog.add(state, `${unit.name} 因${target.name}获得绿帽标记${unit.greenHat}/5，手牌上限、杀意上限各+1，攻击力+30%。`);
  }
  function afterCardPlayed(state, actor, card) {
    if (actor?.ref === "aileng") battleDrill(state, actor, card);
  }
  function battleDrill(state, actor, card) {
    if (!hasSkill(actor, "战斗演练") || card._skill || (!isSlash(card) && card.type !== "tactic")) return;
    const receivers = state.battle.allies.filter(unit => unit.uid !== actor.uid && alive(unit));
    if (!receivers.length) return;
    if (actor.side === "ally") { state.battle.ailengDrillPicker = { actorUid: actor.uid, card }; state.battle.locked = true; line(state, actor, "战斗演练"); return; }
    resolveBattleDrill(state, receivers.sort((a, b) => visible(a).length - visible(b).length)[0].uid);
  }
  function resolveBattleDrill(state, targetUid) {
    const battle = state.battle, picker = battle?.ailengDrillPicker;
    const actor = picker && battle.allies.concat(battle.enemies).find(unit => unit.uid === picker.actorUid);
    const receiver = picker && battle.allies.find(unit => unit.uid === targetUid && unit.uid !== picker.actorUid && alive(unit));
    if (!picker || !actor) return false;
    if (!targetUid) { battle.ailengDrillPicker = null; battle.locked = false; window.BattleLog.add(state, `${actor.name} 放弃发动战斗演练。`); return true; }
    if (!receiver) return false;
    const card = picker.card, handIndex = actor.hand.indexOf(card), pile = [actor.discard, actor.consumed].find(cards => cards?.includes(card));
    if (handIndex >= 0) actor.hand.splice(handIndex, 1);
    else if (pile) pile.splice(pile.indexOf(card), 1);
    const moved = handIndex >= 0 || pile ? card : window.CardUtils.copyPlayable(card);
    if (!moved.name) return false;
    if (battle.animQueue) moved._pendingDraw = true;
    receiver.hand.push(moved); battle.animQueue?.push({ type: "giveCards", fromUid: actor.uid, fromSide: actor.side, toUid: receiver.uid, toSide: receiver.side, count: 1, cards: [moved] });
    battle.ailengDrillPicker = null; battle.locked = false; line(state, actor, "战斗演练", receiver); window.BattleLog.add(state, `${actor.name} 发动战斗演练，将${card.name}交给${receiver.name}。`);
    return true;
  }
  function afterDamage(state, actor, hpLoss, api) {
    if (!(actor?.ref === "aileng" && hpLoss && hasSkill(actor, "征服欲望"))) return;
    const award = () => conquerHit(state, actor);
    if (!(api?.damage?.delayUntilHitSettled?.(state, award)
      || window.BattleDamageLifecycle?.delayUntilHitSettled?.(state, award))) award();
  }
  function conquerHit(state, actor) {
    actor.ailengDamageHits = (actor.ailengDamageHits || 0) + 1;
    if (actor.ailengDamageHits <= 7 || !hasSkill(actor, "征服欲望")) return;
    replaceSkill(state, actor, ["征服欲望"], { name: "战斗之勇", type: "passive", icon: "⭐", text: "锁定技，当你使用实体【杀】或使用【与我一战】时，你从摸牌堆摸一张牌。若以此法摸到【杀】或【与我一战】，你恢复1点杀意。" });
    line(state, actor, "征服欲望成功"); window.BattleLog.add(state, `${actor.name} 征服欲望成功，获得战斗之勇。`);
  }
  function onDeath(state) {
    state.battle.allies.filter(unit => unit.ref === "aileng" && alive(unit) && hasSkill(unit, "征服欲望")).forEach(unit => failConquer(state, unit));
  }
  function failConquer(state, actor) {
    replaceSkill(state, actor, ["征服欲望", "计算下注"], skills({ ref: "aileng", skills: [] })[0]);
    line(state, actor, "征服欲望失败"); window.BattleLog.add(state, `${actor.name} 征服欲望失败，获得充能精华。`);
  }
  function replaceSkill(state, actor, removeNames, addSkill) {
    const apply = unit => { unit.skills = (unit.skills || []).filter(skill => !removeNames.includes(skill.name)); if (addSkill && !hasSkill(unit, addSkill.name)) unit.skills.push(addSkill); };
    apply(actor); const character = state.chars?.find(item => item.id === actor.ref); if (character) apply(character);
  }
  return { skills, chargeSkill, normalizeSkills, endTurn, handleSpecialCard, afterCardPlayed, afterDamage, onDeath, resolveBattleDrill };
})();
