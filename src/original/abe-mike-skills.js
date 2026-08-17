window.AbeMikeSkills = (() => {
  const alive = units => units.filter(u => u.hp > 0);
  const visible = u => (u?.hand || []).filter(c => !c._pendingDraw);
  const singleSlash = c => window.CardUtils.isSingleKill(c);
  const stat = (u, k) => (u.stats?.[k] || 0) + (k === "attack" ? (u.tempAttack || 0) : k === "magic" ? (u.tempMagic || 0) : 0);
  const topCard = (state, unit) => { window.BattlePileStats?.reshuffle(unit, cards => window.GameRandom.shuffle(cards, state)); return unit.deck.pop() || null; };
  const reveal = (state, title, cards) => state.battle.animQueue?.push({ type: "revealCards", id: window.GameRandom.id("rv"), title, cards: cards.map(c => ({ ...c })) });
  function discardRandom(state, unit) {
    const cards = visible(unit);
    if (!cards.length) return null;
    const card = window.GameRandom.sample(cards, state);
    unit.hand.splice(unit.hand.indexOf(card), 1);
    window.BattleCards?.put(state.battle, unit, card, "discard", { forcedDiscard: true });
    return card;
  }
  function prepare(state, unit, damage) {
    if (unit.ai !== "abe_mike") return false;
    const shown = window.GameRandom.sample(visible(unit), state);
    if (!shown) return true;
    window.BattleLines?.skill(state, unit, "星光拔刀斩");
    reveal(state, "星光拔刀斩", [shown]);
    window.BattleLog.add(state, `${unit.name} 展示${shown.suit || ""}${shown.name}发动星光拔刀斩。`);
    alive(state.battle.allies).forEach(target => {
      const lost = discardRandom(state, target);
      if (!lost) return;
      window.BattleLog.add(state, `${target.name} 被星光拔刀斩弃置${lost.suit || ""}${lost.name}。`);
      if (lost.name !== shown.name) damage(state, target, stat(unit, "attack"), "星光拔刀斩", unit, { name: "星光拔刀斩", type: "skill", ignoreResponse: true, skipDamageModify: true });
    });
    return true;
  }
  function dragonSlashMove(actor) {
    if (actor.ai !== "abe_mike" || actor.usedDragonSlash) return null;
    return { card: { name: "猛龙断空斩", _skill: true, dragonSlash: true, targetless: true }, target: actor };
  }
  function useDragonSlash(state, actor) {
    if (actor.usedDragonSlash) return true;
    actor.usedDragonSlash = true;
    const shown = [];
    for (let i = 0; i < 4; i++) { const card = topCard(state, actor); if (card) shown.push(card); }
    const gained = shown.filter(singleSlash);
    gained.forEach(c => { c.noIntentCost = true; c.mikeDragonSlash = true; if (state.battle.animQueue) c._pendingDraw = true; actor.hand.push(c); });
    if (gained.length) state.battle.animQueue?.push({ type: "gainCards", uid: actor.uid, side: actor.side, fromUid: actor.uid, count: gained.length, cards: gained });
    window.BattleCards?.putMany?.(state.battle, actor, shown.filter(c => !gained.includes(c)), "discard");
    window.BattleLines?.skill(state, actor, "猛龙断空斩");
    if (shown.length) reveal(state, "猛龙断空斩", shown);
    window.BattleLog.add(state, `${actor.name} 展示牌堆顶${shown.length}张，获得${gained.length}张单体杀牌，本回合不受杀意限制。`);
    return true;
  }
  function endTurn(state, unit, damage) {
    if (unit.ai !== "abe_mike" || !unit.entitySlashThisTurn) return;
    const targets = alive(state.battle.allies);
    const target = window.GameRandom.sample(targets, state);
    if (!target) return;
    const times = unit.entitySlashThisTurn;
    window.BattleLines?.skill(state, unit, "幻影剑舞", target);
    window.BattleLog.add(state, `${unit.name} 发动幻影剑舞，随机指定${target.name}使用${times}张虚拟杀。`);
    for (let i = 0; i < times && target.hp > 0 && !state.battle?.locked; i++) {
      const card = CardUtils.fromEntity("杀（普攻）", { ignoreResponse: true });
      damage(state, target, stat(unit, "attack"), "幻影剑舞", unit, card);
    }
  }
  return { prepare, dragonSlashMove, useDragonSlash, endTurn };
})();
