const fs = require("fs");
const vm = require("vm");

global.window = global;
global.console = console;

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function seeded(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) >>> 0;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

[
  "game-random.js",
  "economy-config.js", "data-cards.js", "card-utils.js",
  "data-characters-core.js", "data-characters-extra.js",
  "data-future-characters.js", "data-new-characters.js", "data-characters.js",
  "character-progression.js",
  "data-future-dungeons.js", "data-future-orc-enemies.js", "data-bakar-enemy.js",
  "data-future-enemies.js",
  "data-orc-bondi.js", "data-guard-kelly.js", "data-sakura-risa.js",
  "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
  "data-world.js", "data.js", "data-future-relics.js", "data-relics.js",
  "relics.js", "bounty-ledger.js", "receipt-ledger.js",
  "unlock-event-progress.js", "store-state-factory.js",
  "store-save-schema.js", "local-core-utils.js",
  "local-core-character.js", "local-core-commerce.js",
  "local-core-bounty.js", "local-core-dungeon.js", "local-core-events.js", "local-core.js",
  "server-core-apply.js", "server-core.js", "dungeon-enemies.js",
  "dungeon-map.js", "dungeon-events.js", "dungeon-reward-core.js", "dungeon-reward-payload.js",
  "settlement-recovery.js", "dungeon-settlement-actions.js",
  "orc-unlock-events.js", "new-character-unlock-events.js", "dungeon-node-rewards.js",
  "dungeon-run-rewards.js", "dungeon-rewards.js",
].forEach(file => load(`./src/original/${file}`));

window.GameStore = { baseStats: window.GameStoreStateFactory.baseStats };
window.SkinSystem = { skins: [] };
window.BountySystem = {
  completeBattle() {}, completeDungeon() {}, failRun() {}, markFallen() {},
};
window.ShopSystem = { refresh: async () => {} };
window.triggerPostUnderwaterTrainClearEvents = () => false;

const missionIds = ["machine_factory", "underwater_train", "orc_dungeon"];
const difficultyIds = ["normal", "adventure", "warrior", "king", "hell"];
const combatTypes = new Set(["normal", "elite", "boss"]);

module.exports = {
  assert,
  combatTypes,
  difficultyIds,
  DungeonEnemyGroups: window.DungeonEnemyGroups,
  DungeonEvents: window.DungeonEvents,
  DungeonMap: window.DungeonMap,
  DungeonRewardPayload: window.DungeonRewardPayload,
  DungeonRewards: window.DungeonRewards,
  GameData: window.GameData,
  GameStoreStateFactory: window.GameStoreStateFactory,
  missionIds,
  RelicSystem: window.RelicSystem,
  seeded,
  ServerCore: window.ServerCore,
  triggerOrcDungeonUnlockEvent: window.triggerOrcDungeonUnlockEvent,
};
