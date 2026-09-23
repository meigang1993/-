const assert = require("assert");
const {
  combat, card, scenario, equip,
} = require("./relic-contract-harness");

require("../src/original/battle-damage-attributes.js");

const lines = [];
window.BattleLines = {
  skill(_state, unit, name, target) {
    lines.push({ unit, name, target });
  },
};

function setup(actor, state, stats = {}) {
  Object.assign(actor, {
    ref: "ophelia", name: "奥菲莉亚", hp: 20, maxHp: 20, intent: 1,
  });
  Object.assign(actor.stats, {
    attack: 2, magic: 4, bloodlust: 1, ...stats,
  });
  window.state = state;
}

function play(source, targetHand, configure = () => {}) {
  const current = scenario([source], targetHand);
  setup(current.actor, current.state);
  configure(current);
  assert.strictEqual(
    combat.playActiveCard(current.state, 0, current.target.uid), true,
  );
  return current;
}

const physical = card("雷杀");
const magic = card("魔杀");
const group = card("机枪扫杀");
const preview = scenario([physical], []);
setup(preview.actor, preview.state, { magic: 7 });
assert.strictEqual(CardUtils.damageStatKey(preview.actor, physical), "magic");
assert.strictEqual(
  BattleDamageAttributes.attackType(physical, physical.name, preview.actor),
  "magic",
);
assert.strictEqual(CardUtils.damageStatKey(preview.actor, magic), "magic");
assert.strictEqual(
  BattleDamageAttributes.attackType(group, group.name, preview.actor),
  "physical",
);

const basic = play(card("杀（普攻）"), [
  card("杀（普攻）"), card("生命之泉"),
], ({ target }) => {
  target.hp = target.maxHp = 100;
});
assert.strictEqual(100 - basic.target.hp, 8);
assert.strictEqual(basic.actor.intent, 0);
assert.deepStrictEqual(basic.actor.hand, []);
assert.deepStrictEqual(basic.target.hand, []);
assert.deepStrictEqual(
  basic.target.discard.map(item => item.name),
  ["杀（普攻）", "生命之泉"],
);
const basicUses = basic.state.battle.played.filter(
  item => item._playedByName === "奥菲莉亚",
);
assert.strictEqual(basicUses.length, 2);
assert(basicUses.every(item => !item.virtual),
  "Queen Tail must preserve an entity Slash as entity on replay");
assert(basicUses.every(item =>
  item.scale === "magic" && item.attackType === "magic"),
  "Queen Tail must convert the resolved entity Slash into a magic attack");
assert.strictEqual(basic.actor.discard[0].scale, "attack");
assert.strictEqual(basic.actor.discard[0].attackType, undefined,
  "the entity card must restore its original fields after resolution");
const basicDamage = basic.state.battle.animQueue.filter(
  item => item.type === "float" && item.kind === "damage",
);
assert(basicDamage.every(item => item.attackType === "magic"));

const multi = play(card("双重打杀"), [
  card("生命之泉"), card("魔力提炼"),
], ({ target }) => {
  target.hp = target.maxHp = 100;
});
assert.strictEqual(100 - multi.target.hp, 8);
assert.deepStrictEqual(multi.target.hand.map(item => item.name), ["魔力提炼"]);
assert.deepStrictEqual(multi.target.discard.map(item => item.name), ["生命之泉"]);

const virtual = scenario([], [card("杀（普攻）"), card("生命之泉")]);
setup(virtual.actor, virtual.state);
combat.useCard(virtual.state, virtual.actor, virtual.target, card("杀（普攻）", {
  virtual: true, noIntentCost: true, _skipHandMove: true,
  skipAfterCardPlayed: true, skipMvpCardCount: true,
}));
assert.deepStrictEqual(virtual.target.hand, []);
assert.deepStrictEqual(
  virtual.target.discard.map(item => item.name), ["杀（普攻）", "生命之泉"],
);
const virtualUses = virtual.state.battle.played.filter(
  item => item._playedByName === "奥菲莉亚",
);
assert.strictEqual(virtualUses.length, 2);
assert(virtualUses.every(item => item.virtual),
  "Queen Tail must preserve a virtual Slash as virtual on replay");
assert(virtualUses.every(item =>
  item.scale === "magic" && item.attackType === "magic"));

const borrowed = scenario([], [card("生命之泉")]);
setup(borrowed.actor, borrowed.state);
combat.useCard(borrowed.state, borrowed.actor, borrowed.target, card("杀（普攻）", {
  noIntentCost: true, _skipUseKillTriggers: true, skipAfterCardPlayed: true,
}));
assert.strictEqual(borrowed.target.hand.length, 1,
  "Borrowed Blade suppression must still block Queen Tail");
assert.strictEqual(borrowed.target.hp, 28,
  "Borrowed Blade suppression must also block the magic conversion");
assert.strictEqual(borrowed.state.battle.played[0].scale, "attack");

const long = play(card("杀（普攻）"),
  Array.from({ length: 40 }, () => card("杀（普攻）")),
  ({ target }) => {
    target.hp = target.maxHp = 1000;
  });
assert.strictEqual(long.target.hand.length, 0);
assert.strictEqual(long.target.discard.length, 40);
assert.strictEqual(1000 - long.target.hp, 164);

const slime = window.BattleStatusCardRegistry.create("slime");
const status = play(card("杀（普攻）"), [slime]);
assert.deepStrictEqual(status.target.discard, []);
assert.deepStrictEqual(status.target.consumed.map(item => item.name), ["粘液"]);

const blocked = play(card("杀（普攻）"), [card("生命之泉")],
  ({ target }) => { target.block = 99; });
assert.strictEqual(blocked.target.hand.length, 1);

const dodged = play(card("杀（普攻）"), [
  card("闪"), card("生命之泉"),
]);
assert.strictEqual(dodged.target.hand.length, 1);
assert.strictEqual(dodged.target.hand[0].name, "生命之泉");

const excluded = play(card("魔杀"), [card("杀（普攻）")]);
assert.strictEqual(excluded.target.hand.length, 1);
const sweep = play(card("机枪扫杀"), [card("杀（普攻）")]);
assert.strictEqual(sweep.target.hand.length, 1);

const bite = play(card("杀（普攻）"), [card("杀（普攻）")],
  ({ actor, target }) => {
    equip(actor, "鲨鱼头套");
    actor.hp = 10;
    target.hp = target.maxHp = 100;
  });
const biteUses = bite.state.battle.played.filter(
  item => item._playedByName === "奥菲莉亚",
);
assert.strictEqual(biteUses.length, 2);
assert(biteUses.every(item => item.name === "咬杀" && !item.virtual));
assert.strictEqual(lines.some(item => item.name === "女王之尾"), true);

console.log("Ophelia skill tests passed");
