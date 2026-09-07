/* global BattleDamage, BattleDiscardFlow, UnderwaterTrainSkills */
const {
  assert, combat, card, scenario, contract, equip,
  isKill, allUnits, unit, stateOf, activeHarness,
} = require("../relic-contract-harness");

contract("母亲怀表", () => {
  const actor = equip(unit("怀表持有者", "ally", {
    hand: [{ name: "甲" }, { name: "乙" }, { name: "丙" }],
    stats: { attack: 0, magic: 0, speed: 0, bloodlust: 2, handLimit: 1 },
  }), "母亲怀表");
  const state = stateOf([actor], []);
  let ended = 0;
  const flow = BattleDiscardFlow({
    active: () => actor, visibleHand: owner => owner.hand.length,
    handLimit: owner => owner.stats.handLimit, canDiscardCard: () => true,
    canDiscardAny: () => true, discardNeed: owner => Math.max(0, owner.hand.length - owner.stats.handLimit),
    discardOverflow() { throw new Error("Mother Watch must skip discard overflow"); },
    enterEndPhase() { ended += 1; return true; }, draw() {}, combat: { pushFloat() {} },
    record() {}, advanceToInput() {}, manualFlow: {},
  });
  assert.strictEqual(flow.enterDiscardOrEnd(state, actor), true);
  assert.strictEqual(ended, 1);
  assert.strictEqual(actor.hand.length, 3);
});

contract("伊迪斯电锯剑", () => {
  const { state, actor, target } = scenario([card("杀（普攻）")], []);
  equip(actor, "伊迪斯电锯剑");
  actor.stats.attack = 1;
  window.state = state;
  assert.strictEqual(combat.playActiveCard(state, 0, target.uid), true);
  assert.strictEqual(target.maxHp - target.hp, 2);
});

contract("白色哥特洛丽塔", () => {
  const actor = unit("哥特裙攻击者");
  const target = equip(unit("哥特裙持有者", "enemy"), "白色哥特洛丽塔");
  const state = stateOf([actor], [target]);
  let draws = 0;
  const damage = BattleDamage(
    { isKillCard: isKill, draw: () => { draws += 1; }, nextAnim: () => 1 },
    {
      allUnits, hasSkill: () => false, checkDefeat: () => false, checkEnd() {},
      holdVisual() {}, visualOf: owner => ({ visualHp: owner.hp, visualBlock: owner.block }),
      pushFloat() {}, clearSelection() {}, statOf: () => 0, queueSlashPlay() {},
    },
  );
  damage.damage(state, target, 1, "杀（普攻）", actor, { name: "杀（普攻）", type: "slash" });
  assert.strictEqual(draws, 1);
});

contract("剪刀刃", () => {
  const actor = equip(unit("剪刀刃持有者", "ally", { deck: [{ name: "红判定", suit: "♥" }] }), "剪刀刃");
  const target = unit("剪刀刃目标", "enemy", { deck: [{ name: "黑判定", suit: "♠" }] });
  const state = stateOf([actor], [target]);
  const slash = { name: "杀（普攻）", type: "slash" };
  UnderwaterTrainSkills.beforeKillTargeted(state, actor, target, slash);
  assert.strictEqual(slash.ignoreResponse, true);
  assert.strictEqual(actor.discard[0].name, "红判定");
  assert.strictEqual(target.discard[0].name, "黑判定");
});

contract("鬼王扑克", () => {
  const source = { name: "闪", type: "response", suit: "♦" };
  const actor = equip(unit("扑克持有者", "ally", { hand: [source] }), "鬼王扑克");
  const target = unit("扑克目标", "enemy");
  const ally = unit("扑克友军", "ally");
  const state = stateOf([actor], [target]);
  state.battle.allies.push(ally);
  const { api, used } = activeHarness(actor, state);
  const skill = { ...GameDataRelics["鬼王扑克"].activeCard, _skill: true };
  window.state = state;
  assert.strictEqual(combat.canPlay(actor, skill, state.battle), true);

  const forgedActor = unit("未装备扑克者", "ally", { hand: [{ name: "闪", type: "response" }] });
  const forgedTarget = unit("伪造扑克目标", "enemy");
  const forgedState = stateOf([forgedActor], [forgedTarget]);
  const forged = activeHarness(forgedActor, forgedState);
  window.state = forgedState;
  assert.strictEqual(combat.canPlay(forgedActor, skill, forgedState.battle), false);
  assert.strictEqual(forged.api.demonPoker(forgedState, forgedActor, forgedTarget, {}), false);
  assert.strictEqual(combat.useCard(forgedState, forgedActor, forgedTarget, { ...skill }), false);
  assert.strictEqual(forgedActor.hand.length, 1);
  assert.strictEqual(forged.used.length, 0);
  assert.strictEqual(forgedState.battle.played.length, 0);
  assert.strictEqual(forgedState.log.length, 0);

  window.state = state;
  target.hp = 0;
  assert.strictEqual(api.demonPoker(state, actor, target, {}), false);
  target.hp = target.maxHp;
  assert.strictEqual(api.demonPoker(state, actor, ally, {}), false);
  assert.strictEqual(api.demonPoker(state, actor, unit("场外扑克目标", "enemy"), {}), false);
  actor.hp = 0;
  assert.strictEqual(api.demonPoker(state, actor, target, {}), false);
  actor.hp = actor.maxHp;
  const noUseCard = BattleCardActiveRelics({}, {
    selectedHand: () => ({ i: 0, card: source, ok: true }),
    moveHand() { throw new Error("invalid poker activation consumed a card"); },
  });
  assert.strictEqual(noUseCard.demonPoker(state, actor, target, {}), false);
  assert.strictEqual(actor.hand.length, 1);
  assert.strictEqual(actor.usedDemonPoker, undefined);
  const oldRandom = Math.random;
  Math.random = () => 0;
  try {
    assert.strictEqual(api.demonPoker(state, actor, target, {}), true);
  } finally {
    Math.random = oldRandom;
  }
  assert.strictEqual(actor.discard[0], source);
  assert.strictEqual(used[0].card.type, "tactic");
  assert(used[0].card._skill && used[0].card._relicSkill);
  actor.hand.push({ name: "备用杀", type: "slash" });
  assert.strictEqual(combat.canPlay(actor, skill, state.battle), false);
  assert.strictEqual(api.demonPoker(state, actor, target, {}), false);
});

contract("名刀鬼切", () => {
  const { state, actor, target } = scenario([card("杀（普攻）")], []);
  equip(actor, "名刀鬼切");
  actor.stats.attack = 1;
  target.hp = 8;
  target.maxHp = 30;
  window.state = state;
  assert.strictEqual(combat.playActiveCard(state, 0, target.uid), true);
  assert.strictEqual(target.hp, 6);
});

contract("武士铠甲", () => {
  const { state, actor, target } = scenario([card("杀（普攻）"), card("杀（普攻）")], []);
  equip(actor, "武士铠甲");
  window.state = state;
  assert.strictEqual(combat.playActiveCard(state, 0, target.uid), true);
  assert.strictEqual(actor.block, 1);
  assert.strictEqual(actor.samuraiArmorUsed, true);
});
