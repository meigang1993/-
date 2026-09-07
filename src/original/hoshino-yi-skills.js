window.HoshinoYiSkills = (() => {
  const suits = ["♥", "♦", "♠", "♣"];
  const alive = unit => unit && unit.hp > 0;
  const hasSkill = (unit, name) => (unit?.skills || []).some(skill => skill.name === name);
  const MISSION_TARGET = 20;
  const stat = (unit, key) => (unit.stats?.[key] || 0) + (key === "attack" ? (unit.tempAttack || 0) : key === "magic" ? (unit.tempMagic || 0) : 0);
  const color = suit => ["♥", "♦"].includes(suit) ? "red" : ["♠", "♣"].includes(suit) ? "black" : "";

  function afterCardPlayed(state, actor, target, card, deps) {
    if (card?._repeat || !alive(actor) || actor.ref !== "hoshino_yi") return;
    if (!actor.hoshinoMissionResult) actor.hoshinoMissionCards = (actor.hoshinoMissionCards || 0) + 1;
    const currentColor = color(card.suit), previousColor = actor.hoshinoLastColor;
    const previousSuit = actor.hoshinoLastSuit;
    if (currentColor && previousColor && currentColor !== previousColor && hasSkill(actor, "偶像之星")) {
      const entries = [{ unit: actor, cards: deps.draw(actor, 1, state.battle) }];
      const nonoka = state.battle.allies.find(unit => unit.ref === "nonoka" && alive(unit));
      if (nonoka) entries.push({ unit: nonoka, cards: deps.draw(nonoka, 1, state.battle) });
      window.BattleLines?.skill(state, actor, "偶像之星", nonoka);
      const result = nonoka
        ? window.BattleDrawFeedback.team(entries, 1, "双方")
        : `${actor.name}${window.BattleDrawFeedback.action(actor, 1, entries[0].cards)}`;
      window.BattleLog.add(state, `${actor.name}交替使用不同颜色的牌，${result}。`);
    }
    if (currentColor) actor.hoshinoLastColor = currentColor;
    if (suits.includes(card.suit)) {
      if (actor.hoshinoMissionResult === "success" && previousSuit && previousSuit !== card.suit) {
        actor.tempAttack = (actor.tempAttack || 0) + 1;
        actor.tempMagic = (actor.tempMagic || 0) + 1;
        window.BattleLog.add(state, `${actor.name}使用不同花色的牌，梦想真理令其本回合攻击力和魔力各+1。`);
      }
      actor.hoshinoLastSuit = card.suit;
      actor.hoshinoSuitSet = [...new Set([...(actor.hoshinoSuitSet || []), card.suit])];
      if (actor.hoshinoSuitSet.length === 4) resolveSuitCycle(state, actor, deps);
    }
    if (!actor.hoshinoMissionResult && actor.hoshinoMissionCards >= MISSION_TARGET) resolveMission(state, actor, "success");
  }

  function resolveSuitCycle(state, actor, deps) {
    actor.hoshinoSuitSet = [];
    window.BattleLines?.skill(state, actor, "巨蛋演出");
    const amount = stat(actor, "attack") + stat(actor, "magic");
    const damageCard = {
      name: "巨蛋演出",
      type: "skill",
      magicDamage: true,
      attackType: "magic",
      hybridAttack: true,
      skipDamageModify: true,
    };
    state.battle.enemies.filter(alive).forEach(enemy => {
      if (alive(enemy)) {
        deps.damage(state, enemy, amount, "巨蛋演出", actor, damageCard);
      }
    });
    window.BattleLog.add(state, `${actor.name}集齐四种花色，巨蛋演出对敌方全体造成${amount}点物理魔法复合伤害。`);
    if (actor.hoshinoMissionResult !== "failure") return;
    state.battle.enemies.filter(alive).forEach(enemy => {
      const index = enemy.hand.findIndex(card => !card._pendingDraw);
      if (index < 0) {
        window.BattleLog.add(state, `${enemy.name}没有可弃置的手牌。`);
        return;
      }
      const discarded = enemy.hand.splice(index, 1)[0];
      window.BattleCards?.put(state.battle, enemy, discarded, "discard", { forcedDiscard: true });
      window.BattleLog.add(state, `${actor.name}的梦想真理令${enemy.name}弃置${discarded.suit || ""}${discarded.name}。`);
    });
  }

  function endTurn(state, unit) {
    if (unit?.ref !== "hoshino_yi") return;
    delete unit.hoshinoLastColor;
    delete unit.hoshinoLastSuit;
    unit.hoshinoSuitSet = [];
    if (!alive(unit) || unit.hoshinoMissionResult) return;
    unit.hoshinoMissionTurns = (unit.hoshinoMissionTurns || 0) + 1;
    if (unit.hoshinoMissionTurns >= 3) resolveMission(state, unit, unit.hoshinoMissionCards >= MISSION_TARGET ? "success" : "failure");
  }

  function resolveMission(state, actor, result) {
    actor.hoshinoMissionResult = result;
    delete actor.hoshinoMissionCards;
    actor.art = "./assets/new-portraits/hoshino-yi-witherer.webp";
    actor.avatar = actor.art;
    window.BattleLines?.skill(state, actor, result === "success" ? "梦想真理成功" : "梦想真理失败");
    const nonoka = state.battle.allies.find(unit => unit.ref === "nonoka" && alive(unit));
    const kaiichi = state.battle.allies.find(unit => unit.ref === "hoshino_kaiichi" && alive(unit));
    if (nonoka) window.BattleLines?.skill(state, nonoka, "梦想真理揭露", actor);
    if (kaiichi) window.BattleLines?.skill(state, kaiichi, "梦想真理亲子", actor);
    window.BattleLog.add(state, `${actor.name}的梦想真理${result === "success" ? "成功" : "失败"}。`);
  }

  return { afterCardPlayed, endTurn };
})();
