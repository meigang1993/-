const assert = require("assert");
const { combat, card, unit, scenario } = require("./pursue-kill-fixtures");

window.RelicSystem.hasEquipped = (_state, holder, name) =>
  holder?.battleRelics?.includes(name);

const { state } = scenario([], []);
const slash = card("杀（普攻）");
const edis = unit("edis", "enemy", [
  slash,
  ...Array.from({ length: 5 }, (_, index) => ({ name: `测试手牌${index + 1}` })),
]);
const primary = unit("target-1", "ally", []);
const secondaryA = unit("target-2", "ally", []);
const secondaryB = unit("target-3", "ally", []);

Object.assign(edis, {
  ai: "pursuer_edis",
  name: "内英组杀手伊迪斯",
  battleRelics: ["伊迪斯电锯剑"],
});
edis.stats.attack = 1;
state.battle.enemies = [edis];
state.battle.allies = [primary, secondaryA, secondaryB];

window.EdisSkills.beforeSlash(state, edis, primary, slash);
combat.damage(state, primary, 1, slash.name, edis, slash);

assert.strictEqual(primary.maxHp - primary.hp, 4,
  "the original slash and its one entity pursuit should each deal two hits");
assert.strictEqual(secondaryA.maxHp - secondaryA.hp, 2,
  "each entity slash should start one virtual pursuit against the first other target");
assert.strictEqual(secondaryB.maxHp - secondaryB.hp, 2,
  "each entity slash should start one virtual pursuit against the second other target");
assert.strictEqual(state.log.filter(text => text.includes("因手牌超上限")).length, 1,
  "the sword's second damage must not repeat the X entity pursuits");
assert.strictEqual(state.log.filter(text => text.includes("伊迪斯电锯剑触发")).length, 2,
  "the sword should double both the original slash and the separate entity pursuit");

console.log("Edis relic conflict regression tests passed");
