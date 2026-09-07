window.EnemyTacticalSkills = ({
  alive, stat, validSuit, cardRisk, discardOne, status,
}) => {
  function radarMove(state, actor) {
    if (actor.ai !== "radar" || actor.radarUsed) return null;
    const target = alive(state.battle.allies).filter(unit => !unit.lockSuit)
      .sort((first, second) =>
        stat(second, "attack") - stat(first, "attack") || first.hp - second.hp)[0];
    return target
      ? { card: { name: "索敌雷达", _skill: true, radar: true }, target }
      : null;
  }

  function grenadeMove(_state, actor) {
    if (actor.ai !== "krow_doctor" || actor.grenadeUsed) return null;
    return grenadePair(actor)
      ? { card: { name: "毒气手雷", _skill: true, poisonGrenade: true, targetless: true }, target: actor }
      : null;
  }

  function grenadePair(actor) {
    const groups = actor.hand.reduce((map, card, index) => {
      if (!card._pendingDraw && validSuit(card)) {
        (map[card.suit] ||= []).push({ card, index });
      }
      return map;
    }, {});
    return Object.values(groups).filter(list => list.length >= 2)
      .map(list => list.sort((first, second) =>
        cardRisk(first.card) - cardRisk(second.card)).slice(0, 2))
      .sort((first, second) =>
        first.reduce((sum, item) => sum + cardRisk(item.card), 0)
        - second.reduce((sum, item) => sum + cardRisk(item.card), 0))[0] || null;
  }

  function useRadar(state, actor, target) {
    actor.radarUsed = true;
    const card = radarDiscard(actor);
    if (!card) {
      window.BattleLog.add(state, `${actor.name} 发动索敌雷达失败：没有可弃置的牌。`);
      return true;
    }
    target.lockSuit = card.suit;
    window.BattleCards?.put(state.battle, actor, card, "discard", { showDiscard: true });
    window.BattleLines?.skill(state, actor, "索敌雷达");
    window.BattleLog.add(state, `${actor.name} 发动索敌雷达，自弃一张${card.suit}牌并为${target.name}附加${card.suit}锁定标记。`);
    return true;
  }

  function radarDiscard(actor) {
    const handCard = discardOne(actor);
    if (handCard) return handCard;
    window.BattlePileStats?.reshuffle(actor);
    return actor.deck.pop() || null;
  }

  function useGrenade(state, actor) {
    actor.grenadeUsed = true;
    const pair = grenadePair(actor);
    if (!pair) {
      window.BattleLog.add(state, `${actor.name} 发动毒气手雷失败：没有两张花色完全相同的标准花色牌。`);
      return true;
    }
    const discarded = pair.map(item => item.index).sort((a, b) => b - a)
      .map(index => actor.hand.splice(index, 1)[0]);
    window.BattleCards?.putMany?.(
      state.battle, actor, discarded, "discard", { showDiscard: true },
    );
    alive(state.battle.allies).forEach(unit => status.addPoison(state, unit, 1, actor));
    window.BattleLines?.skill(state, actor, "毒气手雷");
    window.BattleLog.add(state, `${actor.name} 弃置${discarded.map(card => `${card.suit}${card.name}`).join("、")}发动毒气手雷，我方全体获得1层毒。`);
    return true;
  }

  return { grenadeMove, radarMove, useGrenade, useRadar };
};
