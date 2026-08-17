window.GerdaSkills = (() => {
  const alive = unit => unit && unit.hp > 0;
  const hasSkill = (unit, name) => (unit?.skills || []).some(skill => skill.name === name);
  const visibleResponses = unit => (unit?.hand || []).filter(card => !card._pendingDraw && card.type === "response");
  const isKill = card => window.CardUtils?.isKillCard?.(card) || card?.type === "slash" || /杀(?:（[^）]*）)?$/.test(card?.name || "");
  function allowKill(state, actor, target, card) {
    if (!alive(target) || target.ref !== "gerda" || !hasSkill(target, "萌虎跑跑") || !isKill(card) || actor?.uid === target.uid) return true;
    const paid = card._gerdaRunPaid ||= {};
    if (Object.hasOwn(paid, target.uid)) return paid[target.uid];
    const response = visibleResponses(actor)[0];
    if (!response) {
      paid[target.uid] = false;
      window.BattleLines?.skill(state, target, "萌虎跑跑", actor);
      window.BattleLog.add(state, `${actor?.name || "伤害来源"}没有可额外弃置的响应牌，本次【杀】对${target.name}无效。`);
      return false;
    }
    actor.hand.splice(actor.hand.indexOf(response), 1);
    window.BattleCards?.put(state.battle, actor, response, "discard", { showDiscard: true });
    paid[target.uid] = true;
    window.BattleLines?.skill(state, target, "萌虎跑跑", actor);
    window.BattleLog.add(state, `${actor.name}为使【杀】对${target.name}生效，额外弃置了${response.suit || ""}${response.name}。`);
    return true;
  }
  function endTurn(state, unit) {
    const b = state.battle;
    if (!b || !alive(unit) || unit.ref !== "gerda" || !hasSkill(unit, "萌虎慰劳")) return true;
    const targets = b.allies.filter(target => target.uid !== unit.uid && alive(target));
    if (!targets.length) return true;
    b.gerdaComfort = { unitUid: unit.uid };
    b.locked = true;
    window.BattleLog.add(state, `${unit.name}可以发动萌虎慰劳。`);
    return false;
  }
  function resolveComfort(state, targetUid, deps) {
    const b = state.battle, picker = b?.gerdaComfort;
    const unit = picker && b.allies.find(item => item.uid === picker.unitUid);
    const target = targetUid && b.allies.find(item =>
      item.uid === targetUid && item.uid !== unit?.uid && alive(item));
    if (!picker || !unit) return false;
    if (targetUid && !target) return false;
    b.gerdaComfort = null;
    b.locked = false;
    if (!target) {
      window.BattleLog.add(state, `${unit.name}放弃发动萌虎慰劳。`);
      return true;
    }
    const entries = [
      { unit, cards: deps.draw(unit, 2, b) },
      { unit: target, cards: deps.draw(target, 2, b) },
    ];
    window.BattleLines?.skill(state, unit, "萌虎慰劳", target);
    window.BattleLog.add(state, `${unit.name}对${target.name}发动萌虎慰劳，${window.BattleDrawFeedback.team(entries, 2, "双方")}。`);
    return true;
  }
  return { allowKill, endTurn, resolveComfort };
})();
