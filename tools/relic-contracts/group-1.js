/* global BattleCardSpecials, BattleDamageResponses, BattleRelicTurns, BattleSetup, EnemySkills, GuestCharacterSkills, UICommon */
const {
  assert, combat, card, scenario, contract, equip,
  isKill, allUnits, unit, stateOf,
} = require("../relic-contract-harness");

contract("母亲照片", () => {
  const holder = equip(unit("照片持有者"), "母亲照片");
  const dead = equip(unit("倒下的照片持有者", "ally", { hp: 0 }), "母亲照片");
  const state = stateOf([holder, dead], []);
  let draws = 0;
  EnemySkills.onHeal(state, (owner, count) => { draws += count; owner.hand.push({ name: "摸牌" }); });
  assert.strictEqual(draws, 1);
  assert.strictEqual(holder.hand.length, 1);
  assert.strictEqual(dead.hand.length, 0);
});

contract("艾尔拉娜大型注射器", () => {
  const actor = equip(unit("注射器持有者"), "艾尔拉娜大型注射器");
  const low = unit("低生命队友", "ally", { hp: 3, maxHp: 12 });
  const high = unit("高生命队友", "ally", { hp: 8, maxHp: 12 });
  const state = stateOf([actor, low, high], []);
  const specials = BattleCardSpecials(
    { isKillCard: isKill, draw() {}, nextAnim: () => 1 },
    {
      sameSideUnits: () => state.battle.allies,
      statOf: () => 0, pushFloat() {}, damage() {},
    },
  );
  specials.healBySyringe(state, actor, { name: "杀（普攻）", type: "slash", totalHpLoss: 4 });
  assert.strictEqual(low.hp, 7);
  assert.strictEqual(high.hp, 8);
});

contract("艾尔拉娜白色丝袜", () => {
  const slash = card("杀（普攻）");
  const { state, actor, target } = scenario([slash], []);
  equip(actor, "艾尔拉娜白色丝袜");
  actor.stats.speed = 3;
  window.state = state;
  assert.strictEqual(combat.playActiveCard(state, 0, target.uid), true);
  assert.strictEqual(target.maxHp - target.hp, 3);
});

contract("克罗研究记录", () => {
  const actor = equip(unit("记录持有者"), "克罗研究记录");
  const target = unit("记录目标", "enemy");
  const state = stateOf([actor], [target]);
  const used = [];
  const specials = BattleCardSpecials(
    { draw() {}, nextAnim: () => 1 },
    { useCard(_state, _actor, _target, usedCard) { used.push(usedCard); } },
  );
  const tactic = { name: "蓄力", type: "tactic", _playedFromHand: true };
  assert.strictEqual(specials.repeatTactic(state, actor, target, tactic), true);
  assert.strictEqual(used.length, 1);
  assert(used[0]._repeat && used[0]._skill);
  assert.strictEqual(specials.repeatTactic(state, actor, target, tactic), false);
  actor.usedKrowRecord = false;
  assert.strictEqual(specials.repeatTactic(
    state, actor, target, { name: "虚拟战术", type: "tactic", virtual: true }
  ), false);
});

contract("格林机枪", () => {
  const first = card("杀（普攻）");
  const second = card("杀（普攻）");
  const { state, actor, target } = scenario([first, second], []);
  equip(actor, "格林机枪");
  actor.stats.attack = 1;
  window.state = state;
  assert.strictEqual(combat.playActiveCard(state, 0, target.uid), true);
  assert.strictEqual(target.maxHp - target.hp, 2);
  assert.strictEqual(actor.intent, 1);
  assert.strictEqual(actor.usedGreenGatling, true);
});

contract("霹雳之锤", () => {
  const source = card("杀（普攻）");
  const cost = card("看破", { type: "response" });
  const dodge = card("闪", { type: "response" });
  const { state, actor, target } = scenario([cost], [dodge]);
  equip(actor, "霹雳之锤");
  actor.discard.push(source);
  const responses = BattleDamageResponses({
    deps: { isKillCard: isKill, nextAnim: () => 1 },
    ctx: { allUnits, hasSkill: () => false, clearSelection() {}, checkEnd() {} },
    canDodge: (_attack, response) => response.name === "闪",
    damage() {}, hitWithoutDodge() {}, finalizeDamage() {},
    triggers: { afterDodged() {} },
  });
  assert.strictEqual(responses.autoDodge(state, actor, target, 1, source.name, source, dodge), true);
  assert(state.battle.thunderHammer);
  assert.strictEqual(responses.resolveThunderHammer(state, 0), true);
  assert.strictEqual(actor.discard.includes(cost), true);
});

contract("妖刀村雨", () => {
  const actor = equip(unit("村雨持有者"), "妖刀村雨");
  actor.stats.attack = 1;
  const weak = unit("低生命目标", "enemy", { hp: 5 });
  const strong = unit("高生命目标", "enemy", { hp: 10 });
  const state = stateOf([actor], [strong, weak]);
  window.state = state;
  assert.strictEqual(BattleRelicTurns.prepare(state, actor, combat.useCard, (current, text) => current.log.push(text)), true);
  assert.strictEqual(weak.hp, 4);
  assert.strictEqual(strong.hp, 10);
  assert.strictEqual(actor.playedSlashThisTurn, undefined);
  assert.strictEqual(actor.intent, 2);
});
