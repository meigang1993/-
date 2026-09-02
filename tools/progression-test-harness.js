const fs = require("fs");
const vm = require("vm");

global.window = global;

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

[
  "game-random.js", "economy-config.js", "data-cards.js",
  "data-characters-core.js", "data-characters-extra.js",
  "data-future-characters.js", "data-new-characters.js", "data-characters.js",
  "character-progression.js", "data-future-dungeons.js",
  "data-future-orc-enemies.js", "data-bakar-enemy.js", "data-future-enemies.js",
  "data-orc-bondi.js", "data-guard-kelly.js", "data-sakura-risa.js",
  "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
  "data-world.js", "data.js", "data-future-relics.js", "data-relics.js",
  "relics.js", "bounty-ledger.js", "receipt-ledger.js",
  "unlock-event-progress.js", "store-save-schema.js", "store-compact.js",
  "store-unlock-recovery.js", "store-unlock-migrations.js",
  "store-state-factory.js", "store-bounty-repairs.js", "store-repairs.js",
  "store-migration-characters.js", "store-migration-runs.js",
  "store-migration-normalizers.js", "store-migrations.js",
  "local-core-utils.js", "local-core-character.js", "local-core-commerce.js",
  "local-core-bounty.js", "local-core-dungeon.js", "local-core-events.js",
].forEach(file => load(`./src/original/${file}`));

window.CardUtils = { copyPlayable: card => ({ ...card }) };
window.SkinSystem = { skins: [], normalizeNames: list => list || [], normalizeMap: map => map || {}, normalizeSlots: list => list || [], normalizeEquipment: map => map || {}, ensure() {} };
window.GameStore = { baseStats: window.GameStoreStateFactory.baseStats };
load("./src/original/local-core.js");
load("./src/original/server-core-apply.js");
load("./src/original/server-core.js");

const fresh = () => window.GameStoreStateFactory.freshState();
const character = (state, id = "lokar") =>
  state.chars.find(item => item.id === id);

module.exports = {
  assert,
  character,
  fresh,
  GameData: window.GameData,
  Progression: window.CharacterProgression,
  ServerCore: window.ServerCore,
  Store: window.GameStoreMigrations,
};
