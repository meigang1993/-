const fs = require("fs");
const vm = require("vm");

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function setup() {
  global.window = global;
  load("./src/original/game-random.js");
  window.GameData = { enemies: {}, statDefs: [] };
  window.BattleLog = { add(state, message) { (state.log ||= []).push(message); } };
  window.BattleLines = { skill(state, unit, name) { (state.lines ||= []).push(`${unit.id}:${name}`); } };
  load("./src/original/battle-cards-system.js");
  [
    "data-future-relics.js", "data-relics.js", "relics.js", "economy-config.js", "data-cards.js", "card-utils.js", "battle-card-cleanup.js",
    "data-future-orc-enemies.js", "data-bakar-enemy.js", "data-future-enemies.js",
    "witherer-relic-skills.js", "witherer-skills.js",
    "ui-common-skill-model.js", "ui-common-skill-view.js",
    "ui-common-skills.js", "ui-common-art.js", "ui-common-card-art.js",
    "ui-common-card-combat.js", "ui-common-cards.js",
    "ui-common-relics.js", "ui-common.js",
    "battle-card-playability.js", "battle-combat-targeting.js",
    "battle-ai-helpers.js", "battle-ai-tactics.js", "battle-ai-slash-planner.js",
    "battle-ai-skill-helpers.js", "battle-ai-skill-evaluation.js",
    "battle-ai-skill-moves.js", "battle-ai-skill-planner.js", "battle-ai.js",
    "battle-turn-state.js",
    "nonoka-new-moon-skills.js", "nonoka-loki-skills.js", "guest-ophelia-guard.js",
  ].forEach(file => load(`./src/original/${file}`));
}

module.exports = { assert, setup };
