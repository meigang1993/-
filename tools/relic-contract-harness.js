/* global BattleCardActiveRelics, BattleCards, CardUtils */
const assert = require("assert");
const { combat, card, scenario } = require("./pursue-kill-fixtures");

window.BattleCards = null;
require("../src/original/battle-pile-stats.js");
require("../src/original/battle-cards-system.js");
require("../src/original/data-future-relics.js");
require("../src/original/data-relics.js");
require("../src/original/relics.js");
require("../src/original/battle-relic-turns.js");
require("../src/original/battle-discard-flow.js");
require("../src/original/underwater-train-control-skills.js");
require("../src/original/underwater-train-bite-skills.js");
require("../src/original/underwater-train-prepare-skills.js");
require("../src/original/underwater-train-target-counters.js");
require("../src/original/underwater-train-target-actions.js");
require("../src/original/underwater-train-target-skills.js");
require("../src/original/underwater-train-damage-skills.js");
require("../src/original/underwater-train-attack-skills.js");
require("../src/original/underwater-train-combat-skills.js");
require("../src/original/underwater-train-skills.js");
require("../src/original/orc-drone-skills.js");
require("../src/original/orc-combat-skills.js");
require("../src/original/orc-dungeon-skills.js");
require("../src/original/guest-ophelia-guard.js");
require("../src/original/green-hat.js");
require("../src/original/guest-aileng-skills.js");
require("../src/original/guest-characters-skills.js");
require("../src/original/guard-kelly-skills.js");
require("../src/original/sakura-risa-combat-skills.js");
require("../src/original/sakura-risa-lifecycle-skills.js");
require("../src/original/sakura-risa-skills.js");
require("../src/original/bakar-relic-skills.js");
require("../src/original/bakar-core-skills.js");
require("../src/original/bakar-fire-skills.js");
require("../src/original/bakar-skills.js");
require("../src/original/bondi-skills.js");
require("../src/original/machine-factory-skills.js");
require("../src/original/enemy-status-effects.js");
require("../src/original/enemy-kill-hooks.js");
require("../src/original/enemy-damage-hooks.js");
require("../src/original/enemy-combat-hooks.js");
require("../src/original/enemy-tactical-skills.js");
require("../src/original/enemy-skills.js");
require("../src/original/battle-setup.js");

window.GameData = { ...window.GameDataCards };
require("../src/original/ui-common-skill-model.js");
require("../src/original/ui-common-skill-view.js");
require("../src/original/ui-common-skills.js");
require("../src/original/ui-common-art.js");
require("../src/original/ui-common-card-art.js");
require("../src/original/ui-common-card-combat.js");
require("../src/original/ui-common-cards.js");
require("../src/original/ui-common-relics.js");
require("../src/original/ui-common.js");
window.BattleStats = { damage() {}, heal() {}, initialize() {} };
window.BattleSystem = { pushFloat() {}, holdVisual() {}, draw() {} };
window.SkinSystem = { applyToChar: (_state, character) => character };
window.GameAssets = { preloadBattle: async () => {} };
window.AngelicaLukaSkills ||= { battleStart() {} };

const contracts = new Map();
const contract = (name, test) => {
  assert(!contracts.has(name), `duplicate relic contract: ${name}`);
  contracts.set(name, test);
};
const equip = (unit, ...names) => { unit.battleRelics = names; return unit; };
const isKill = current => CardUtils.isKillCard(current);
const allUnits = battle => battle.allies.concat(battle.enemies);

function unit(name, side = "ally", extra = {}) {
  return {
    uid: name, id: name, ref: name, name, side, gender: "female",
    hp: 20, maxHp: 20, block: 0, intent: 2,
    stats: { attack: 0, magic: 0, speed: 0, bloodlust: 2, handLimit: 4 },
    skills: [], hand: [], deck: [], discard: [], consumed: [], statuses: [],
    ...extra,
  };
}

function stateOf(allies, enemies) {
  return {
    settings: { manualResponse: false },
    log: [],
    battle: {
      allies, enemies, phase: 4, locked: false, combo: 0,
      hitFxId: 0, animQueue: [], played: [], shownPlayed: [],
      defeatedEnemyIds: [], roundOrder: [], roundIndex: 0,
    },
  };
}

function activeHarness(actor, state) {
  const used = [];
  const deps = {
    draw(owner, count) {
      owner.hand.push(...Array.from({ length: count }, (_, index) => ({
        name: `摸牌${index + 1}`, type: "slash",
      })));
    },
  };
  const ctx = {
    selectedHand() {
      return { i: 0, card: actor.hand[0], ok: !!actor.hand[0] && !actor.hand[0]._pendingDraw };
    },
    moveHand(current, owner, index, pile) {
      const [moved] = owner.hand.splice(index, 1);
      BattleCards.put(current.battle, owner, moved, pile);
      return moved;
    },
    putMany(current, owner, cards, pile) {
      BattleCards.putMany(current.battle, owner, cards, pile);
    },
    useCard(_current, owner, target, usedCard) {
      used.push({ owner, target, card: usedCard });
    },
  };
  return { used, api: BattleCardActiveRelics(deps, ctx) };
}

module.exports = {
  assert, combat, card, scenario, contracts, contract, equip,
  isKill, allUnits, unit, stateOf, activeHarness,
};
