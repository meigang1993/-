const { assert } = require("./bakar-skill-setup");

const actor = {
  uid: "a0", side: "ally", name: "勇者", hp: 100, hand: [], discard: [], consumed: [],
};
const bakaar = {
  uid: "e0", id: "demon_king_bakaar", ref: "demon_king_bakaar", ai: "demon_king_bakaar",
  side: "enemy", name: "魔王巴卡尔", hp: 300, maxHp: 300, hand: [], statuses: [], battleRelics: [],
};
const invasion = { name: "魔王军入侵", type: "tactic", suit: "♥", demonInvasion: true };
actor.discard.push(invasion);
const state = { battle: { allies: [actor], enemies: [bakaar], animQueue: [], turn: 7 }, equipment: {}, testEquipment: {}, resources: { relics: [] } };
window.state = state;

assert(window.BakarSkills.invasionTargets(state, actor, invasion).length === 0, "Demon Invasion must not target Bakaar");
assert(bakaar.hand.length === 1, "Commander immunity should trigger Talent draw once");
window.BakarSkills.afterCardPlayed(state, actor, invasion);
assert(bakaar.hand.includes(invasion), "Bakaar must obtain the used Demon Invasion card");
assert(bakaar.hand.length === 2, "Commander immunity and capture must be one skill activation");
assert(actor.discard.length === 0, "Captured Demon Invasion must leave the original discard pile");

const copiedInvasion = { name: "魔王军入侵", type: "tactic", suit: "♦", demonInvasion: true, copiedByEdis: true, temporary: true, void: true };
actor.consumed.push(copiedInvasion);
const copiedCaptureHandBefore = bakaar.hand.length;
window.BakarSkills.afterCardPlayed(state, actor, copiedInvasion);
assert(actor.consumed.includes(copiedInvasion), "Edis's copied Demon Invasion must remain consumed after use");
assert(bakaar.hand.length === copiedCaptureHandBefore, "Bakaar must not capture Edis's temporary copied invasion");

const ownInvasion = { name: "魔王军入侵", type: "tactic", suit: "♠", demonInvasion: true };
const ownHandBefore = bakaar.hand.length;
bakaar.discard = [ownInvasion];
window.BakarSkills.afterCardPlayed(state, bakaar, ownInvasion);
assert(!bakaar.hand.includes(ownInvasion), "Bakaar must not regain his own used entity Demon Invasion");
assert(bakaar.hand.length === ownHandBefore, "Self-used invasion must not trigger Commander or Talent");
assert(bakaar.discard.includes(ownInvasion), "Bakaar's own used invasion must remain in his discard pile");

const talentHandBefore = bakaar.hand.length;
window.BakarSkills.afterCardPlayed(state, bakaar, { name: "角色主动技", _skill: true, skillName: "角色主动技" });
assert(bakaar.hand.length === talentHandBefore + 1, "A character skill must trigger Talent");
window.BakarSkills.afterCardPlayed(state, bakaar, { name: "饰品主动技", _skill: true, _relicSkill: true, skillName: "饰品主动技" });
assert(bakaar.hand.length === talentHandBefore + 1, "An active relic skill must not trigger Talent");

const selectionActor = { uid: "select-a", side: "ally", hp: 30, maxHp: 30, hand: [] };
const selectionEnemy = { uid: "select-e", side: "enemy", hp: 30, maxHp: 30, hand: [] };
const selectionState = { battle: { allies: [selectionActor], enemies: [selectionEnemy], phase: 4, locked: false } };
const oldUICommon = window.UICommon;
window.UICommon = {
  skillsOf: () => [
    { name: "角色主动技", type: "active", card: { name: "角色主动技", type: "tactic", targetless: true } },
    { name: "饰品主动技", type: "active", source: "relic", card: { name: "饰品主动技", type: "tactic", targetless: true } },
  ],
};
const targeting = window.BattleCombatTargeting(
  { active: battle => battle.allies[0], isKillCard: window.CardUtils.isKillCard },
  { useCard: () => true, checkEnd: () => {} },
);
assert(targeting.selectSkill(selectionState, 1), "Active relic selection must succeed");
assert(selectionState.battle.selectedSkillCard?._relicSkill, "Selected active relic must preserve its relic source");
targeting.cancelSelection(selectionState);
assert(targeting.selectSkill(selectionState, 0), "Character skill selection must succeed");
assert(!selectionState.battle.selectedSkillCard?._relicSkill, "Character skill must not be marked as a relic");
window.UICommon = oldUICommon;

selectionActor.hand = [
  { name: "红桃响应", type: "response", suit: "♥" },
  { name: "方片战术", type: "tactic", suit: "♦" },
  { name: "黑桃杀", type: "slash", suit: "♠" },
  { name: "梅花响应", type: "response", suit: "♣" },
  { name: "无花色消耗", type: "consume" },
  { name: "红桃战术", type: "tactic", suit: "♥" },
];
function assertCostSelection(skill, validIndex, invalidIndex, label) {
  targeting.cancelSelection(selectionState);
  selectionState.battle.selectedSkillCard = skill;
  const beforeTarget = selectionState.battle.pendingTargetUid;
  assert(!targeting.selectCard(selectionState, invalidIndex),
    `${label} must reject an illegal hand-cost candidate`);
  assert(selectionState.battle.selectedCardIndex == null
    && selectionState.battle.pendingTargetUid === beforeTarget,
  `${label} rejected selection must not mutate targeting state`);
  assert(targeting.selectCard(selectionState, validIndex),
    `${label} must accept a legal hand-cost candidate`);
  assert(selectionState.battle.selectedCardIndex === validIndex,
    `${label} must store the legal candidate index`);
}
assertCostSelection(
  { name: "偶像之吻", idolKiss: true, allyTarget: true }, 0, 1, "Idol Kiss");
assertCostSelection(
  { name: "疯狂射击", crazyShooting: true, targetless: true }, 1, 2,
  "Crazy Shooting");
assertCostSelection(
  { name: "战场指挥官", cadicisPlan: true, targetless: true }, 2, 3,
  "Battlefield Commander");
assertCostSelection(
  { name: "鬼王扑克", demonPoker: true }, 3, 1, "Demon Poker");
targeting.cancelSelection(selectionState);
selectionState.battle.selectedSkillCard = {
  name: "军令状", armyOrder: true, targetless: true,
};
assert(!targeting.selectCard(selectionState, 4),
  "Army Order must reject a first card without a standard suit");
assert(selectionState.battle.selectedBagIndexes == null
  && selectionState.battle.pendingTargetUid == null,
"Army Order rejected first card must not create a selection list or target");
assert(targeting.selectCard(selectionState, 0),
  "Army Order must accept a standard-suit first card");
assert(!targeting.selectCard(selectionState, 1),
  "Army Order must reject a different-suit second card");
assert(targeting.selectCard(selectionState, 5),
  "Army Order must accept a second card with the identical suit");
assert(selectionState.battle.selectedBagIndexes.join(",") === "0,5",
  "Army Order must preserve exactly the legal identical-suit pair");

const counteredInvasion = { name: "魔王军入侵", type: "tactic", suit: "♣", demonInvasion: true };
actor.discard.push(counteredInvasion);
state.battle.locked = true;
state.battle.manualCounter = { card: counteredInvasion };
window.BakarSkills.afterCardPlayed(state, actor, counteredInvasion);
assert(actor.discard.includes(counteredInvasion) && !bakaar.hand.includes(counteredInvasion), "Commander capture must wait for manual counter resolution");
state.battle.locked = false;
state.battle.manualCounter = null;
assert(window.BakarSkills.completeInvasion(state), "Commander capture should resume after manual counter resolution");
assert(bakaar.hand.includes(counteredInvasion) && !actor.discard.includes(counteredInvasion), "Commander must capture the invasion after counter flow finishes");

const target = {
  uid: "a1", side: "ally", name: "目标", hp: 100, maxHp: 100,
  hand: [{ name: "闪", type: "response", suit: "♥" }, { name: "看破", type: "response", suit: "♣" }],
};
const slash = { name: "火杀", type: "slash", fire: true, burnCard: true };
const oldRandom = Math.random;
Math.random = () => 0;
window.BakarSkills.afterDamage(state, bakaar, target, slash, 0);
Math.random = oldRandom;
assert(target.hand[0].burning, "Fire Kill must add burning after an undodged hit even when hp damage is fully prevented");
assert(!bakaar.bakarPendingFireStacks, "Fire Fist must not stack without hp damage");

const doubleSlash = { name: "双重打杀", type: "slash" };
const handBeforeDouble = bakaar.hand.length;
window.BakarSkills.beforeKillTargeted(state, bakaar, doubleSlash);
window.BakarSkills.afterDamage(state, bakaar, target, doubleSlash, 8);
window.BakarSkills.afterDamage(state, bakaar, target, doubleSlash, 8);
assert(bakaar.bakarPendingFireStacks === 1, "One multi-hit slash instance must queue only one Fire Fist stack");
assert(bakaar.hand.length === handBeforeDouble + 1, "One multi-hit slash instance must trigger Talent only once through Fire Fist");
window.BakarSkills.beforeKillTargeted(state, bakaar, doubleSlash);
window.BakarSkills.afterDamage(state, bakaar, target, doubleSlash, 8);
assert(bakaar.bakarPendingFireStacks === 2, "Using the same slash card again must allow a new Fire Fist stack");
window.BakarSkills.beginTurn(state, bakaar);
assert(bakaar.bakarFireStacks === 2 && bakaar.bakarPendingFireStacks === 0, "Fire Fist stacks must activate next turn");
assert(window.BakarSkills.modifyOutgoingDamage(state, bakaar, 10, slash) === 16, "Two Fire Fist stacks must add 60% slash damage");
assert(window.BakarSkills.modifyIncomingDamage(state, target, 10, slash) === 20, "Burning holder must take double fire damage");

target.hand[1].burning = true;
let burningLoss = 0;
window.BakarSkills.tickBurning(state, target, (_state, _unit, amount) => { burningLoss += amount; });
assert(burningLoss === 2, "Burning life loss must equal the number of burning cards held");

bakaar.bakarFireStacks = 0;
bakaar.hp = 30;
bakaar.maxHp = 100;
bakaar.battleRelics = ["女勇者鲁妮的戒指"];
assert(window.BakarSkills.modifyOutgoingDamage(state, bakaar, 10, { name: "杀（普攻）", type: "slash" }) === 20, "Runi ring must double damage-card damage at 30% hp");
[
  { name: "魔王军入侵", type: "tactic", demonInvasion: true },
  { name: "魔弹特攻", type: "tactic", magicBullet: true },
  { name: "与我一战", type: "tactic", duel: true, duelUserUid: bakaar.uid },
  { name: "魔法对决", type: "tactic", magicDuel: true, duelUserUid: bakaar.uid },
  { name: "无谋冲拳", type: "response", reckless: true },
].forEach(card => {
  assert(window.BakarSkills.modifyOutgoingDamage(state, bakaar, 10, card) === 20, `${card.name} must count as a damage card for Runi ring`);
});
assert(window.BakarSkills.modifyOutgoingDamage(state, bakaar, 10, { name: "放血", type: "tactic", bloodletting: true }) === 10, "Life loss must not count as damage-card damage");
bakaar.hp = 31;
assert(window.BakarSkills.modifyOutgoingDamage(state, bakaar, 10, { name: "杀（普攻）", type: "slash" }) === 10, "Runi ring must stop above 30% hp");

const orderUser = {
  uid: "a2", side: "ally", name: "军令使用者", hp: 50,
  battleRelics: ["军令状"],
  hand: [
    { name: "牌1", type: "tactic", suit: "♥" },
    { name: "牌2", type: "response", suit: "♥" },
    { name: "牌3", type: "slash", suit: "♠" },
  ],
  discard: [],
};
state.battle.allies.push(orderUser);
const standardSuits = ["♥", "♦", "♠", "♣"];
standardSuits.forEach(first => standardSuits.forEach(second => {
  const pairUser = { hand: [{ suit: first }, { suit: second }] };
  assert(window.BakarSkills.validArmyOrder(pairUser, [0, 1]) === (first === second),
    `Army Order legality mismatch for ${first}+${second}`);
}));
assert(!window.BakarSkills.validArmyOrder({ hand: [{ suit: "虚" }, { suit: "虚" }] }, [0, 1]),
  "Army Order must reject non-standard suits");
state.battle.selectedBagIndexes = [0, 1];
const indexes = window.BakarSkills.armyOrderIndexes(orderUser);
assert(indexes.length === 2 && window.BakarSkills.validArmyOrder(orderUser, indexes), "Army Order must find a same-suit pair");
let converted = null;
const used = window.BakarSkills.useArmyOrder(state, orderUser, { armyOrder: true }, (_state, _actor, _target, card) => { converted = card; });
assert(used && orderUser.hand.length === 1 && orderUser.discard.length === 2, "Army Order must discard exactly two cost cards");
assert(converted?.demonInvasion && converted.virtual && !converted.convertedFrom
  && converted.generatedBySkill === "军令状",
"Army Order must create a source-labelled virtual Demon Invasion");
assert(converted?._relicSkill && converted.bakarTalentSkip, "Army Order invasion must remain excluded from Talent");

const aiInvasion = { name: "魔王军入侵", type: "tactic", demonInvasion: true };
assert(window.BakarSkills.aiMove(bakaar, [target], [slash, aiInvasion]).card === aiInvasion, "Bakaar AI must prioritize Demon Invasion in hand");

console.log("Bakaar skill regression tests passed");
