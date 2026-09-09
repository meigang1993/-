const assert = require("assert");
const fs = require("fs");
const path = require("path");

global.window = global;
require("../src/original/game-random.js");
window.GameEconomy = { shop: { defaultCardPrice: 0 } };
window.BattleLog = { add(state, text) { (state.log ||= []).push(text); } };
window.BattleLines = { skill() {} };
window.BattleStats = { damage() {}, heal() {} };
window.BattleCards = {
  put(_battle, unit, card, pile) { (unit[pile] ||= []).push(card); },
  putMany(_battle, unit, cards, pile) { (unit[pile] ||= []).push(...cards); },
  afterHandLost() {},
  syncStatusCards() {},
};
window.BattleStatus = { mark() {} };
window.UnderwaterTrainControlSkills = () => ({});

require("../src/original/battle-pile-stats.js");
require("../src/original/data-cards.js");
window.GameData = { ...window.GameDataCards };
require("../src/original/card-utils.js");
require("../src/original/data-future-relics.js");
require("../src/original/data-relics.js");
require("../src/original/relics.js");
require("../src/original/battle-draw-feedback.js");
require("../src/original/battle-card-active-relics-core.js");
require("../src/original/battle-card-active-relics-demon.js");
require("../src/original/battle-card-active-relics-assassin.js");
require("../src/original/battle-card-active-relics-arsenal.js");
require("../src/original/battle-card-active-relics.js");
require("../src/original/battle-card-tactics.js");
require("../src/original/battle-card-hand-interactions.js");
require("../src/original/battle-card-counter-interactions.js");
require("../src/original/battle-card-interactions.js");
require("../src/original/battle-card-specials.js");
require("../src/original/underwater-train-bite-skills.js");
require("../src/original/underwater-train-prepare-skills.js");
require("../src/original/underwater-train-target-counters.js");
require("../src/original/underwater-train-target-actions.js");
require("../src/original/underwater-train-target-skills.js");
require("../src/original/underwater-train-damage-skills.js");
require("../src/original/underwater-train-attack-skills.js");
require("../src/original/underwater-train-combat-skills.js");
require("../src/original/underwater-train-skills.js");
require("../src/original/battle-card-cleanup.js");
require("../src/original/battle-combat-card-effects.js");
require("../src/original/battle-combat-attack-values.js");
require("../src/original/battle-combat-attack-flow.js");
require("../src/original/battle-combat-attack.js");
require("../src/original/battle-combat-resolver.js");
require("../src/original/witherer-relic-skills.js");

const relicNames = [
  ...Object.keys(window.GameDataRelics),
  ...Object.keys(window.GameDataFutureRelics),
];

function auditRelicReferences() {
  assert.strictEqual(relicNames.length, 30, "the relic audit must cover all 30 relics");
  const sourceDir = path.join(__dirname, "../src/original");
  const runtimeText = fs.readdirSync(sourceDir)
    .filter(file => file.endsWith(".js") && !["data-relics.js", "data-future-relics.js"].includes(file))
    .map(file => fs.readFileSync(path.join(sourceDir, file), "utf8"))
    .join("\n");
  relicNames.forEach(name => {
    assert(runtimeText.includes(name), `${name} must have a non-data runtime reference`);
  });
}

function unit(name, side = "ally") {
  return {
    uid: name, name, side, hp: 20, maxHp: 20, block: 0, intent: 2,
    stats: { attack: 2, magic: 2, speed: 2, bloodlust: 2, handLimit: 4 },
    skills: [], hand: [], deck: [], discard: [], consumed: [], statuses: [],
  };
}

module.exports = {
  assert,
  auditRelicReferences,
  BattleCardActiveRelics: window.BattleCardActiveRelics,
  BattleCardCleanup: window.BattleCardCleanup,
  BattleCardSpecials: window.BattleCardSpecials,
  BattleCardTactics: window.BattleCardTactics,
  BattleCombatResolver: window.BattleCombatResolver,
  CardUtils: window.CardUtils,
  RelicSystem: window.RelicSystem,
  UnderwaterTrainSkills: window.UnderwaterTrainSkills,
  unit,
  WithererRelicSkills: window.WithererRelicSkills,
};
