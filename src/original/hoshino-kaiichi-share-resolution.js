window.HoshinoKaiichiShareResolution = ({ alive, allUnits, queue }) => {
  function toggleShareCard(state, index) {
    const prompt = state.battle?.kaiichiShare;
    const unit = prompt && allUnits(state.battle)
      .find(item => item.uid === prompt.unitUid);
    if (!prompt || !unit || !unit.hand[index] || unit.hand[index]._pendingDraw) {
      return false;
    }
    const indexes = [...new Set(prompt.indexes || [])]
      .filter(item => unit.hand[item] && !unit.hand[item]._pendingDraw);
    if (!indexes.includes(index) && indexes.length >= prompt.maxCount) return false;
    prompt.indexes = indexes.includes(index)
      ? indexes.filter(item => item !== index)
      : [...indexes, index];
    return true;
  }

  function resolveShare(state, targetUid) {
    const battle = state.battle;
    const prompt = battle?.kaiichiShare;
    const unit = prompt && allUnits(battle).find(item => item.uid === prompt.unitUid);
    if (!prompt || !unit) return { ok: false };
    if (!targetUid) return finishShare(state, prompt);
    const target = battle.allies.find(item =>
      item.uid === targetUid && item.uid !== unit.uid && alive(item));
    const indexes = [...new Set(prompt.indexes || [])]
      .filter(index => unit.hand[index] && !unit.hand[index]._pendingDraw)
      .sort((left, right) => left - right)
      .slice(0, prompt.maxCount);
    if (!target || !indexes.length) return { ok: false };
    const cards = indexes.map(index => unit.hand[index]);
    const fromBefore = unit.hand.length;
    const toBefore = target.hand.length;
    [...indexes].sort((left, right) => right - left)
      .forEach(index => unit.hand.splice(index, 1));
    cards.forEach(card => { card._pendingDraw = true; });
    battle.animQueue?.push({
      type: "giveCards",
      fromUid: unit.uid,
      fromSide: unit.side,
      toUid: target.uid,
      toSide: target.side,
      count: cards.length,
      cards,
      fromBefore,
      toBefore,
    });
    const received = cards.filter(card =>
      !window.UnderwaterTrainSkills?.consumeStatusByCharm?.(state, target, card));
    target.hand.push(...received);
    window.BattleCards?.syncStatusCards?.(target);
    window.BattleCards?.afterHandLost?.(battle, unit);
    window.BattleLog.add(state, `${unit.name}将${cards.length}张手牌交给${target.name}。`);
    return finishShare(state, prompt);
  }

  function finishShare(state, prompt) {
    const battle = state.battle;
    const unit = allUnits(battle).find(item => item.uid === prompt.unitUid);
    window.BattleLines?.clearSkillCaption?.(state, unit, "半魅魔血", false);
    battle.kaiichiShare = null;
    battle.locked = false;
    const hasMore = !!battle.kaiichiShareQueue?.length;
    if (hasMore) queue.scheduleShare(state);
    return {
      ok: true,
      done: true,
      resumeEnemyUid: hasMore ? null : prompt.resumeEnemyUid,
      resumeUnitUid: hasMore ? null : prompt.resumeUnitUid,
      resumePhase: hasMore ? null : prompt.resumePhase,
    };
  }

  return { toggleShareCard, resolveShare };
};
