const assert = require("assert");
const fs = require("fs");

global.window = global;
require("../src/original/game-random.js");
require("../src/original/economy-config.js");
require("../src/original/data-cards.js");
require("../src/original/card-utils.js");
require("../src/original/battle-damage-utils.js");
require("../src/original/battle-draw-transaction.js");
require("../src/original/flora-carlos-skills.js");
require("../src/original/witherer-relic-skills.js");
require("../src/original/manny-skills.js");

window.BattleLines = { skill() {} };
window.BattleLog = { add() {} };
window.BattleDrawFeedback = { action: () => "摸牌" };
window.GuardKellySkills = { markFaceDown() {} };
window.SakuraRisaSkills = { pendingRevival: () => false };
window.RelicSystem = { hasEquipped: () => true };
window.BattleCards = {
  put(_battle, unit, card, pile) { (unit[pile] ||= []).push(card); },
};

let animId = 0;
const queueDamage = (state, target, actor, card) => {
  const utils = window.BattleDamageUtils(
    { isKillCard: window.CardUtils.isKillCard, nextAnim: () => ++animId },
    { queueSlashText() {} },
  );
  utils.queueAttackAnim(state, actor, target, card);
};
const unit = (uid, side, extra = {}) => ({
  uid, side, name: uid, ref: uid, hp: 20, maxHp: 20,
  hand: [], discard: [], stats: { attack: 2 }, skills: [], ...extra,
});
const scenario = () => {
  const actor = unit("actor", "ally");
  const flora = unit("flora", "ally", {
    skills: [{ name: "神速飞剑" }],
  });
  const target = unit("target", "enemy", {
    hand: [window.CardUtils.cloneEntity("蓄力")],
  });
  return {
    actor, flora, target,
    state: {
      battle: {
        allies: [actor, flora], enemies: [target], animQueue: [],
        phase: 4, turn: 1,
      },
    },
  };
};
const flightCount = state =>
  state.battle.animQueue.filter(event => event.type === "virtualPlay").length;

{
  const { state, actor, target } = scenario();
  const card = window.CardUtils.cloneEntity("刺杀", {
    _playedFlightDone: true, _playedTargetUid: target.uid,
  });
  queueDamage(state, target, actor, card);
  assert.strictEqual(flightCount(state), 0,
    "An entity Assassinate must reuse its completed target flight");
}

{
  const { state, actor, target } = scenario();
  const queued = window.CardUtils.fromEntity("魔杀");
  const damageCard = {
    ...queued, _entitySourceCard: queued,
  };
  state.battle.animQueue.push({
    type: "virtualPlay", uid: actor.uid, targetUid: target.uid, card: queued,
  });
  queueDamage(state, target, actor, damageCard);
  assert.strictEqual(flightCount(state), 1,
    "A prepared clone must reuse its explicitly queued source-card flight");
}

{
  const { state, actor, target } = scenario();
  const skill = {
    name: "神速之袭", type: "tactic", speedAssault: true, _skill: true,
    _playedFlightDone: true, _playedTargetUid: target.uid,
  };
  window.FloraSonicSkinFX = { active: () => false, assault() {} };
  window.FloraCarlosSkills.handleSpecialCard(
    state, actor, target, skill, { draw: () => [] },
    { damage: (s, t, _amount, _source, a, card) => queueDamage(s, t, a, card) },
  );
  assert.strictEqual(flightCount(state), 0,
    "Speed Assault's virtual Assassinate must reuse the skill-card flight");
}

{
  const { state, actor, target } = scenario();
  actor.intent = 0;
  const relicCard = {
    name: "1124号长舌头", type: "tactic", withererTongueActive: true,
    _playedFlightDone: true, _playedTargetUid: target.uid,
  };
  window.WithererRelicSkills.useTongueActive(
    state, actor, target, relicCard,
    (s, a, t, card) => queueDamage(s, t, a, card),
  );
  assert.strictEqual(flightCount(state), 0,
    "Long Tongue's virtual Strangle must reuse the active-relic flight");
}

{
  const { state, actor, flora, target } = scenario();
  let bladeFx = 0;
  window.FloraSonicSkinFX = {
    active: unit => unit === flora,
    flyingBlade() { bladeFx += 1; },
  };
  window.FloraCarlosSkills.afterSlashDamage(
    state, actor, target, window.CardUtils.cloneEntity("杀（普攻）"), 2,
    { damage: (s, t, _amount, _source, a, card) => queueDamage(s, t, a, card) },
  );
  assert.strictEqual(bladeFx, 1,
    "Sonic Assassin Speed Blade must play its dedicated strike once");
  assert.strictEqual(flightCount(state), 0,
    "Sonic Assassin Speed Blade must not add a generic second target line");
}

{
  const attacker = unit("attacker", "enemy");
  const manny = unit("manny", "ally", { mannyWeapon: "ak47" });
  const state = {
    battle: {
      allies: [manny], enemies: [attacker], animQueue: [],
    },
  };
  let gunFx = 0;
  window.MannyGunSkinFX = {
    active: unit => unit === manny,
    weaponAttack() { gunFx += 1; },
  };
  window.MannySkills.afterDamage(
    state, attacker, manny, { name: "测试伤害" }, 1,
    (s, t, _amount, _source, a, card) => queueDamage(s, t, a, card),
  );
  assert.strictEqual(gunFx, 1,
    "Gun Succubus AK47 counter must play its dedicated gunfire once");
  assert.strictEqual(flightCount(state), 0,
    "Gun Succubus AK47 counter must not add a generic second target line");
}

{
  const attacker = unit("attacker", "enemy");
  const manny = unit("manny", "ally", { mannyWeapon: "ak47" });
  const state = {
    battle: {
      allies: [manny], enemies: [attacker], animQueue: [],
    },
  };
  window.MannyGunSkinFX = {
    active: () => false,
    weaponAttack() {},
  };
  window.MannySkills.afterDamage(
    state, attacker, manny, { name: "测试伤害" }, 1,
    (s, t, _amount, _source, a, card) => queueDamage(s, t, a, card),
  );
  assert.strictEqual(flightCount(state), 1,
    "Default AK47 counter must retain one generic target flight");
}

{
  const { state, actor, flora, target } = scenario();
  window.FloraSonicSkinFX = {
    active: () => false,
    flyingBlade() {},
  };
  window.FloraCarlosSkills.afterSlashDamage(
    state, actor, target, window.CardUtils.cloneEntity("杀（普攻）"), 2,
    { damage: (s, t, _amount, _source, a, card) => queueDamage(s, t, a, card) },
  );
  assert.strictEqual(flightCount(state), 1,
    "Default Speed Blade must retain one generic target flight");
}

{
  const unitCss = fs.readFileSync("publish/battle-units.css", "utf8");
  assert.match(unitCss,
    /\.unit-speech-bubble\[data-dismiss-speech\]\s*\{[^}]*pointer-events:\s*auto;[^}]*cursor:\s*pointer;/,
    "Dismissible unit speech must receive its own click instead of targeting the unit below");
}

console.log("Generated attack presentation tests passed");
