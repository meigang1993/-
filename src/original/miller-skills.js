window.MillerSkills = (() => {
  const icons = ["🍎", "🍉", "🍐", "🍌", "🍒", "🍓", "🍊"];
  const tripleChance = .08, pairCutoff = .40;
  const hasSkill = (unit, name) => (unit?.skills || []).some(s => s.name === name);
  const visibleHand = unit => window.GuestCharacterSkills?.visibleHandCount?.(unit) ?? (unit?.hand || []).filter(c => !c._pendingDraw).length;
  const handLimit = unit => Math.max(0, unit?.stats?.handLimit || 0);
  function rollSlots(state) {
    const r = window.GameRandom.value(state), pick = () => window.GameRandom.sample(icons, state);
    if (r < tripleChance) { const icon = pick(); return [icon, icon, icon]; }
    if (r < pairCutoff) {
      const pair = pick(); let other = pick();
      while (other === pair) other = pick();
      return window.GameRandom.shuffle([pair, pair, other], state);
    }
    const pool = window.GameRandom.shuffle([...icons], state);
    return pool.slice(0, 3);
  }
  function handleSpecialCard(state, actor, target, card, deps) {
    if (!card?.millerSlot || actor?.usedMillerSlot) return false;
    actor.usedMillerSlot = true;
    const rolls = rollSlots(state);
    const unique = new Set(rolls).size;
    const count = unique === 1 ? 8 : unique === 2 ? 4 : 1, id = window.GameRandom.id("ms");
    const battle = state.battle;
    battle.millerSlot = { id, uid: actor.uid, rolls, count };
    setTimeout(() => { if ((!window.state || window.state === state) && state.battle === battle && battle.millerSlot?.id === id) { battle.millerSlot = null; window.render?.(); } }, 1800);
    const drawn = deps.draw(actor, count, battle);
    window.BattleLog?.add?.(state, `${actor.name} 转出 ${rolls.join(" ")}，${window.BattleDrawFeedback.action(actor, count, drawn)}。`);
    window.BattleLines?.skill?.(state, actor, "贪玩老虎机", target);
    return true;
  }
  function canShare(state, unit) {
    const b = state?.battle;
    return !!(b && unit?.ref === "miller" && b.phase === 5 && hasSkill(unit, "收获分享") && b.allies.some(a => a.uid !== unit.uid && a.hp > 0));
  }
  function offerShare(state, unit, cardIndex, rules = {}) {
    if (!canShare(state, unit)) return false;
    const card = unit.hand[cardIndex];
    if (!rules.canDiscardCard?.(unit, card) || visibleHand(unit) <= handLimit(unit)) return false;
    const p = state.battle.millerShare ||= { unitUid: unit.uid, indexes: [] };
    if (p.unitUid !== unit.uid) return false;
    const picked = p.indexes.includes(cardIndex), max = Math.max(0, rules.maxCount || 0);
    if (!picked && p.indexes.filter(i => rules.canDiscardCard(unit, unit.hand[i])).length >= max) return true;
    p.indexes = picked ? p.indexes.filter(i => i !== cardIndex) : [...p.indexes, cardIndex];
    window.BattleLines?.skill?.(state, unit, "收获分享");
    return true;
  }
  function resolveShare(state, targetUid, rules = {}) {
    const b = state?.battle, p = b?.millerShare, unit = p && b.allies.find(u => u.uid === p.unitUid);
    if (!b || !p || !unit || !p.indexes?.length) return { ok: false };
    const indexes = [...new Set(p.indexes)].filter(i => rules.canDiscardCard?.(unit, unit.hand[i])).sort((a, z) => z - a), cards = [];
    indexes.forEach(i => { const [card] = unit.hand.splice(i, 1); if (card) cards.unshift(card); });
    if (!cards.length) { b.millerShare = null; return { ok: false }; }
    const names = cards.map(c => c.name).join("、"), target = targetUid && b.allies.find(u => u.uid === targetUid && u.uid !== unit.uid && u.hp > 0);
    if (target) { cards.forEach(c => c._pendingDraw = true); target.hand.push(...cards); window.BattleCards?.syncStatusCards?.(target); b.animQueue?.push({ type: "giveCards", fromUid: unit.uid, fromSide: unit.side, toUid: target.uid, toSide: target.side, count: cards.length, cards }); window.BattleCards?.afterHandLost?.(b, unit); window.BattleLog?.add?.(state, `${unit.name} 将 ${names} 交给${target.name}。`); }
    else rules.discardCards?.(state, unit, cards, "弃置");
    b.millerShare = null;
    return { ok: true, cards, shared: !!target };
  }
  return { handleSpecialCard, offerShare, resolveShare, visibleHand, handLimit };
})();
