const assert = require("assert");

global.window = global;
window.CardUtils = {
  isKillCard: card => card?.type === "slash",
  isSingleKillCard: card => card?.type === "slash" && !card.sweep,
};
window.GuestCharacterSkills = {
  visibleHandCount: unit => (unit.hand || []).filter(card => !card._pendingDraw).length,
};
window.RelicSystem = { hasEquipped: () => false };

require("../src/original/game-random.js");
require("../src/original/battle-ai-helpers.js");
require("../src/original/battle-ai-slash-planner.js");

function unit(uid, hp, extra = {}) {
  return {
    uid,
    hp,
    maxHp: 30,
    hand: [],
    stats: { attack: 0, magic: 0 },
    ...extra,
  };
}

function sequence(seed, count, units) {
  window.state = { random: window.GameRandom.create(seed) };
  return Array.from({ length: count },
    () => window.BattleAIHelpers.targetByPolicy(units).uid);
}

const favored = unit("favored", 5);
const others = [
  unit("steady-a", 30, { hand: [{ name: "杂牌" }] }),
  unit("steady-b", 30, { hand: [{ name: "杂牌" }] }),
  unit("steady-c", 30, { hand: [{ name: "杂牌" }] }),
];
const candidates = [favored, ...others];

const first = sequence(2971485, 6000, candidates);
const repeated = sequence(2971485, 6000, candidates);
assert.deepStrictEqual(first, repeated,
  "the same seed must reproduce the same AI target sequence");

const counts = first.reduce((result, uid) => {
  result[uid] = (result[uid] || 0) + 1;
  return result;
}, {});
const favoredRate = counts.favored / first.length;
assert(favoredRate > .52 && favoredRate < .58,
  `four-target focus rate should stay near 55%, received ${favoredRate}`);
for (const target of others) {
  assert((counts[target.uid] || 0) / first.length > .12,
    `${target.uid} must retain a meaningful chance to be targeted`);
}

window.state = { random: window.GameRandom.create(1124) };
const cursorBeforeFocus = window.state.random.cursor;
for (let index = 0; index < 20; index += 1) {
  assert.strictEqual(
    window.BattleAIHelpers.targetByPolicy(candidates, true),
    favored,
    "evaluation-only targeting must use the tactical favorite");
}
assert.strictEqual(window.state.random.cursor, cursorBeforeFocus,
  "evaluation-only targeting must not consume gameplay randomness");

const deadFavorite = unit("dead", 0, { stats: { attack: 99, magic: 99 } });
window.state = { random: window.GameRandom.create(7) };
for (let index = 0; index < 100; index += 1) {
  assert.notStrictEqual(
    window.BattleAIHelpers.targetByPolicy([deadFavorite, ...candidates]),
    deadFavorite,
    "dead units must never be targeted");
}

window.state = { random: window.GameRandom.create(8) };
const lone = unit("lone", 10);
assert.strictEqual(window.BattleAIHelpers.targetByPolicy([lone]), lone,
  "a lone living target must always be selected");
assert.strictEqual(window.state.random.cursor, 0,
  "a lone target must not consume gameplay randomness");

const actor = unit("actor", 30);
const marked = unit("marked", 30, { lockSuit: "♥" });
const scarred = unit("scarred", 20, { holyScar: true });
const armored = unit("armored", 30, { block: 8 });
window.state = { random: window.GameRandom.create(9) };
assert.strictEqual(
  window.BattleAISlashPlanner.slashTarget(
    actor, [favored, marked], [{ type: "slash", suit: "♥" }]),
  marked,
  "a matching marked-suit target must override the general target roll");
assert.strictEqual(
  window.BattleAISlashPlanner.slashTarget(
    actor, [favored, scarred], [{ type: "slash", holy: true }]),
  scarred,
  "Holy Scar targeting must override the general target roll");
assert.strictEqual(
  window.BattleAISlashPlanner.slashTarget(
    actor, [favored, armored], [{ type: "slash", assassinate: true }]),
  armored,
  "armor-piercing targeting must override the general target roll");
assert.strictEqual(window.state.random.cursor, 0,
  "explicit tactical target overrides must not consume gameplay randomness");

console.log("Battle AI targeting probability and determinism tests passed");
