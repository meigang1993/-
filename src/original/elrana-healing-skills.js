window.ElranaHealingSkills = deps => {
  const { alive, visible, red, stat, line } = deps;

  function elranaHeal(state, actor, target, api, ctx) {
    const index = ctx?.selectedCostCard ? ctx.selectedCostCard(actor) : state.battle.selectedCardIndex;
    const cost = actor.hand[index];
    if (actor.usedElranaHeal || !target || !cost || cost._pendingDraw) return true;
    actor.usedElranaHeal = true;
    actor.hand.splice(index, 1);
    window.BattleCards?.put(state.battle, actor, cost, "discard", { showDiscard: true });
    const hand = visible(actor);
    const amount = hand.length + ctx.statOf(actor, "magic");
    const team = hand.length && hand.every(red) ? state.battle.allies.filter(alive) : [target];
    line(state, actor, "回春之手", target);
    const assistToken = { name: "回春之手" };
    if (team.length > 1) healGroup(state, team, amount, actor, "回春之手", api, assistToken);
    else heal(state, target, amount, actor, "回春之手", api, assistToken);
    window.ElranaFallenPhysicianSkinFX?.heal?.(state, actor, target, team.length > 1);
    window.BattleLog.add(state,
      `${actor.name} 弃置${cost.suit || ""}${cost.name}发动回春之手，${team.length > 1 ? "我方全体" : target.name}恢复${amount}点生命。`);
    return true;
  }

  function heal(state, target, amount, actor, source, api, assistToken) {
    const card = { name: source };
    const healed = window.EnemySkills?.beforeHeal?.(state, target, amount, actor, card, api.damage)
      ?? Math.min(target.maxHp - target.hp, Math.max(0, amount));
    if (healed > 0) {
      target.hp = Math.min(target.maxHp, target.hp + healed);
      window.BattleStats?.heal?.(state.battle, actor, healed);
      api.pushFloat?.(state.battle, target.uid, "heal", healed);
      window.EnemySkills?.clearHolyScar?.(state, target);
      window.EnemySkills?.onHeal?.(state, api.draw);
      window.BertisGerlotSkills?.refreshArrogance?.(state);
      afterHeal(state, target, api, actor, assistToken);
      if (source !== "回春之手" && source !== "再生肉体") {
        window.ElranaFallenPhysicianSkinFX?.heal?.(state, actor, target);
      }
    }
    return healed;
  }

  function healGroup(state, targets, amount, actor, source, api, assistToken) {
    const card = { name: source, _groupHeal: true };
    let any = false;
    targets.forEach(target => {
      const cap = Math.min(target.maxHp - target.hp, Math.max(0, amount));
      const blocked = cap > 0
        && window.EnemySkills?.beforeHeal?.(state, target, amount, actor, card, api.damage) === 0;
      const healed = blocked ? 0 : cap;
      if (healed > 0) {
        target.hp = Math.min(target.maxHp, target.hp + healed);
        window.BattleStats?.heal?.(state.battle, actor, healed);
        window.EnemySkills?.clearHolyScar?.(state, target);
        any = true;
        window.EnemySkills?.onHeal?.(state, api.draw);
        afterHeal(state, target, api, actor, assistToken);
      }
      api.pushFloat?.(state.battle, target.uid, "heal", healed);
    });
    if (any) window.BertisGerlotSkills?.refreshArrogance?.(state);
  }

  function afterHeal(state, target, api, healer, assistToken) {
    if (!state.battle || !target || target.side !== "ally" || target.hp <= 0) return;
    const elrana = state.battle.allies.find(unit => unit.ref === "elrana" && alive(unit));
    if (!elrana) return;
    line(state, elrana, "疗后护理", target);
    window.ElranaFallenPhysicianSkinFX?.care?.(state, elrana, target);
    const drawn = api.draw?.(target, 1, state.battle);
    window.BattleLog.add(state, `${elrana.name} 触发疗后护理，${target.name}${window.BattleDrawFeedback.action(target, 1, drawn)}。`);
    assistMother(state, healer, elrana, api, assistToken);
  }

  function assistMother(state, healer, elrana, api, assistToken) {
    if (healer?.ref !== "elrana" || !alive(elrana) || assistToken?.littleElranaAssistDone) return;
    const little = state.battle?.allies.find(unit => unit.ref === "little_elrana" && alive(unit));
    if (!little) return;
    if (assistToken) assistToken.littleElranaAssistDone = true;
    line(state, little, "协助母亲", elrana);
    const drawn = api.draw?.(elrana, 1, state.battle);
    window.BattleLog.add(state, `${little.name} 触发协助母亲，${elrana.name}${window.BattleDrawFeedback.action(elrana, 1, drawn)}。`);
  }

  function endTurn(state, unit, api) {
    if ((unit?.ref !== "elrana" && unit?.ref !== "little_elrana") || !alive(unit)) return;
    const amount = visible(unit).filter(red).length + stat(unit, "magic");
    const skill = unit.ref === "little_elrana" ? "再生之躯" : "再生肉体";
    line(state, unit, skill);
    if (unit.hp >= unit.maxHp) {
      const drawn = api.draw?.(unit, 1, state.battle);
      window.ElranaFallenPhysicianSkinFX?.regenerate?.(state, unit, true);
      const result = window.BattleDrawFeedback.action(unit, 1, drawn);
      window.BattleLog.add(state, `${unit.name} 生命已满，${skill}${unit.drawLockedThisTurn ? result : `改为${result}`}。`);
      return;
    }
    const healed = heal(state, unit, amount, unit, skill, api);
    window.ElranaFallenPhysicianSkinFX?.regenerate?.(state, unit, false);
    window.BattleLog.add(state, `${unit.name} 触发${skill}，恢复${healed}点生命。`);
  }

  return { elranaHeal, heal, healGroup, afterHeal, endTurn };
};
