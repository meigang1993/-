const fs = require("fs");

global.window = global;
require("../src/original/game-random.js");

const logs = [];
window.CardUtils = {
  isKillCard(card) { return card?.type === "slash"; },
  isSingleKill(card) { return card?.type === "slash" && !card.sweep && !card.targetless && !card.allTargets && !card.aoeLineShown; },
  isSingleKillCard(card) { return card?.type === "slash" && !card.sweep; },
};
window.RelicSystem = {
  hasEquipped(state, unit, name) { return !!unit?.relics?.includes(name); },
};
window.BattleSystem = { pushFloat() {} };
window.BattleLines = { skill() {} };
window.BattleLog = { add(state, text) { logs.push(text); } };

require("../src/original/guard-kelly-skills.js");
require("../src/original/battle-card-tactics.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function unit(name, relics = []) {
  return { uid: name, name, side: "ally", hp: 20, block: 0, hand: [], relics };
}

const state = { battle: { allies: [], enemies: [], animQueue: [] } };
const shieldUser = unit("盾持有者", ["精灵女神守护之盾"]);
GuardKellySkills.afterCardPlayed(state, shieldUser, {
  name: "武装", type: "tactic", _playedFromHand: true,
});
assert(shieldUser.block === 1, "hand tactic should trigger Guardian Shield");
GuardKellySkills.afterCardPlayed(state, shieldUser, {
  name: "虚拟战术", type: "tactic", virtual: true,
});
GuardKellySkills.afterCardPlayed(state, shieldUser, { name: "主动技能", type: "tactic", _skill: true });
GuardKellySkills.afterCardPlayed(state, shieldUser, {
  name: "鬼王扑克转化牌", type: "tactic", convertedFrom: "闪", _skill: true, _relicSkill: true,
});
GuardKellySkills.afterCardPlayed(state, shieldUser, { name: "额外结算", type: "tactic", _repeat: true });
assert(shieldUser.block === 1, "non-hand, skill-generated, converted, and repeated tactics must not trigger Guardian Shield");

const swordUser = unit("剑持有者", ["精灵女神守护之剑"]);
const mimicSource = unit("模仿对象", ["精灵女神守护之剑"]);
const target = { uid: "target", name: "目标", side: "enemy", hp: 10, block: 0 };
GuardKellySkills.afterDamage(state, mimicSource, target, { name: "杀", type: "slash" }, 4, swordUser);
assert(swordUser.block === 4, "Guardian Sword should grant armor to the original card user");
assert(mimicSource.block === 0, "mimicked damage source must not receive Guardian Sword armor");
GuardKellySkills.afterDamage(state, swordUser, target, { name: "借刀杀", type: "slash", _skipUseKillTriggers: true }, 3, swordUser);
assert(swordUser.block === 4, "borrowed slash must not trigger Guardian Sword");

let borrowedCard;
let borrowPrompt;
const partner = unit("队友");
partner.hand.push({ name: "杀", type: "slash" });
const tactics = BattleCardTactics({
  log() {},
  reveal() {},
  openHandReveal(_state, actor, promptTarget, card, mode) {
    borrowPrompt = { actor, promptTarget, card, mode };
    state.battle.handReveal = {
      actorUid: actor.uid, targetUid: promptTarget.uid,
      cardName: card.name, card, mode,
    };
    return true;
  },
  deps: { nextAnim: () => 1 },
  ctx: {
    sameSideUnits: () => [partner],
    useCard(currentState, actor, currentTarget, card) { borrowedCard = card; },
  },
});
state.battle.comboPartnerUid = partner.uid;
swordUser.side = "enemy";
tactics.borrowSlash(state, swordUser, target, { name: "借刀杀人", type: "tactic" });
assert(borrowedCard?._skipUseKillTriggers, "borrowed slash should carry the use-skill suppression flag");
swordUser.side = "ally";
borrowedCard = null;
tactics.borrowSlash(state, swordUser, target, { name: "借刀杀人", type: "tactic" });
assert(!borrowedCard && borrowPrompt?.mode === "borrowSlashChoice",
  "allied Borrowed Blade must ask for the exact Slash even when only one is valid");

partner.hand = [{ name: "闪", type: "response" }];
state.battle.animQueue = [];
tactics.borrowSlash(state, swordUser, target, { name: "借刀杀人", type: "tactic" });
assert(borrowPrompt?.mode === "borrowGainChoice",
  "allied Borrowed Blade fallback must open a mandatory card choice");
assert(state.battle.animQueue.length === 0,
  "Borrowed Blade fallback must wait for the player's choice before transfer");

const cleanupSource = fs.readFileSync(require.resolve("../src/original/battle-card-cleanup.js"), "utf8");
assert(cleanupSource.includes("\"_skipUseKillTriggers\""), "play cleanup must remove the borrowed-slash suppression flag");
assert(cleanupSource.includes("\"skipAfterCardPlayed\""), "play cleanup must restore normal after-card triggers");
assert(cleanupSource.includes("\"_armoredRamFlipped\""), "play cleanup must remove Armored Ram's per-use flip flag");

let triggerArgs;
window.BattleDamageUtils = () => ({
  directDamage() { return { hpLoss: 2, card: { name: "杀", type: "slash" } }; },
  queueAttackAnim() {},
});
window.BattleDamageTriggers = () => ({
  afterDamage(...args) { triggerArgs = args; },
});
window.NonokaLokiSkills = {
  sourceActor() { return mimicSource; },
};
window.BondiSkills = {};
require("../src/original/battle-damage-relics.js");
require("../src/original/battle-damage-lifecycle.js");
require("../src/original/battle-damage-resolution.js");
require("../src/original/battle-damage-hit.js");
require("../src/original/battle-damage.js");
const damageApi = BattleDamage(
  { isKillCard: card => card?.type === "slash" },
  { checkDefeat() {} },
);
damageApi.directDamage(state, target, 2, "测试", swordUser, 0, { name: "杀", type: "slash" });
assert(triggerArgs?.[1] === mimicSource, "damage source should still use the mimicked actor");
assert(triggerArgs?.[6] === swordUser, "damage trigger chain should preserve the original card user");

console.log("Guard Kelly relic regression tests passed");
