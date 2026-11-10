window.BattleDiscardFlow = (deps) => {
  const { active, visibleHand, handLimit, canDiscardCard, canDiscardAny, discardNeed, discardOverflow, enterEndPhase, draw, combat, record, advanceToInput, manualFlow } = deps;
  function enterDiscardOrEnd(state, unit) {
    const b = state.battle; b.discardPick = null;
    // 阵亡单位没有弃牌阶段：它的手牌由「被击倒，弃置所有手牌」统一处理。
    // 若在此处按手牌超限要求一个死人弃牌，而清手牌的 discardDeadHands 又因
    // 该单位的死亡浮字尚未播完（pendingFatalAnim → checkDefeat 提前返回）
    // 还没执行，回合就会永久停在弃牌阶段等一个无法操作的目标——
    // 表现即「被反制装置反死后卡在弃牌阶段」。
    if (unit.hp <= 0 && !window.SakuraRisaSkills?.pendingRevival?.(unit)) return enterEndPhase(state, unit);
    if (!unit.playedSlashThisTurn && window.RelicSystem?.hasEquipped?.(state, unit, "母亲怀表")) { record(state, `${unit.name} 的母亲怀表触发，跳过弃牌阶段。`); return enterEndPhase(state, unit); }
    const need = discardNeed(unit);
    if (unit.side === "ally" && need > 0) { record(state, `${unit.name} 手牌超过上限，需要弃置${need}张。`); return false; }
    discardOverflow(state, unit); return enterEndPhase(state, unit);
  }
  function selectedDiscardIndexes(b, unit) { return [...new Set(b.discardPick?.indexes || [])].filter(i => canDiscardCard(unit, unit?.hand?.[i])).sort((a, z) => z - a); }
  function toggleDiscardPick(state, unit, cardIndex) {
    const b = state.battle, card = unit?.hand[cardIndex];
    const charm = b?.noaCharmDiscard?.unitUid === unit?.uid ? b.noaCharmDiscard : null;
    if (!b || b.locked || (b.phase !== 5 && !charm) || unit?.side !== "ally" || !canDiscardCard(unit, card)) return false;
    const p = b.discardPick ||= { unitUid: unit.uid, indexes: [] };
    if (p.unitUid !== unit.uid) p.indexes = [];
    const picked = p.indexes.includes(cardIndex), need = charm ? charm.need : discardNeed(unit);
    if (!picked && p.indexes.filter(i => canDiscardCard(unit, unit.hand[i])).length >= need) return false;
    p.unitUid = unit.uid; p.indexes = picked ? p.indexes.filter(i => i !== cardIndex) : [...p.indexes, cardIndex];
    return true;
  }
  function discardCards(state, unit, cards, label = "一次性弃置") {
    const b = state.battle, normal = cards.filter(c => !c.void), voids = cards.filter(c => c.void);
    window.BattleCards.putMany(b, unit, normal, "discard");
    voids.forEach(card => window.BattleCards.put(b, unit, card, "consumed"));
    window.WendyCadicisSkills?.afterDiscard?.(state, unit, cards, { draw, pushFloat: combat.pushFloat });
    // 手牌里的战术牌变少，需重算「魔力增幅」的 tempMagic（见 battle-discard-overflow 同名注释）。
    window.CatherineSkills?.syncMagic?.(state, unit);
    record(state, `${unit.name} ${label} ${cards.map(c => c.name).join("、")}。`);
  }
  function completeDiscardPhase(state, unit) {
    const b = state.battle;
    b.discardPick = null;
    // 同上：阵亡单位不应再被要求弃牌，否则回合卡在弃牌阶段无法推进。
    if (unit.hp <= 0 && !window.SakuraRisaSkills?.pendingRevival?.(unit)) return enterEndPhase(state, unit);
    const need = discardNeed(unit);
    if (unit.side === "ally" && need > 0) { record(state, `还需处理${need}张超出手牌。`); return false; }
    discardOverflow(state, unit); return enterEndPhase(state, unit);
  }
  async function confirmDiscard(state, onStep) {
    const b = state.battle, unit = active(b), indexes = selectedDiscardIndexes(b, active(b));
    const charm = b?.noaCharmDiscard?.unitUid === unit?.uid ? b.noaCharmDiscard : null;
    if (!b || b.locked || (b.phase !== 5 && !charm) || unit?.side !== "ally") return false;
    // 【魅力改造】出牌阶段内的溢出弃牌：与弃牌阶段同一套「选够 N 张 → 确认 →
    // discardCards 一次性结算」，但不进结束阶段，清标记后继续本回合出牌。
    if (charm) {
      // 挂起期间可弃牌可能被偷/被状态牌替换：把 need 重算到实际可弃数，
      // 一张都不可弃时清掉挂起继续出牌。与标准弃牌阶段 !canDiscardAny 兜底同口径，
      // 否则 confirmDiscard 永远停在「还需选择N张弃牌」把回合卡死。
      const available = (unit.hand || []).filter(card => canDiscardCard(unit, card)).length;
      const need = Math.min(charm.need, available);
      if (!canDiscardAny(unit) || need <= 0) {
        b.noaCharmDiscard = null; b.discardPick = null;
        record(state, `${unit.name} 的可弃手牌已变化，魅力改造本次弃置取消。`);
        if (onStep) onStep(); return true;
      }
      if (indexes.length < need) { record(state, `还需选择${need - indexes.length}张弃牌。`); if (onStep) onStep(); return true; }
      const cards = [];
      indexes.slice(0, need).forEach(i => { const card = unit.hand[i]; if (canDiscardCard(unit, card)) cards.unshift(unit.hand.splice(i, 1)[0]); });
      if (cards.length < need) { b.discardPick = null; record(state, `可弃手牌发生变化，请重新选择弃牌。`); if (onStep) onStep(); return true; }
      discardCards(state, unit, cards);
      b.noaCharmDiscard = null;
      b.discardPick = null;
      window.NoaCharmSkills?.balanceHand?.(state, unit, draw);
      if (onStep) onStep();
      return true;
    }
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
    const charm = b?.noaCharmDiscard?.unitUid === unit?.uid ? b.noaCharmDiscard : null;
    if (b?.thunderHammer && !charm) return manualFlow.resolveThunderHammer(state, cardIndex, onStep);
    if (!b || b.locked || (b.phase !== 5 && !charm) || unit?.side !== "ally") return false;
    if (!charm && visibleHand(unit) > handLimit(unit) && !canDiscardAny(unit)) { const done = completeDiscardPhase(state, unit); if (onStep) onStep(); if (done) await advanceToInput(state, onStep); return true; }
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
