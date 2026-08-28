/* global GameData */
const fs = require("fs");
const vm = require("vm");

global.window = global;
function load(file) { vm.runInThisContext(fs.readFileSync(`./src/original/${file}`, "utf8"), { filename: file }); }
function assert(condition, message) { if (!condition) throw new Error(message); }
load("game-random.js");

const logs = [];
window.BattleLog = { add(state, text) { logs.push(text); } };
window.BattleLines = { skill() {} };
load("battle-cards-system.js");
window.BattleSystem = { pushFloat() {} };

[
  "economy-config.js", "data-cards.js", "card-utils.js",
  "data-future-orc-enemies.js", "data-bakar-enemy.js", "data-future-enemies.js",
  "data-orc-bondi.js", "data-guard-kelly.js", "data-sakura-risa.js",
  "data-machine-factory-enemies.js", "data-underwater-train-enemies.js", "data-world.js",
  "data.js", "data-future-relics.js", "data-relics.js", "relics.js",
  "sakura-risa-combat-skills.js", "sakura-risa-lifecycle-skills.js", "sakura-risa-skills.js",
  "sakura-risa-eye.js",
  "battle-draw-feedback.js", "witherer-relic-skills.js", "bertis-gerlot-skills.js",
  "nonoka-new-moon-skills.js",
  "nonoka-loki-skills.js",
  "battle-card-tactics.js", "battle-card-active-relics.js",
  "battle-card-hand-interactions.js", "battle-card-counter-interactions.js",
  "battle-card-interactions.js",
  "battle-card-specials.js",
  "battle-combat-card-effects.js", "battle-combat-attack-values.js",
  "battle-combat-attack-flow.js", "battle-combat-attack.js", "battle-combat-resolver.js",
  "battle-enemy-turn.js", "guest-ophelia-guard.js",
  "battle-thunder-hammer-response.js", "battle-dodge-cards.js",
  "battle-dodge-resume.js", "battle-dodge-auto-response.js",
  "battle-dodge-response.js",
  "battle-damage-response.js", "battle-damage-triggers.js",
  "battle-combat-responses.js", "battle-manual-hit-resume.js",
  "battle-manual-resume-actions.js", "battle-manual-continuation.js",
  "battle-manual-actions.js",
  "battle-manual-flow.js",
  "dungeon-enemies.js",
].forEach(load);
const template = GameData.enemies.orc_dungeon.find(enemy => enemy.id === "assassin_sakura_risa");

function unit(extra = {}) {
  return {
    uid: extra.uid || "risa", id: extra.id || template.id, ai: extra.ai || template.ai,
    name: extra.name || template.name, side: extra.side || "enemy", gender: extra.gender || "female",
    hp: extra.hp ?? 220, maxHp: extra.maxHp || 220, hand: extra.hand || [], deck: extra.deck || [],
    discard: [], statuses: [], stats: { attack: 10, magic: 7, bloodlust: 2 }, battleRelics: extra.battleRelics || [],
    ...extra,
  };
}

module.exports = { fs, load, assert, logs, template, unit };
