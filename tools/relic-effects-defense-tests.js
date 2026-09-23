const {
  assert,
  BattleCardCleanup,
  BattleCombatResolver,
  CardUtils,
  RelicSystem,
  UnderwaterTrainSkills,
  unit,
} = require("./relic-effects-test-harness");

function testScissorBlade() {
  const actor = unit("剪刀刃持有者");
  const target = unit("拼花目标", "enemy");
  actor.deck.push({ name: "红牌", suit: "♥" });
  target.deck.push({ name: "黑牌", suit: "♠" });
  const state = { battle: { allies: [actor], enemies: [target], animQueue: [] }, log: [] };
  RelicSystem.hasEquipped = (_state, holder, name) => holder === actor && name === "剪刀刃";
  const slash = { name: "杀（普攻）", type: "slash", virtual: true };
  UnderwaterTrainSkills.beforeKillTargeted(state, actor, target, slash);
  assert(slash.ignoreResponse, "Scissor Blade must apply to a virtual single-target slash");
}

function testSamuraiArmor() {
  const actor = unit("武士铠甲持有者");
  const target = unit("铠甲目标", "enemy");
  actor.hand.push({ name: "杀（普攻）", type: "slash" });
  const state = { battle: { allies: [actor], enemies: [target], animQueue: [], combo: 0, locked: false }, log: [] };
  RelicSystem.hasEquipped = (_state, holder, name) => holder === actor && name === "武士铠甲";
  window.EnemySkills = { beforeKillTargeted() {} };
  const resolver = BattleCombatResolver({
    deps: { isKillCard: CardUtils.isKillCard, tempAttack: () => 2 },
    specials: { queueBattleCourage() {}, healBySyringe() {}, resolveGreenGatling() {} },
    damage: () => ({ hpLoss: 1 }), statOf: (holder, key) => holder.stats[key] || 0,
    pushFloat() {}, checkDefeat: () => false, checkEnd() {},
    cardPower: card => card.power || 1, isSingleSlash: () => true,
    hasNoIntentCost: () => true,
  });
  resolver.continueAfterCounter(state, actor, target, { name: "杀（普攻）", type: "slash", virtual: true, power: 1 });
  assert(actor.samuraiArmorUsed && actor.block === 1, "Samurai Armor must trigger on the first virtual slash use");
}

function testWhiteGothicLolita() {
  window.BondiSkills = {};
  window.BakarSkills = {};
  window.NonokaLokiSkills = {};
  window.BattleDamageUtils = () => ({ queueAttackAnim() {}, directDamage() { return { hpLoss: 0 }; } });
  window.BattleDamageTriggers = () => ({ afterDamage() {}, afterDodged() {} });
  require("../src/original/battle-damage-relics.js");
  require("../src/original/battle-damage-lifecycle.js");
  require("../src/original/battle-damage-resolution.js");
  require("../src/original/battle-damage-hit.js");
  require("../src/original/battle-damage.js");
  const actor = unit("攻击者");
  const target = unit("哥特裙持有者", "enemy");
  const state = { settings: {}, battle: { allies: [actor], enemies: [target], animQueue: [], hitFxId: 0 }, log: [] };
  let draws = 0;
  RelicSystem.hasEquipped = (_state, holder, name) => holder === target && name === "白色哥特洛丽塔";
  window.EnemySkills = {
    modifyDamage: (_state, _target, amount) => amount,
    absorbDefense: (_state, _target, amount) => ({ absorbed: 0, rest: amount }),
  };
  const damage = window.BattleDamage(
    { isKillCard: CardUtils.isKillCard, draw: () => { draws += 1; }, nextAnim: () => 1 },
    {
      allUnits: battle => battle.allies.concat(battle.enemies),
      hasSkill: () => false,
      checkDefeat: () => false,
      checkEnd() {},
      holdVisual() {},
      visualOf: () => ({}),
      pushFloat() {},
      clearSelection() {},
    },
  );
  const slash = { name: "双重打杀", type: "slash" };
  damage.damage(state, target, 1, slash.name, actor, slash);
  damage.damage(state, target, 1, slash.name, actor, slash);
  assert.strictEqual(draws, 1, "White Gothic Lolita must draw once per target designation, not once per hit");
  BattleCardCleanup.clearPlayFlags(slash);
  damage.damage(state, target, 1, slash.name, actor, slash);
  assert.strictEqual(draws, 2, "White Gothic Lolita tracking must reset after card resolution");
  BattleCardCleanup.clearPlayFlags(slash);
  window.BondiSkills.invalidateKillCard = () => true;
  damage.damage(state, target, 1, slash.name, actor, slash);
  assert.strictEqual(draws, 3, "White Gothic Lolita must trigger even when Obsidian Armor invalidates the slash");
}

module.exports = { testSamuraiArmor, testScissorBlade, testWhiteGothicLolita };
