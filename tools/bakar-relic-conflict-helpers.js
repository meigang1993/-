const assert = require("assert");
const { combat, card, scenario: baseScenario } = require("./pursue-kill-fixtures");

function scenario(...args) {
  const current = baseScenario(...args);
  current.actor.stats.attack = 1;
  return current;
}

function armyOrder(indexes = [0, 1]) {
  return {
    name: "军令状", type: "tactic", _skill: true, skillName: "军令状",
    armyOrder: true, targetless: true, _bagIndexes: indexes,
  };
}

function lowHp(unit, relics) {
  unit.hp = 9;
  unit.maxHp = 30;
  unit.battleRelics = relics;
}

function play(state, index, targetUid) {
  window.state = state;
  assert.strictEqual(combat.playActiveCard(state, index, targetUid), true);
}

function aiArmyOrderMove(suits) {
  const { state, actor, target } = scenario(suits.map((suit, index) =>
    card(index ? "看破" : "闪", { type: "response", suit })), []);
  actor.side = "enemy";
  target.side = "ally";
  actor.skills = [{
    name: "军令状", type: "active", source: "relic",
    card: { name: "军令状", type: "tactic", targetless: true, armyOrder: true },
  }];
  actor.battleRelics = ["军令状"];
  state.battle.allies = [target];
  state.battle.enemies = [actor];
  window.state = state;
  return window.BattleAI.choose(state.battle, actor, combat.canPlay);
}

module.exports = {
  aiArmyOrderMove,
  armyOrder,
  assert,
  card,
  combat,
  lowHp,
  play,
  scenario,
};
