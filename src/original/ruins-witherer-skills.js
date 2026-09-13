window.RuinsWithererSkills = (() => {
  const alive = units => (units || []).filter(unit => unit.hp > 0);
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const stat = (unit, key) => (unit.stats?.[key] || 0)
    + (key === "attack" ? unit.tempAttack || 0 : 0);
  const log = (state, text) => window.BattleLog?.add?.(state, text);
  const isTactic = card => card?.type === "tactic";

  function modifyDamage(state, target, amount, card) {
    if (!target || target.ai !== "ruins_witherer") return amount;
    if (!isTactic(card) || card?._skill) return amount;
    if (target.gender !== "male" && target.gender !== "female") {
      log(state, `${target.name} 的魅魔吸精术触发，对无性别目标伤害翻倍。`);
      return amount * 2;
    }
    return amount;
  }

  function afterDamage(state, actor, target, card, hpLoss, damage) {
    if (!hpLoss) return;
    if (target?.ai === "ruins_witherer") {
      // 混乱状态牌会立刻进入目标手中并显示，等本段受击动画演完再发放
      const confuse = () => giveEyeConfusion(state, actor, target);
      if (!(damage?.delayUntilHitSettled?.(state, confuse)
        || window.BattleDamageLifecycle?.delayUntilHitSettled?.(state, confuse))) confuse();
    }
    if (actor?.ai === "ruins_witherer" && isTactic(card) && !card?._skill) {
      succubusDrain(state, actor, target, damage);
    }
  }

  function giveEyeConfusion(state, attacker, witherer) {
    if (!attacker || attacker.hp <= 0 || attacker === witherer) return;
    const confusion = window.BattleStatusCardRegistry?.create?.("confusion");
    if (confusion) window.BattleStatusCards?.add?.(state, attacker, confusion, witherer.name);
    window.BattleLines?.skill?.(state, witherer, "外神之眼", attacker);
    log(state, `${witherer.name} 的外神之眼触发，使${attacker.name}获得一张混乱状态牌。`);
  }

  function succubusDrain(state, actor, target, damage) {
    if (!target || target.hp <= 0) return;
    if (target.gender === "male") stealFrom(state, actor, target, damage);
    else if (target.gender === "female") discardFrom(state, actor, target);
  }

  function stealFrom(state, actor, target, damage) {
    const candidate = visible(target).find(card =>
      !window.BattleStatusCards?.isStatus?.(card));
    if (!candidate) return;
    const index = target.hand.indexOf(candidate);
    if (index < 0) return;
    target.hand.splice(index, 1);
    if (state.battle?.animQueue) candidate._pendingDraw = true;
    actor.hand.push(candidate);
    state.battle.animQueue?.push({
      type: "stealCard", fromUid: target.uid, fromSide: target.side,
      toUid: actor.uid, toSide: actor.side, count: 1, cards: [candidate],
    });
    window.BattleLines?.skill?.(state, actor, "魅魔吸精术", target);
    log(state, `${actor.name} 的魅魔吸精术触发，获得${target.name}一张${candidate.suit || ""}${candidate.name}。`);
  }

  function discardFrom(state, actor, target) {
    const candidate = visible(target).find(card =>
      !window.BattleStatusCards?.isStatus?.(card));
    if (!candidate) return;
    const index = target.hand.indexOf(candidate);
    if (index < 0) return;
    target.hand.splice(index, 1);
    window.BattleCards?.put?.(state.battle, target, candidate, "discard", { showDiscard: true });
    window.BattleLines?.skill?.(state, actor, "魅魔吸精术", target);
    log(state, `${actor.name} 的魅魔吸精术触发，弃置${target.name}一张${candidate.suit || ""}${candidate.name}。`);
  }

  function endTurn(state, unit) {
    if (unit?.ai !== "ruins_witherer") return;
    const hearts = visible(unit).filter(card => card.suit === "♥");
    if (!hearts.length) return;
    hearts.forEach(card => {
      const index = unit.hand.indexOf(card);
      if (index >= 0) unit.hand.splice(index, 1);
      window.BattleCards?.put?.(state.battle, unit, card, "discard", { showDiscard: true });
    });
    window.BattleLines?.skill?.(state, unit, "百眼魅魔");
    log(state, `${unit.name} 发动百眼魅魔，弃置${hearts.length}张红桃牌。`);
    const allies = alive(state.battle.allies);
    allies.forEach(ally => fireHundredEyes(state, unit, ally, allies));
  }

  function fireHundredEyes(state, witherer, ally, allies) {
    const others = allies.filter(other => other !== ally && other.hp > 0);
    const target = others.length
      ? (window.GameRandom?.sample?.(others, state) || others[0]) : ally;
    if (target === ally) {
      const amount = stat(ally, "attack");
      const before = ally.hp;
      ally.hp = Math.max(0, ally.hp - amount);
      const loss = before - ally.hp;
      if (loss > 0) window.BattleSystem?.pushFloat?.(state.battle, ally.uid, "hp-loss", loss);
      log(state, `${ally.name} 无可攻击目标，百眼魅魔使其受到自身${amount}点伤害。`);
      return;
    }
    const virtual = window.CardUtils?.copyPlayable?.(
      { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "" },
      { temporary: true, void: true, noIntentCost: true, generatedBySkill: "百眼魅魔" });
    if (!virtual) return;
    log(state, `${witherer.name} 的百眼魅魔使${ally.name}对${target.name}视为使用一张虚拟【杀】。`);
    window.BattleCombat?.useVirtualKill?.(state, ally, target, virtual);
  }

  return { modifyDamage, afterDamage, endTurn };
})();
