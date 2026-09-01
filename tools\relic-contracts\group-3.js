/* global BattleCards, BattleRelicTurns, BondiSkills, EnemySkills, GuardKellySkills, UnderwaterTrainSkills */
const {
  assert, combat, card, scenario, contract, equip,
  isKill, allUnits, unit, stateOf, activeHarness,
} = require("../relic-contract-harness");

require("./shark-mask-contract");

contract("震感手炮", () => {
  const source = card("杀（普攻）");
  const { state, actor, target } = scenario([source], []);
  equip(actor, "震感手炮");
  actor.stats.attack = 1;
  BattleRelicTurns.finishPlay(state, actor, (current, text) => current.log.push(text));
  assert.strictEqual(actor.shockHandCannonReady, true);
  window.state = state;
  assert.strictEqual(combat.playActiveCard(state, 0, target.uid), true);
  assert.strictEqual(target.maxHp - target.hp, 2);
  assert.strictEqual(actor.shockHandCannonReady, false);
});

contract("盖亚妮丝护符", () => {
  const holder = equip(unit("护符持有者"), "盖亚妮丝护符");
  const state = stateOf([holder], []);
  const status = BattleStatusCards.create("slime");
  assert.strictEqual(UnderwaterTrainSkills.consumeStatusByCharm(state, holder, status), true);
  assert.strictEqual(holder.consumed[0], status);
  assert.strictEqual(holder.hand.length, 0);
});

contract("圣鹰剑", () => {
  const actor = equip(unit("圣鹰剑持有者", "ally", {
    hand: [{ name: "闪", type: "response" }],
  }), "圣鹰剑");
  const target = unit("圣鹰剑目标", "enemy");
  const state = stateOf([actor], [target]);
  const slash = { name: "杀（普攻）", type: "slash" };
  EnemySkills.beforeKillTargeted(state, actor, target, slash);
  assert.strictEqual(slash.ignoreResponse, true);
  actor.hand = [];
  const normal = { name: "杀（普攻）", type: "slash" };
  EnemySkills.beforeKillTargeted(state, actor, target, normal);
  assert.strictEqual(normal.ignoreResponse, undefined);
});

contract("影王斧", () => {
  const actor = equip(unit("影王斧持有者"), "影王斧");
  const state = stateOf([actor], []);
  assert.strictEqual(BondiSkills.modifyOutgoingDamage(state, actor, 3, { name: "杀（普攻）", type: "slash", suit: "♠" }), 6);
  assert.strictEqual(BondiSkills.modifyOutgoingDamage(state, actor, 3, { name: "杀（普攻）", type: "slash", suit: "♥" }), 3);
});

contract("黑曜石铠甲", () => {
  const target = equip(unit("黑曜石持有者", "enemy"), "黑曜石铠甲");
  const state = stateOf([], [target]);
  assert.strictEqual(BondiSkills.modifyIncomingDamage(state, target, 5, { name: "杀（普攻）", type: "slash" }), 0);
  assert.strictEqual(BondiSkills.modifyIncomingDamage(state, target, 5, { name: "魔法对决", type: "tactic" }), 10);
});

contract("精灵女神守护之剑", () => {
  const actor = equip(unit("守护剑持有者"), "精灵女神守护之剑");
  const target = unit("守护剑目标", "enemy");
  const state = stateOf([actor], [target]);
  GuardKellySkills.afterDamage(state, actor, target, { name: "杀（普攻）", type: "slash" }, 4);
  assert.strictEqual(actor.block, 4);
  GuardKellySkills.afterDamage(state, actor, target, { name: "魔法对决", type: "tactic" }, 3);
  assert.strictEqual(actor.block, 4);
});
