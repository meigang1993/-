window.BattlePreparePrompts = (api) => {
  const { active, waitEffects, continueStartPhase, shouldPromptReckless, shouldPromptSpeedAssault, shouldPromptMimic, shouldPromptExtract, record, allUnits, tempAttack, combat, finishTurn, advanceToInput } = api;
  const actionGuard = state => window.BattleActionGuard?.guard?.(state)
    || window.AppRuntimeErrors?.guard?.(state)
    || (() => !window.state || window.state === state);
  async function skipExtract(state, onStep) { const current = actionGuard(state), b = state.battle, unit = active(b); if (!b || b.locked || b.phase !== 1 || (b.awaitingExtractUid !== unit?.uid && b.awaitingMimicUid !== unit?.uid && b.awaitingSpeedAssaultUid !== unit?.uid)) return; if (b.awaitingSpeedAssaultUid === unit.uid && shouldPromptMimic(unit)) { b.awaitingSpeedAssaultUid = null; b.awaitingMimicUid = unit.uid; record(state, `${unit.name} 可以发动模仿之音。`); if (onStep) onStep(); return; } if ((b.awaitingSpeedAssaultUid === unit.uid || b.awaitingMimicUid === unit.uid) && shouldPromptExtract(unit, b)) { b.awaitingSpeedAssaultUid = null; b.awaitingMimicUid = null; b.awaitingExtractUid = unit.uid; b.extractPrompted = true; record(state, `${unit.name} 可以发动榨取精华。`); if (onStep) onStep(); return; } continueStartPhase(state, unit); if (onStep) onStep(); await waitEffects(); if (!current() || !state.battle || state.battle.locked || state.battle.activeUid !== unit.uid) return; if (unit.skipPlayPhase) { record(state, `${unit.name} 因眩晕跳过出牌阶段。`); const done = finishTurn(state); if (onStep) onStep(); if (!done) return; await advanceToInput(state, onStep, current); return; } state.battle.phase = 4; window.SakuraRisaSkills?.playPhaseStart?.(state, unit); record(state, `${unit.name} 可以出牌。`); if (onStep) onStep(); }
  function resolveJudgement(unit, state) { (unit.statuses || []).filter(s => /诅咒|延时|拼花失败/.test(s)).forEach(s => record(state, `${unit.name} 判定${s}。`)); window.UnderwaterTrainSkills?.judgement?.(state, unit); }
  function queueRecklessPrompt(state, unit) { state.battle.recklessPrompt = { uid: unit.uid, selectedIndex: 0 }; state.battle.locked = true; record(state, `${unit.name} 可以打出无谋冲拳。`); }
  function autoReckless(state, unit, b) {
    const card = unit.hand.find(c => c.reckless && !c._pendingDraw);
    unit.recklessPromptDone = true;
    if (card) triggerReckless(state, unit, card, b);
  }
  function triggerReckless(state, unit, card, b) {
    if (!b || !card?.reckless || !unit.hand.includes(card)) return false; const targets = (unit.side === "enemy" ? b.allies : b.enemies).filter(u => u.hp > 0); if (!targets.length) return false;
    const visualHandBefore = window.BattleCards.visibleHandCount(unit);
    unit.hand.splice(unit.hand.indexOf(card), 1); window.BattleCards.put(b, unit, card, "discard", { skipAnim: true }); const target = window.GameRandom.sample(targets, state), amount = tempAttack(unit);
    window.BattleCards.queueResponse(b, unit,
      { type: "response", id: window.GameRandom.id("reckless"), uid: unit.uid, side: unit.side, card },
      visualHandBefore);
    window.NonokaLokiSkills?.afterCardResponded?.(state, unit, target, card, window.BattleSystem);
    record(state, `${unit.name} 打出无谋冲拳，冲向${target.name}。`); combat.damage(state, target, amount, "无谋冲拳", unit, { ...card, type: "skill", ignoreResponse: true }); combat.checkEnd(state); return true;
  }
  async function resolveReckless(state, useCard, index = 0, onStep) {
    const current = actionGuard(state), b = state.battle, p = b?.recklessPrompt, unit = p && allUnits(b).find(u => u.uid === p.uid);
    if (!p || !unit) return false;
    const cards = unit.hand.filter(c => c.reckless && !c._pendingDraw), card = cards[Math.max(0, Math.min(index || 0, cards.length - 1))];
    b.recklessPrompt = null; b.locked = false; unit.recklessPromptDone = true;
    if (useCard && card) triggerReckless(state, unit, card, b); else record(state, `${unit.name} 保留无谋冲拳。`);
    if (onStep) onStep(); await waitEffects(); if (!current() || !state.battle || state.battle.locked || state.battle.activeUid !== unit.uid) return true;
    if (shouldPromptReckless(unit, state.battle)) { queueRecklessPrompt(state, unit); if (onStep) onStep(); return true; }
    if (shouldPromptSpeedAssault(unit, state.battle)) { state.battle.awaitingSpeedAssaultUid = unit.uid; record(state, `${unit.name} 可以发动神速之袭。`); if (onStep) onStep(); return true; }
    if (shouldPromptMimic(unit)) { state.battle.awaitingMimicUid = unit.uid; record(state, `${unit.name} 可以发动模仿之音。`); if (onStep) onStep(); return true; }
    if (shouldPromptExtract(unit, state.battle)) { state.battle.awaitingExtractUid = unit.uid; state.battle.extractPrompted = true; record(state, `${unit.name} 可以发动榨取精华。`); if (onStep) onStep(); return true; }
    continueStartPhase(state, unit); if (onStep) onStep(); await waitEffects(); if (!current() || !state.battle || state.battle.locked || state.battle.activeUid !== unit.uid) return true;
    state.battle.phase = 4; window.SakuraRisaSkills?.playPhaseStart?.(state, unit); record(state, `${unit.name} 可以出牌。`); if (onStep) onStep(); return true;
  }
  return { skipExtract, resolveReckless, triggerReckless, resolveJudgement, queueRecklessPrompt, autoReckless };
};
