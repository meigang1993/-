global.window = global;
require("../src/original/game-random.js");
require("../src/original/battle-damage-attributes.js");
require("../src/original/battle-combat-visuals.js");
require("../src/original/battle-damage-utils.js");
require("../src/original/battle-combat-attack-flow.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const types = BattleDamageAttributes.resolve;
const magic = BattleDamageAttributes.isMagic;
const attackType = BattleDamageAttributes.attackType;
assert(types({ name: "杀（普攻）", type: "slash", virtual: true }).join(",") === "physical", "virtual kill cards should default to physical damage");
assert(types({ name: "毒杀", type: "slash", poison: true }).join(",") === "poison", "poison kill should resolve as poison");
assert(types({ name: "杀（普攻）", type: "slash" }, "", { skills: [{ name: "毒针" }] }).join(",") === "poison", "poison needle users should deal poison slash damage");
assert(types({ name: "感电", type: "skill", shockBonus: true }).join(",") === "thunder", "shock bonus damage should resolve as thunder");
assert(types({ name: "火杀", type: "slash", fire: true }).join(",") === "fire", "Fire Kill should resolve as fire damage");
assert(types({ name: "混合攻击", fire: true, holy: true, dark: true }).join(",") === "fire,holy,dark", "multiple damage attributes should follow the fixed priority");
assert(types({ name: "魔杀", type: "slash" }).join(",") === "physical", "ordinary magic kill should not become dark without a dark source");
assert(types({ name: "魔杀", type: "slash", dark: true }).join(",") === "dark", "dark magic kill should resolve as dark");
assert(attackType({ name: "杀（普攻）", type: "slash", scale: "attack" }) === "physical", "attack-scaled damage should be a physical attack");
assert(attackType({ name: "魔杀", type: "slash", scale: "magic" }) === "magic", "magic-scaled damage should be a magic attack");
assert(attackType({ name: "明确魔法攻击", attackType: "magic" }) === "magic", "explicit magic attack data should be preserved");
assert(magic({ name: "魔杀", type: "slash", scale: "magic" }), "magic-scaled kill cards should use magic feedback");
assert(magic({ name: "魔弹特攻", type: "tactic", magicBullet: true }), "magic tactics should use magic feedback");
assert(magic({ name: "魔王军入侵", type: "tactic", hybridAttack: true, demonInvasion: true }), "Demon Invasion must retain its magical attack category");
assert(magic({ name: "杀（普攻）", type: "slash", scale: "attack" }, "", { extractMagicAttack: true }), "Extract Essence must convert physical kill cards to magical attacks");
assert(magic({ name: "无谋冲拳", type: "tactic", reckless: true }, "", { extractMagicAttack: true }), "Extract Essence must convert physical tactic attacks to magical attacks");
assert(!magic({ name: "物理技能", type: "skill" }, "", { extractMagicAttack: true }), "Extract Essence must not convert non-card skill damage");
assert(magic({ name: "圣杀", type: "slash", holy: true }, "", { ai: "mona_eagle_captain" }), "Mona holy slashes should layer magic feedback after holy feedback");
assert(!magic({ name: "杀（普攻）", type: "slash", scale: "attack" }), "ordinary physical slashes must not use magic feedback");

let nextId = 0;
const unit = { uid: "target", hp: 8, block: 0 };
const battle = { allies: [unit], enemies: [], animQueue: [], hitFxId: 4 };
const visuals = BattleCombatVisuals({ nextAnim: () => ++nextId }, b => b.allies.concat(b.enemies));
visuals.pushFloat(battle, unit.uid, "damage", 5, true, 0, { visualHp: 3, visualBlock: 0, visualDefense: 0 }, null, { damageTypes: ["holy"], effectCritical: true, attackType: "magic", magicDamage: true, hybridAttack: true });
assert(battle.floats[0].damageTypes[0] === "holy", "damage float should retain attribute metadata");
assert(battle.animQueue[0].critical === true && battle.animQueue[0].effectCritical === true, "damage event should retain critical metadata");
assert(battle.animQueue[0].damageTypes[0] === "holy", "animation queue should retain damage attributes");
assert(battle.animQueue[0].attackType === "magic", "animation queue should retain the magic attack category");
assert(battle.animQueue[0].magicDamage === true, "animation queue should retain magic damage metadata");
assert(battle.animQueue[0].hybridAttack === true, "animation queue should retain composite physical and magical feedback metadata");

const repeatedCard = { name: "双重打杀", type: "slash", fixedRepeats: 2, gatlingRepeats: 2, _playedFlightDone: true, _playedTargetUid: "target" };
const repeatedState = { battle: { animQueue: [] } };
const damageUtils = BattleDamageUtils({ isKillCard: card => card?.type === "slash", nextAnim: () => ++nextId }, visuals);
damageUtils.queueAttackAnim(repeatedState, { uid: "actor", side: "ally" }, unit, repeatedCard);
damageUtils.queueAttackAnim(repeatedState, { uid: "actor", side: "ally" }, unit, repeatedCard);
assert(repeatedState.battle.animQueue.length === 1 && repeatedState.battle.animQueue[0].type === "virtualPlay", "each extra Slash resolution should replay the card flight");
assert(repeatedState.battle.animQueue[0].targetUid === unit.uid, "each extra Slash resolution should retain its target line");
assert(repeatedState.battle.animQueue[0].show === false && repeatedState.battle.animQueue[0].extraSlashReplay, "extra Slash replay must not create another public card");

const explicitExtraState = { battle: { animQueue: [] } };
damageUtils.queueAttackAnim(explicitExtraState, { uid: "actor", side: "ally" }, unit, { name: "杀（普攻）", type: "slash", _extraSlashResolution: true });
assert(explicitExtraState.battle.animQueue.length === 1 && explicitExtraState.battle.animQueue[0].type === "virtualPlay", "skill-created extra Slash resolutions should replay the card flight");
assert(explicitExtraState.battle.animQueue[0].targetUid === unit.uid, "skill-created extra Slash resolutions should retain their target line");

const sweepExtraState = { battle: { animQueue: [] } };
damageUtils.queueAttackAnim(sweepExtraState, { uid: "actor", side: "ally" }, unit, {
  name: "机枪扫杀", type: "slash", sweep: true, targetless: true,
  allTargets: ["target", "other"], targetUids: ["target", "other"],
  aoeLineShown: true, _extraSlashResolution: true,
});
assert(sweepExtraState.battle.animQueue.length === 1 && sweepExtraState.battle.animQueue[0].type === "virtualPlay",
  "converted group Slash extra settlements should replay the card flight");
assert(sweepExtraState.battle.animQueue[0].targetUid === unit.uid,
  "converted group Slash extra settlements should redraw the current target line");
assert(!sweepExtraState.battle.animQueue[0].card.sweep
  && !sweepExtraState.battle.animQueue[0].card.targetless
  && !sweepExtraState.battle.animQueue[0].card.allTargets
  && !sweepExtraState.battle.animQueue[0].card.targetUids,
  "group Slash replay must be reduced to the current settlement target");

window.BattleLog = { add() {} };
window.BondiSkills = { cancelKillCard: () => false, beforeKillTargeted() {} };
window.WithererSkills = { afterKillFailed() {} };
window.UnderwaterTrainSkills = { prepareBite() {}, prepareKill() {} };
window.OrcDungeonSkills = { prepareSlash() {} };
window.MannySkills = { beforeSlash() {} };
window.WendyCadicisSkills = { beforeKillTargeted() {} };
window.ElranaAceNanaliSkills = { beforeKillTargeted() {} };
window.EnemySkills = { beforeKillTargeted() {} };
const transformedState = { battle: { animQueue: [], combo: 0, locked: false } };
const transformedActor = {
  uid: "flamer", side: "ally", name: "Flamer", ref: "manny",
  mannyWeapon: "flamer", hp: 10, intent: 1,
};
const transformedTarget = { uid: "enemy", side: "enemy", name: "Enemy", hp: 10 };
const transformedCard = { name: "杀（普攻）", type: "slash" };
const attackFlow = BattleCombatAttackFlow({
  deps: { isKillCard: card => card?.type === "slash" },
  specials: {
    prepareGreenGatling() {}, queueBattleCourage() {},
    sweepDamage(state, actor, amount, card) {
      state.battle.animQueue.push({
        type: "virtualPlay", uid: actor.uid,
        targetUids: [transformedTarget.uid], card: { ...card, aoeLineShown: true },
      });
    },
    healBySyringe() {}, resolveGreenGatling() {},
  },
  pushFloat() {}, checkDefeat: () => false, checkEnd() {},
  hasNoIntentCost: () => false, triggerWhiteLolita() {},
}, {
  cardPower: () => 0, applyBerserkGrowth() {},
  baseCardCanFlame: () => true,
  attackAmount: () => 1, modifyAttackAmount: (state, actor, target, card, amount) => amount,
  applyAttackRelics() {}, slashTargetAmount: (state, actor, target, card, amount) => amount,
});
attackFlow.resolve(transformedState, transformedActor, transformedTarget, transformedCard);
assert(transformedState.battle.animQueue.length === 1
  && transformedState.battle.animQueue[0].targetUids?.length === 1,
  "a Slash converted to a group attack must not keep an earlier single-target flight");

console.log("Damage attribute tests passed");
