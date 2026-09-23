/* global BakarRelicSkills, GuardKellySkills, SakuraRisaSkills, WithererRelicSkills */
const {
  assert, combat, card, scenario, contract, equip,
  isKill, allUnits, unit, stateOf, activeHarness,
} = require("../relic-contract-harness");

contract("精灵女神守护之盾", () => {
  const actor = equip(unit("守护盾持有者"), "精灵女神守护之盾");
  const state = stateOf([actor], []);
  GuardKellySkills.afterCardPlayed(state, actor, { name: "蓄力", type: "tactic", _playedFromHand: true });
  GuardKellySkills.afterCardPlayed(state, actor, { name: "虚拟战术", type: "tactic", virtual: true });
  GuardKellySkills.afterCardPlayed(state, actor, { name: "技能战术", type: "tactic", _skill: true });
  assert.strictEqual(actor.block, 1);
});

contract("写给艾尔拉娜的情书", () => {
  const holder = equip(unit("情书持有者"), "写给艾尔拉娜的情书");
  const hurt = unit("受伤女性");
  const male = unit("男性队友", "ally", { gender: "male" });
  const state = stateOf([holder, hurt, male], []);
  const draws = new Map();
  SakuraRisaSkills.afterDamage(state, hurt, 1, (owner, count) => draws.set(owner.uid, count));
  assert.strictEqual(draws.get(holder.uid), 1);
  assert.strictEqual(draws.get(hurt.uid), 1);
  assert.strictEqual(draws.has(male.uid), false);
});

contract("血色刺伞", () => {
  const holder = equip(unit("刺伞持有者"), "血色刺伞");
  const enemy = unit("刺伞目标", "enemy");
  const state = stateOf([holder], [enemy]);
  const used = [];
  SakuraRisaSkills.afterResponse(state, holder, { name: "闪", type: "response" }, {
    useCard(_state, actor, target, usedCard) { used.push({ actor, target, card: usedCard }); },
  });
  assert.strictEqual(used.length, 1);
  assert(used[0].card.virtual && used[0].card.name === "机枪扫杀");
});

contract("凋零者胸部", () => {
  const attacker = unit("胸部攻击者", "enemy");
  const holder = equip(unit("胸部持有者", "ally", {
    hp: 10, maxHp: 20,
    stats: { attack: 0, magic: 3, speed: 0, bloodlust: 2, handLimit: 4 },
  }), "凋零者胸部");
  const mate = unit("胸部治疗目标", "ally", { hp: 5, maxHp: 20 });
  const state = stateOf([holder, mate], [attacker]);
  WithererRelicSkills.afterDamage(state, attacker, holder, { name: "伤害", type: "skill" }, 1, () => {}, () => {}, () => {});
  assert.strictEqual(mate.hp, 8);
  WithererRelicSkills.afterDamage(state, attacker, holder, { name: "护甲伤害", type: "skill" }, 0, () => {}, () => {}, () => {});
  assert.strictEqual(mate.hp, 8);
  holder.hp = 0;
  WithererRelicSkills.afterDamage(state, attacker, holder, { name: "致命伤害", type: "skill" }, 1, () => {}, () => {}, () => {});
  assert.strictEqual(mate.hp, 8);
});

contract("凋零者长舌头", () => {
  const actor = equip(unit("长舌持有者"), "凋零者长舌头");
  const target = unit("长舌目标", "enemy");
  const state = stateOf([actor], [target]);
  WithererRelicSkills.afterDamage(state, actor, target, { name: "杀（普攻）", type: "slash" }, 1);
  assert.strictEqual(actor.stats.handLimit, 5);
  assert.strictEqual(target.stats.handLimit, 3);
  WithererRelicSkills.afterDamage(state, actor, target, { name: "杀（普攻）", type: "slash" }, 0);
  assert.strictEqual(actor.stats.handLimit, 5);
  assert.strictEqual(target.stats.handLimit, 3);
});

contract("1124号镰刀", () => {
  const actor = equip(unit("镰刀持有者"), "1124号镰刀");
  const enemy = unit("镰刀敌人", "enemy", { hp: 0 });
  const friendly = unit("镰刀友军", "ally", { hp: 0 });
  const state = stateOf([actor, friendly], [enemy]);
  state.battle.roundOrder = ["next"];
  state.battle.roundIndex = 1;
  WithererRelicSkills.afterDamage(state, actor, enemy, { name: "杀", type: "slash" }, 1);
  WithererRelicSkills.afterDamage(state, actor, friendly, { name: "杀", type: "slash" }, 1);
  WithererRelicSkills.endTurn(state, actor);
  assert.deepStrictEqual(state.battle.roundOrder, ["next", actor.uid]);
});

contract("1124号长舌头", () => {
  const actor = equip(unit("1124长舌持有者", "ally", { intent: 0 }), "1124号长舌头");
  const target = unit("1124长舌目标", "enemy");
  const ally = unit("1124长舌友军", "ally");
  const state = stateOf([actor], [target]);
  state.battle.allies.push(ally);
  const used = [];
  const skill = { name: "1124号长舌头", type: "tactic", _skill: true, _relicSkill: true, withererTongueActive: true };
  const forgedActor = unit("未装备1124长舌者", "ally", { intent: 0 });
  const forgedTarget = unit("伪造1124长舌目标", "enemy");
  const forgedState = stateOf([forgedActor], [forgedTarget]);
  window.state = forgedState;
  assert.strictEqual(combat.canPlay(forgedActor, skill, forgedState.battle), false);
  assert.strictEqual(WithererRelicSkills.useTongueActive(forgedState, forgedActor, forgedTarget, () => {}), false);
  assert.strictEqual(combat.useCard(forgedState, forgedActor, forgedTarget, { ...skill }), false);
  assert.strictEqual(forgedActor.usedWithererTongue, undefined);
  assert.strictEqual(forgedState.battle.played.length, 0);
  assert.strictEqual(forgedState.log.length, 0);

  window.state = state;
  assert.strictEqual(combat.canPlay(actor, skill, state.battle), true);
  target.hp = 0;
  assert.strictEqual(WithererRelicSkills.useTongueActive(state, actor, target, () => {}), false);
  target.hp = target.maxHp;
  assert.strictEqual(WithererRelicSkills.useTongueActive(state, actor, ally, () => {}), false);
  assert.strictEqual(combat.useCard(state, actor, ally, { ...skill }), false);
  assert.strictEqual(state.battle.played.length, 0);
  assert.strictEqual(WithererRelicSkills.useTongueActive(state, actor, unit("场外1124长舌目标", "enemy"), () => {}), false);
  actor.hp = 0;
  assert.strictEqual(WithererRelicSkills.useTongueActive(state, actor, target, () => {}), false);
  actor.hp = actor.maxHp;
  assert.strictEqual(WithererRelicSkills.useTongueActive(state, actor, target), false);
  const outsider = equip(unit("场外1124长舌持有者", "ally", { intent: 0 }), "1124号长舌头");
  assert.strictEqual(WithererRelicSkills.useTongueActive(state, outsider, target, () => {}), false);
  assert.strictEqual(actor.usedWithererTongue, undefined);
  assert.strictEqual(WithererRelicSkills.useTongueActive(state, actor, target, (_state, _actor, _target, usedCard) => used.push(usedCard)), true);
  assert(used[0].virtual && used[0]._skill && used[0].name === "勒杀");
  assert.strictEqual(WithererRelicSkills.useTongueActive(state, actor, target, () => {}), false);
  assert.strictEqual(used.length, 1);
  assert.strictEqual(combat.canPlay(actor, skill, state.battle), false);
});

contract("军令状", () => {
  const costs = [
    { name: "闪", type: "response", suit: "♥" },
    { name: "看破", type: "response", suit: "♥" },
  ];
  const actor = equip(unit("军令状持有者", "ally", { hand: costs.slice() }), "军令状");
  const target = unit("军令状目标", "enemy");
  const state = stateOf([actor], [target]);
  const used = [];
  const skill = { name: "军令状", type: "tactic", _skill: true, _relicSkill: true, targetless: true, armyOrder: true };
  const forgedCosts = costs.map(item => ({ ...item }));
  const forgedActor = unit("未装备军令状者", "ally", { hand: forgedCosts });
  const forgedState = stateOf([forgedActor], []);
  window.state = forgedState;
  assert.strictEqual(combat.canPlay(forgedActor, skill, forgedState.battle), false);
  assert.strictEqual(BakarRelicSkills.useArmyOrder(
    forgedState, forgedActor, { _bagIndexes: [0, 1] }, () => {},
  ), false);
  assert.strictEqual(combat.useCard(forgedState, forgedActor, forgedActor, {
    ...skill, _bagIndexes: [0, 1],
  }), false);
  assert.deepStrictEqual(forgedActor.hand, forgedCosts);
  assert.strictEqual(forgedActor.discard.length, 0);
  assert.strictEqual(forgedState.battle.played.length, 0);
  assert.strictEqual(forgedState.log.length, 0);

  window.state = state;
  assert.strictEqual(combat.canPlay(actor, skill, state.battle), true);
  assert.strictEqual(combat.useCard(state, actor, actor, {
    ...skill, _bagIndexes: [0, 9],
  }), false);
  assert.strictEqual(state.battle.played.length, 0);
  actor.hp = 0;
  assert.strictEqual(BakarRelicSkills.useArmyOrder(
    state, actor, { _bagIndexes: [0, 1] }, () => {},
  ), false);
  actor.hp = actor.maxHp;
  assert.strictEqual(BakarRelicSkills.useArmyOrder(
    state, actor, { _bagIndexes: [0, 1] },
  ), false);
  const outsider = equip(unit("场外军令状持有者", "ally", { hand: costs.map(item => ({ ...item })) }), "军令状");
  assert.strictEqual(BakarRelicSkills.useArmyOrder(
    state, outsider, { _bagIndexes: [0, 1] }, () => {},
  ), false);
  assert.strictEqual(actor.hand.length, 2);
  assert.strictEqual(actor.discard.length, 0);
  assert.strictEqual(BakarRelicSkills.useArmyOrder(
    state,
    actor,
    { _bagIndexes: [0, 1] },
    (_state, _actor, _target, usedCard) => used.push(usedCard),
  ), true);
  assert.deepStrictEqual(actor.discard.map(item => item.name).sort(), costs.map(item => item.name).sort());
  assert(used[0].virtual && used[0].demonInvasion
    && !used[0].convertedFrom && used[0].generatedBySkill === "军令状");
});

contract("女勇者鲁妮的戒指", () => {
  const actor = equip(unit("戒指持有者", "ally", { hp: 6, maxHp: 20 }), "女勇者鲁妮的戒指");
  const state = stateOf([actor], []);
  assert.strictEqual(BakarRelicSkills.modifyOutgoingDamage(state, actor, 4, { name: "杀（普攻）", type: "slash" }), 8);
  ["demonInvasion", "magicBullet", "duel", "magicDuel", "reckless"].forEach(flag => {
    assert.strictEqual(BakarRelicSkills.modifyOutgoingDamage(state, actor, 4, { name: flag, type: "tactic", [flag]: true }), 8);
  });
  assert.strictEqual(BakarRelicSkills.modifyOutgoingDamage(state, actor, 4, { name: "放血", type: "tactic", bloodletting: true }), 4);
  actor.hp = 7;
  assert.strictEqual(BakarRelicSkills.modifyOutgoingDamage(state, actor, 4, { name: "杀（普攻）", type: "slash" }), 4);
});
