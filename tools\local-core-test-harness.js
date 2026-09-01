const assert = require("assert");

global.window = global;
require("../src/original/game-random.js");
require("../src/original/character-progression.js");
window.GameEconomy = {
  startingGold: 0,
  shop: { defaultCardPrice: 80, deleteCost: 1000, stockSize: 6, expandedStockSize: 7 },
  relic: { smeltGold: 110 },
  dungeonGold: { normal: [50, 100], elite: 175, boss: 265, chest: 125 },
};
window.GameData = {
  initialShopCardNames: ["借刀杀人", "魔王军入侵"],
  protectedBaseDeck: [{ name: "杀（普攻）", suit: "♠" }],
  baseDeck: [{ name: "杀（普攻）", suit: "♠", type: "slash", power: 1 }],
  eliteCards: [
    { name: "毒杀", suit: "♠", price: 700 },
    { name: "伤口处理", suit: "♥", price: 400 },
    { name: "物资补给", suit: "♦", price: 400 },
  ],
  characters: [{
    id: "hero", name: "Hero", unlockCost: 1,
    stats: {
      attack: 3, magic: 2, speed: 3, maxHp: 30,
      bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 2,
    },
  }],
  statDefs: [
    ["attack", "攻击力"], ["magic", "魔力"], ["speed", "速度"],
    ["maxHp", "生命值"], ["bloodlust", "杀意上限"],
    ["handLimit", "手牌上限"], ["drawPerTurn", "每回合摸牌"],
    ["initialDraw", "初始摸牌"],
  ],
  difficulties: {
    normal: {
      reward: 1, xp: 1, dropRate: 0,
      enemy: { normal: { hp: 1, power: 1, speed: 1 } },
    },
  },
  missions: [{ id: "machine_factory", kind: "dungeon", reward: {} }],
  enemies: { machine_factory: [] },
  eliteUnlocks: {},
};
window.CardUtils = { copyPlayable: card => ({ ...card }) };
require("../src/original/data-future-relics.js");
require("../src/original/data-relics.js");
require("../src/original/relics.js");
window.RelicSystem.randomElite = () => null;
window.GameStore = { baseStats: () => ({ attack: 0, maxHp: 10, bloodlust: 1, initialDraw: 2 }) };
window.BountyRender = { rewardText: () => "" };
window.SkinSystem = {
  skins: [
    { id: "hero_default", charId: "hero", initial: true, price: 0 },
    { id: "hero_rare", charId: "hero", price: 13 },
  ],
  byId(id) { return this.skins.find(skin => skin.id === id); },
  price(skin) { return skin.price; },
};

require("../src/original/unlock-event-progress.js");
require("../src/original/store-save-schema.js");
require("../src/original/store-save-validation.js");
require("../src/original/store-save-limits.js");
[
  "bounty-ledger.js",
  "receipt-ledger.js",
  "local-core-utils.js", "local-core-character.js", "local-core-commerce.js",
  "local-core-bounty.js", "local-core-dungeon.js", "local-core-events.js", "local-core.js",
  "server-core-apply.js", "server-core.js", "bounty-rewards.js", "bounty-task-rewards.js",
  "bounty-task-generator.js", "bounty-task-repair.js", "bounty-tasks.js", "bounty.js",
].forEach(file => require(`../src/original/${file}`));

function character(id, locked = true) {
  const template = window.GameData.characters.find(item => item.id === id);
  const stats = template
    ? window.CharacterProgression.statsAt(template, 0)
    : {
      attack: 0, magic: 0, speed: 0, maxHp: 10,
      bloodlust: 1, handLimit: 0, drawPerTurn: 0, initialDraw: 2,
    };
  return {
    id, locked, level: 0, exp: 0, hp: stats.maxHp, stats,
  };
}

function state() {
  return {
    resources: { gold: 10000, essence: 30, relics: [] },
    chars: [
      character("hero", false), character("loki"), character("carlos"),
      character("manny"), character("miller"), character("bertis"), character("gerlot"),
      character("wendy"), character("cadicis"), character("angelica"), character("luka"),
      character("elrana"), character("little_elrana"), character("ace"),
      character("nanali"), character("aileng"), character("ophelia"),
      character("sonia"), character("chiyo"),
    ],
    deck: [], shopCards: [], defeatedElites: [], unlockedShopCards: [],
    unlockedDifficulties: ["normal"], flags: {},
    unlockEvents: window.UnlockEventProgress.fresh(),
    shopAuthorityVersion: 1, ownedSkins: {}, equippedSkins: {},
  };
}

module.exports = {
  assert,
  BountyRewards: window.BountyRewards,
  BountySystem: window.BountySystem,
  character,
  GameData: window.GameData,
  GameEconomy: window.GameEconomy,
  GameStoreSaveLimits: window.GameStoreSaveLimits,
  LocalCore: window.LocalCore,
  ServerCore: window.ServerCore,
  state,
};
