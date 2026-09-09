window.CadicisCardPlan = (() => {
  const { alive, isKill, line, reveal } = window.CadicisSkillUtils;

  function plan(state, actor, deps) {
    if (actor.usedCadicisPlan) return true;
    const selected = deps?.selectedHand?.(state, actor);
    const picked = selected?.ok
      && (isKill(selected.card) || selected.card.type === "tactic")
      ? selected.card : null;
    if (!picked) {
      window.BattleLog.add(state,
        `${actor.name} 没有选择可展示的杀牌或战术牌。`);
      return true;
    }
    actor.usedCadicisPlan = true;
    actor.cadicisPlanName = picked.name;
    line(state, actor, "战场指挥官");
    reveal(state, "战场指挥官", [picked]);
    window.BattleLog.add(state,
      `${actor.name} 展示${picked.suit || ""}${picked.name}并记录作战计划。`);
    return true;
  }

  function applyPlan(state, actor, target, card) {
    const planned = isKill(card) || card?.type === "tactic";
    const cadicis = planned && actor?.side === "ally"
      && state.battle?.allies.find(unit => unit.ref === "cadicis"
        && alive(unit) && unit.uid !== actor?.uid
        && unit.cadicisPlanName === card?.name);
    if (!cadicis) return null;
    if (!card.ignoreResponse) card._tempIgnoreResponse = true;
    card.ignoreResponse = true;
    if (!card.cadicisPlanApplied) {
      card.cadicisPlanApplied = true;
      line(state, cadicis, "战场指挥官", target);
      window.BattleLog.add(state,
        `${actor.name} 按${cadicis.name}记录的${card.name}执行作战计划，伤害翻倍且不可被响应。`);
    }
    return cadicis;
  }

  const modifySlashDamage = (state, actor, target, amount, card) =>
    isKill(card) && applyPlan(state, actor, target, card) ? amount * 2 : amount;
  const modifyTacticDamage = (_state, _actor, _target, amount, card) =>
    card?.type === "tactic" && card.cadicisPlanApplied ? amount * 2 : amount;

  return { plan, applyPlan, modifySlashDamage, modifyTacticDamage };
})();
