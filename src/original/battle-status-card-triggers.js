window.BattleStatusCardTriggers = (() => {
  const { isStatus, keyOf, sync } = window.BattleStatusCardRegistry;
  const { consumeRemoved } = window.BattleStatusCardStorage;
  const visible = unit => (unit?.hand || []).filter(card => !card._pendingDraw);
  const black = card => ["♠", "♣"].includes(card?.suit);
  const red = card => ["♥", "♦"].includes(card?.suit);

  function drawJudge(state, unit, skill, successOf) {
    window.BattlePileStats?.reshuffle(unit);
    const card = unit.deck.pop() || { suit: "♠", name: "判定" };
    const success = successOf(card);
    if (!card._pendingDraw) unit.discard.push(card);
    state.battle.animQueue?.push({
      type: "judgement", id: window.GameRandom.id("sc"), skill,
      suit: card.suit, name: card.name, card, discardTo: unit.discard,
      success, color: black(card) ? "black" : "red", uid: unit.uid,
    });
    return { card, success };
  }

  function judgement(state, unit) {
    visible(unit).filter(isStatus).forEach(status => {
      const key = keyOf(status);
      if (!["stun", "seal", "paralysis", "confusion", "freeze"].includes(key)) return;
      const judgeOf = key === "stun" ? black
        : key === "seal" ? red
        : key === "paralysis" ? card => card.suit === "♥" || card.suit === "♠"
        : key === "confusion" ? card => card.suit === "♠" || card.suit === "♥"
        : card => card.suit === "♦" || card.suit === "♣";
      const { card, success } = drawJudge(state, unit, status.name, judgeOf);
      if (success && key === "stun") unit.skipPlayPhase = true;
      if (success && key === "seal") {
        unit.skipDrawPhase = true;
        unit.drawLockedThisTurn = true;
      }
      if (success && key === "paralysis") unit.skipPlayPhase = true;
      if (success && key === "freeze") unit.frozenSlash = true;
      if (success && key === "confusion") triggerConfusion(state, unit);
      const resultMap = {
        stun: "跳过出牌阶段", seal: "跳过摸牌阶段且本回合无法摸牌",
        paralysis: "本回合无法使用牌", freeze: "本回合无法使用【杀】牌",
        confusion: "随机对我方其他角色视为使用虚拟【杀】",
      };
      window.BattleLog.add(state,
        `${unit.name} 的${status.name}判定：${card.suit}${card.name}，${success ? resultMap[key] : "未触发"}。`);
    });
  }

  function triggerConfusion(state, unit) {
    const allies = (unit.side === "ally" ? state.battle?.allies : state.battle?.enemies) || [];
    const others = allies.filter(target => target !== unit && target.hp > 0);
    const target = others.length ? window.GameRandom?.sample?.(others, state) || others[0] : unit;
    if (!target) return;
    const virtual = window.CardUtils?.copyPlayable?.(
      { name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "" },
      { temporary: true, void: true, noIntentCost: true, generatedBySkill: "混乱" });
    if (!virtual) return;
    window.BattleLines?.skill?.(state, unit, "混乱");
    window.BattleLog.add(state, `${unit.name} 的混乱触发，对${target.name}视为使用一张虚拟【杀】。`);
    window.BattleCombat?.useVirtualKill?.(state, unit, target, virtual);
  }

  function triggerLandmine(state, holder) {
    if (!holder) return false;
    const landmine = (holder.hand || []).find(card => keyOf(card) === "landmine");
    if (!landmine) return false;
    const amount = landmine.landmineAttack || 0;
    const index = holder.hand.indexOf(landmine);
    if (index >= 0) holder.hand.splice(index, 1);
    window.BattleCards?.put?.(state.battle, holder, landmine, "consumed");
    if (amount > 0) {
      const before = holder.hp;
      holder.hp = Math.max(0, holder.hp - amount);
      const loss = before - holder.hp;
      if (loss > 0) {
        window.BattleSystem?.pushFloat?.(state.battle, holder.uid, "hp-loss", loss);
        window.BattleLog.add(state, `${holder.name} 的地雷触发，受到${amount}点伤害。`);
      }
    }
    sync(holder, state.battle);
    return true;
  }

  function resolveResistance(state, unit) {
    if (!["elite", "boss"].includes(unit?.type)) return false;
    const status = visible(unit).find(isStatus);
    if (!status) return false;
    const cost = visible(unit).filter(card => !isStatus(card)).slice(0, 2);
    if (cost.length < 2) return false;
    cost.forEach(card => {
      const index = unit.hand.indexOf(card);
      if (index >= 0) unit.hand.splice(index, 1);
    });
    window.BattleCards?.putMany(state.battle, unit, cost, "discard",
      { showDiscard: true });
    consumeRemoved(state, unit, status, false);
    window.BattleLines?.skill?.(state, unit, "霸王色抗性");
    window.BattleLog.add(state,
      `${unit.name} 触发霸王色抗性，弃置${cost.map(card => card.name).join("、")}，移除${status.name}状态牌。`);
    return true;
  }

  return {
    drawJudge, judgement, triggerConfusion, triggerLandmine, resolveResistance,
  };
})();
