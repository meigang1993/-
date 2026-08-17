window.BattleDiscardFlow = (deps) => {
  const { active, visibleHand, handLimit, canDiscardCard, canDiscardAny, discardNeed, discardOverflow, enterEndPhase, draw, combat, record, advanceToInput, manualFlow } = deps;
  function enterDiscardOrEnd(state, unit) {
    const b = state.battle; b.discardPick = null;
    if (!unit.playedSlashThisTurn && window.RelicSystem?.hasEquipped?.(state, unit, "母亲怀表")) { record(state, `${unit.name} 的母亲怀表触发，跳过弃牌阶段。`); return enterEndPhase(state, unit); }
    const need = discardNeed(unit);
    if (unit.side === "ally" && need > 0) { record(state, `${unit.name} 手牌超过上限，需要弃置${need}张。`); return false; }
    discardOverflow(state, unit); return enterEndPhase(state, unit);
  }
  function selectedDiscardIndexes(b, unit) { return [...new Set(b.discardPick?.indexes || [])].filter(i => canDiscardCard(unit, unit?.hand?.[i])).sort((a, z) => z - a); }
  function toggleDiscardPick(state, unit, cardIndex) {
    const b = state.battle, card = unit?.hand[cardIndex];
    if (!b || b.locked || b.phase !== 5 || unit?.side !== "ally" || !canDiscardCard(unit, card)) return false;
    const p = b.discardPick ||= { unitUid: unit.uid, indexes: [] };
    if (p.unitUid !== unit.uid) p.indexes = [];
    const picked = p.indexes.includes(cardIndex), need = discardNeed(unit);
    if (!picked && p.indexes.filter(i => canDiscardCard(unit, unit.hand[i])).length >= need) return false;
    p.unitUid = unit.uid; p.indexes = picked ? p.indexes.filter(i => i !== cardIndex) : [...p.indexes, cardIndex];
    return true;
  }
  function discardCards(state, unit, cards, label = "一次性弃置") {
    const b = state.battle, normal = cards.filter(c => !c.void), voids = cards.filter(c => c.void);
    window.BattleCards.putMany(b, unit, normal, "discard");
    voids.forEach(card => window.BattleCards.put(b, unit, card, "consumed"));
    window.WendyCadicisSkills?.afterDiscard?.(state, unit, cards, { draw, pushFloat: combat.pushFloat });
    record(state, `${unit.name} ${label} ${cards.map(c => c.name).join("、")}。`);
  }
  function completeDiscardPhase(state, unit) {
    const b = state.battle;
    b.discardPick = null;
    const need = discardNeed(unit);
    if (unit.side === "ally" && need > 0) { record(state, `还需处理${need}张超出手牌。`); return false; }
    discardOverflow(state, unit); return enterEndPhase(state, unit);
  }
  async function confirmDiscard(state, onStep) {
    const b = state.battle, unit = active(b), indexes = selectedDiscardIndexes(b, active(b));
    if (!b || b.locked || b.phase !== 5 || unit?.side !== "ally") return false;
    const need = discardNeed(unit);
    if (need <= 0) { const done = completeDiscardPhase(state, unit); if (onStep) onStep(); if (done && state.battle && !state.battle.locked) await advanceToInput(state, onStep); return true; }
    if (indexes.length < need) { record(state, `还需选择${need - indexes.length}张弃牌。`); if (onStep) onStep(); return true; }
    const cards = [];
    indexes.slice(0, need).forEach(i => { const card = unit.hand[i]; if (canDiscardCard(unit, card)) cards.unshift(unit.hand.splice(i, 1)[0]); });
    if (cards.length < need) { b.discardPick = null; record(state, `可弃手牌发生变化，请重新选择弃牌。`); if (onStep) onStep(); return true; }
    discardCards(state, unit, cards);
    const done = completeDiscardPhase(state, unit);
    if (onStep) onStep(); if (done && state.battle && !state.battle.locked) await advanceToInput(state, onStep); return true;
  }
  async function discardCard(state, cardIndex, onStep) {
    const b = state.battle, unit = active(b);
    if (b?.thunderHammer) return manualFlow.resolveThunderHammer(state, cardIndex, onStep);
    if (!b || b.locked || b.phase !== 5 || unit?.side !== "ally") return false;
    if (visibleHand(unit) > handLimit(unit) && !canDiscardAny(unit)) { const done = completeDiscardPhase(state, unit); if (onStep) onStep(); if (done) await advanceToInput(state, onStep); return true; }
    if (window.MillerSkills?.offerShare?.(state, unit, cardIndex, { canDiscardCard, maxCount: discardNeed(unit) })) { b.discardPick = null; if (onStep) onStep(); return true; }
    const ok = toggleDiscardPick(state, unit, cardIndex);
    if (ok && onStep) onStep();
    return ok;
  }
  function toggleMillerShareCard(state, cardIndex, expectedCard = null) {
    const b = state.battle, picker = b?.millerShare;
    const unit = picker && b.allies.find(item => item.uid === picker.unitUid);
    if (!picker || !unit) return false;
    return window.MillerSkills?.offerShare?.(state, unit, cardIndex, {
      canDiscardCard,
      maxCount: discardNeed(unit),
    }, expectedCard) || false;
  }
  return { enterDiscardOrEnd, completeDiscardPhase, confirmDiscard, discardCard, discardCards, toggleMillerShareCard };
};
