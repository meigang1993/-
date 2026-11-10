/* global BattleCards, BattleRelicTurns, BattleStatusCards, BondiSkills, EnemySkills, GaianisAmuletSkills, GuardKellySkills, HolyEagleSwordSkills, UnderwaterTrainSkills */
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
  // 旧断言调的是水下列车技能里的旧版兼容层转发函数（饰品重做前的写法）。
  // 重做后效果主体在 GaianisAmuletSkills，这里改成验真正的产品链路：
  // 走真实 add，不入手牌、直接进消耗区。
  const status = BattleStatusCards.create("slime");
  assert.strictEqual(BattleStatusCards.add(state, holder, status, "测试，"), true);
  assert.strictEqual(holder.hand.length, 0);
  assert.strictEqual(holder.consumed[0], status);
  const status2 = BattleStatusCards.create("stun");
  assert.strictEqual(GaianisAmuletSkills.nullifyStatus(state, holder, status2), true);
  assert.strictEqual(holder.consumed[1], status2);
  // 普通牌不得被「无效化」误吞（旧断言没有覆盖这个边界）。
  const normal = { name: "普通战术", type: "tactic" };
  assert.strictEqual(GaianisAmuletSkills.nullifyStatus(state, holder, normal), false);
  assert.strictEqual(holder.consumed.includes(normal), false);
  assert.strictEqual(BattleStatusCards.add(state, holder, normal), true);
  assert.strictEqual(holder.hand.includes(normal), true);
  // 障碍牌对持有者无效，且由其他角色使用时摸一张牌。
  const caster = unit("施术者", "enemy");
  const obstacle = { name: "束缚陷阱", type: "obstacle", statusKey: "stun" };
  const draws = [];
  const draw = (owner, count) => {
    draws.push({ owner, count });
    const gained = { name: "摸牌1", type: "slash" };
    owner.hand.push(gained);
    return [gained];
  };
  assert.strictEqual(GaianisAmuletSkills.resolveObstacle(state, caster, holder, obstacle, draw), true);
  assert.strictEqual(draws.length, 1);
  assert.strictEqual(draws[0].owner, holder);
  assert.strictEqual(draws[0].count, 1);
  // 自己使用不摸牌；未装备则不拦。
  assert.strictEqual(GaianisAmuletSkills.resolveObstacle(state, holder, holder, obstacle, draw), true);
  assert.strictEqual(draws.length, 1);
  assert.strictEqual(GaianisAmuletSkills.resolveObstacle(state, caster, unit("普通人"), obstacle, draw), false);
});

contract("圣鹰剑", () => {
  const actor = equip(unit("圣鹰剑持有者"), "圣鹰剑");
  const target = unit("圣鹰剑目标", "enemy");
  const other = unit("另一目标", "enemy");
  const state = stateOf([actor], [target, other]);
  state.battle.turn = 1;
  const slash = { name: "杀（普攻）", type: "slash" };
  // 旧版「手握闪则不可响应」已移除。
  assert.strictEqual(EnemySkills.beforeKillUsed(state, actor, slash), undefined);
  assert.strictEqual(slash.ignoreResponse, undefined);
  // 未造成过伤害 → 不翻倍；造成伤害后 → 同一目标的下一张翻倍。
  assert.strictEqual(HolyEagleSwordSkills.modifyDamage(state, actor, target, slash, 6), 6);
  assert.strictEqual(HolyEagleSwordSkills.recordHit(state, actor, target, slash, 6), true);
  assert.strictEqual(HolyEagleSwordSkills.modifyDamage(state, actor, target, slash, 6), 12);
  // 换目标 / 跨回合 / 被闪抵消 / 群体杀都不触发。
  assert.strictEqual(HolyEagleSwordSkills.modifyDamage(state, actor, other, slash, 6), 6);
  state.battle.turn = 2;
  assert.strictEqual(HolyEagleSwordSkills.modifyDamage(state, actor, target, slash, 6), 6);
  assert.strictEqual(HolyEagleSwordSkills.recordHit(state, actor, target, slash, 0), false);
  const sweep = { name: "枪林弹雨", type: "slash", sweep: true };
  assert.strictEqual(HolyEagleSwordSkills.recordHit(state, actor, target, sweep, 8), false);
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
