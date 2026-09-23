window.UnderwaterTrainSkills = (() => {
  const alive = units => units.filter(u => u.hp > 0);
  const black = c => c?.suit === "♠" || c?.suit === "♣";
  const isSlash = c => window.CardUtils.isKillCard(c);
  const singleSlash = c => window.CardUtils.isSingleKill(c);
  const visible = u => (u?.hand || []).filter(c => !c._pendingDraw);
  const stat = (u, k) => (u.stats?.[k] || 0) + (k === "attack" ? (u.tempAttack || 0) : k === "magic" ? (u.tempMagic || 0) : 0);
  const drawJudgeAny = (b, actor, skill, successOf = () => false) => {
    window.BattlePileStats?.reshuffle(actor);
    const card = actor.deck.pop() || { suit: "♠", name: "判定" }, success = successOf(card);
    if (!card._pendingDraw) actor.discard.push(card);
    const event = { type: "judgement", id: window.GameRandom.id("ut"), skill, suit: card.suit, name: card.name, card, discardTo: actor.discard, success, color: black(card) ? "black" : "red", uid: actor.uid };
    b.animQueue?.push(event);
    return { card, success, event };
  };
  function consumeStatusByCharm(state, target, card) {
    return window.BattleStatusCards?.consumeByCharm?.(state, target, card) || false;
  }
  function canDiscard(_unit, card) { return !window.BattleStatusCards?.isStatus?.(card); }
  function judgement(state, unit) {
    window.BattleStatusCards?.judgement?.(state, unit);
    return !!unit.skipPlayPhase;
  }
  function endTurn(state, unit) {
    if (unit.ai === "shark_captain_mordio" && unit.rageExpireTurn != null && (unit.actionCount || 0) + 1 >= unit.rageExpireTurn) window.BattleLog.add(state, `${unit.name} 的狂鲨之怒增幅恢复。`);
    window.BattleStatusCards?.endTurn?.(state, unit);
  }
  function slimeMove(actor) {
    const card = actor.ai === "shark_pirate_submarine" ? visible(actor).find(c => c.charge) : null;
    return card ? { card, target: actor } : null;
  }
  const combat = window.UnderwaterTrainCombatSkills({ alive, black, isSlash, singleSlash, visible, stat, drawJudgeAny, consumeStatusByCharm });
  const control = window.UnderwaterTrainControlSkills({ alive, black, visible, stat, drawJudgeAny });
  return { ...combat, ...control, judgement, endTurn, consumeStatusByCharm, canDiscard, slimeMove };
})();
