const assert = require("assert");

global.window = global;
require("../src/original/game-random.js");
require("../src/original/battle-draw-feedback.js");
window.SakuraRisaSkills = { pendingRevival: unit => !!unit.pendingRevival };
require("../src/original/battle-stats.js");

const attacker = { uid: "ally-a", name: "输出手", side: "ally" };
const healer = { uid: "ally-b", name: "治疗手", side: "ally" };
const enemy = { uid: "enemy-a", name: "目标", side: "enemy", hp: 0 };
const battle = { allies: [attacker, healer], enemies: [enemy] };

BattleStats.initialize(battle);
BattleStats.damage(battle, attacker, enemy, 99, 7);
BattleStats.cardPlayed(battle, attacker);
BattleStats.responded(battle, attacker);
BattleStats.heal(battle, healer, 30);
BattleStats.cardPlayed(battle, healer);
BattleStats.cardPlayed(battle, healer);

assert.strictEqual(battle.performance[attacker.uid].damage, 7, "overkill damage must cap at pre-hit HP");
assert.strictEqual(battle.performance[attacker.uid].kills, 1, "a real defeat should count as one kill");
assert.strictEqual(battle.performance[healer.uid].healing, 30, "effective healing should be credited to the healer");

const allyTarget = { uid: "ally-c", side: "ally", hp: 0 };
BattleStats.damage(battle, attacker, allyTarget, 5, 5);
assert.strictEqual(battle.performance[attacker.uid].damage, 7, "friendly damage must not add contribution");

const reviving = { uid: "enemy-risa", side: "enemy", hp: 0, pendingRevival: true };
BattleStats.damage(battle, attacker, reviving, 5, 5);
assert.strictEqual(battle.performance[attacker.uid].kills, 1, "pending revival must not count as a kill");

const ranking = BattleStats.ranking(battle);
assert.strictEqual(ranking[0].unit.uid, healer.uid, "weighted contribution should determine MVP");
assert.strictEqual(ranking[0].isMvp, true, "first place should be marked as MVP");
assert.strictEqual(ranking[0].score, 27, "healing and cards should use the fixed score formula");
assert.strictEqual(ranking[1].score, 25, "damage, kill, response, and card score should use the fixed formula");

const { combat, card, scenario } = require("./pursue-kill-fixtures");
require("../src/original/machine-factory-skills.js");
require("../src/original/enemy-status-effects.js");
require("../src/original/enemy-kill-hooks.js");
require("../src/original/enemy-damage-hooks.js");
require("../src/original/enemy-combat-hooks.js");
require("../src/original/enemy-tactical-skills.js");
require("../src/original/enemy-skills.js");
require("../src/original/bakar-relic-skills.js");
require("../src/original/bakar-core-skills.js");
require("../src/original/bakar-fire-skills.js");
require("../src/original/bakar-skills.js");
window.RelicSystem.hasEquipped = (_state, unit, name) =>
  (unit?.battleRelics || []).includes(name);

const runtime = scenario([], []);
BattleStats.initialize(runtime.state.battle);
const originalSpecial = window.NonokaLokiSkills.handleSpecialCard;
window.NonokaLokiSkills.handleSpecialCard = () => true;
combat.useCard(runtime.state, runtime.actor, runtime.target, { name: "公开技能", type: "tactic", _skill: true });
combat.useCard(runtime.state, runtime.actor, runtime.target, {
  name: "内部虚拟牌", type: "tactic", _skill: true, skipMvpCardCount: true,
});
window.NonokaLokiSkills.handleSpecialCard = originalSpecial;
assert.strictEqual(runtime.state.battle.performance[runtime.actor.uid].cards, 1,
  "internal virtual cards must not inflate MVP card contribution");

const orderRuntime = scenario([
  card("闪", { type: "response", suit: "♥" }),
  card("看破", { type: "response", suit: "♥" }),
], []);
orderRuntime.actor.battleRelics = ["军令状"];
BattleStats.initialize(orderRuntime.state.battle);
combat.useCard(orderRuntime.state, orderRuntime.actor, orderRuntime.actor, {
  name: "军令状", type: "tactic", _skill: true, _relicSkill: true,
  armyOrder: true, targetless: true, _bagIndexes: [0, 1],
});
assert.strictEqual(orderRuntime.state.battle.performance[orderRuntime.actor.uid].cards, 1,
  "Army Order must count exactly once through its generated invasion");

function applyCreditedDamage(state, victim, amount, _source, source) {
  const hpBefore = victim.hp;
  victim.hp = Math.max(0, victim.hp - amount);
  BattleStats.damage(state.battle, source, victim, amount, hpBefore);
}

const poisonSource = { uid: "ally-poison", name: "施毒者", side: "ally" };
const poisoned = { uid: "enemy-poison", name: "中毒目标", side: "enemy", hp: 2, statuses: [] };
const poisonState = { battle: { allies: [poisonSource], enemies: [poisoned] }, log: [] };
BattleStats.initialize(poisonState.battle);
EnemySkills.addPoison(poisonState, poisoned, 2, poisonSource);
EnemySkills.tickPoison(poisonState, poisoned, applyCreditedDamage);
assert.strictEqual(poisonState.battle.performance[poisonSource.uid].damage, 2,
  "poison damage must be credited to its applier");
assert.strictEqual(poisonState.battle.performance[poisonSource.uid].kills, 1,
  "a poison defeat must grant kill contribution to its applier");

const burnSource = { uid: "ally-burn", name: "燃烧施加者", side: "ally" };
const burning = {
  uid: "enemy-burn", name: "燃烧目标", side: "enemy", hp: 2, maxHp: 2, statuses: [],
  hand: [{ name: "闪", suit: "♥" }, { name: "看破", suit: "♣" }],
};
const burnState = { battle: { allies: [burnSource], enemies: [burning] }, log: [] };
BattleStats.initialize(burnState.battle);
const oldRandom = Math.random;
Math.random = () => 0;
BakarSkills.afterDamage(burnState, burnSource, burning, { name: "火杀", type: "slash", burnCard: true }, 0);
BakarSkills.afterDamage(burnState, burnSource, burning, { name: "火杀", type: "slash", burnCard: true }, 0);
Math.random = oldRandom;
BakarSkills.tickBurning(burnState, burning, applyCreditedDamage);
assert.strictEqual(burnState.battle.performance[burnSource.uid].damage, 2,
  "burning damage must be credited to the card's applier");
assert.strictEqual(burnState.battle.performance[burnSource.uid].kills, 1,
  "a burning defeat must grant kill contribution to its applier");

console.log("Battle MVP contribution tests passed");
