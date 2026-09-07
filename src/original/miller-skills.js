window.MillerSkills = (() => {
  const icons = ["🍎", "🍉", "🍐", "🍌", "🍒", "🍓", "🍊"];
  const tripleChance = .08, pairCutoff = .40;
  const hasSkill = (unit, name) => (unit?.skills || []).some(s => s.name === name);
  const visibleHand = unit => window.GuestCharacterSkills?.visibleHandCount?.(unit) ?? (unit?.hand || []).filter(c => !c._pendingDraw).length;
  const handLimit = unit => Math.max(0, unit?.stats?.handLimit || 0);
  const canSelect = (rule, unit, card) =>
    !rule || (rule.length > 1 ? rule(unit, card) : rule(card));
  function syncSelection(unit, prompt, rule) {
    if (!unit || !prompt) return false;
    if (!Array.isArray(prompt.cards)) {
      if (prompt.indexes?.length) {
        prompt.indexes = []; prompt.cards = [];
        return false;
      }
      prompt.cards = [];
    }
    const cards = [...new Set(prompt.cards)];
    if (!cards.every(card => unit.hand.includes(card) && canSelect(rule, unit, card))) {
      prompt.indexes = []; prompt.cards = [];
      return false;
    }
    prompt.cards = cards;
    prompt.indexes = cards.map(card => unit.hand.indexOf(card));
    return true;
  }
  function selectedIndexes(unit, prompt, rule) {
    return syncSelection(unit, prompt, rule) ? prompt.indexes : [];
  }
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
  function offerShare(state, unit, cardIndex, rules = {}, expectedCard = null) {
    if (!canShare(state, unit)) return false;
    const p = state.battle.millerShare ||= { unitUid: unit.uid, indexes: [], cards: [] };
    if (p.unitUid !== unit.uid) return false;
    if (!syncSelection(unit, p, rules.canDiscardCard)) {
      window.BattleLog?.add?.(state, "收获分享的原选牌已变化，请重新选择。");
      return true;
    }
    const index = expectedCard ? unit.hand.indexOf(expectedCard) : cardIndex;
    const card = unit.hand[index];
    if (!card || expectedCard && card !== expectedCard
      || !rules.canDiscardCard?.(unit, card)
      || visibleHand(unit) <= handLimit(unit)) return false;
    const picked = p.cards.includes(card), max = Math.max(0, rules.maxCount || 0);
    if (!picked && p.cards.length >= max) return true;
    p.cards = picked ? p.cards.filter(item => item !== card) : [...p.cards, card];
    p.indexes = p.cards.map(item => unit.hand.indexOf(item));
    window.BattleLines?.skill?.(state, unit, "收获分享");
    return true;
  }
  function resolveShare(state, targetUid, rules = {}) {
    const b = state?.battle, p = b?.millerShare, unit = p && b.allies.find(u => u.uid === p.unitUid);
    if (!b || !p || !unit) return { ok: false };
    if (!syncSelection(unit, p, rules.canDiscardCard)) {
      window.BattleLog?.add?.(state, "收获分享的原选牌已失效，请重新选择。");
      return { ok: false, staleSelection: true };
    }
    if (!p.cards.length) return { ok: false };
    const cards = [...p.cards];
    cards.forEach(card => unit.hand.splice(unit.hand.indexOf(card), 1));
    const names = cards.map(c => c.name).join("、"), target = targetUid && b.allies.find(u => u.uid === targetUid && u.uid !== unit.uid && u.hp > 0);
    if (target) { cards.forEach(c => c._pendingDraw = true); target.hand.push(...cards); window.BattleCards?.syncStatusCards?.(target); b.animQueue?.push({ type: "giveCards", fromUid: unit.uid, fromSide: unit.side, toUid: target.uid, toSide: target.side, count: cards.length, cards }); window.BattleCards?.afterHandLost?.(b, unit); window.BattleLog?.add?.(state, `${unit.name} 将 ${names} 交给${target.name}。`); }
    else rules.discardCards?.(state, unit, cards, "弃置");
    b.millerShare = null;
    return { ok: true, cards, shared: !!target };
  }
  return {
    handleSpecialCard, offerShare, resolveShare, selectedIndexes,
    visibleHand, handLimit,
  };
})();
