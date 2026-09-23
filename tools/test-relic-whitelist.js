const { assert, fresh } = require("./progression-test-harness");

require("../src/original/store-save-validation.js");
require("../src/original/store-save-limits.js");
require("../src/original/store-main-copy-inspection.js");

const unknown = "篡改饰品";
const deletedRelics = [
  "小艾尔拉娜的书包", "艾尔拉娜裸照", "冠军电力拳套",
  "狐面具", "伊迪斯魔眼", "魔法帽", "魔法不休陀螺",
  "深海骑士大锚", "天鹰盾",
];
const deletedCards = ["药瓶箱", "命运硬币", "强杀", "重振旗鼓", "本能反应"];
window.SkinSystem.byId = id => ({
  lokar_motherbound: { id: "lokar_motherbound", charId: "lokar" },
})[id] || null;
assert(window.RelicSystem.data(unknown) === null,
  "unknown relic data must not synthesize attributes");
assert(Object.keys(window.RelicSystem.statsForNames([unknown])).length === 0,
  "unknown relics must not grant stats");
["constructor", "toString", "__proto__"].forEach(name => {
  assert(window.RelicSystem.data(name) === null,
    `prototype property ${name} must not resolve as relic data`);
  assert(!window.RelicSystem.isFormalId(name),
    `prototype property ${name} must not pass the formal relic whitelist`);
});
assert(window.RelicSystem.skillsForNames(["constructor"]).length === 0,
  "prototype property names must not synthesize relic skills");

const runtime = fresh();
const beforeEquipment = JSON.stringify(runtime.equipment);
assert(!window.RelicSystem.equip(runtime, "lokar", unknown, 0),
  "unknown relics must not be equipable");
assert(JSON.stringify(runtime.equipment) === beforeEquipment,
  "rejected relic equipment must not mutate state");

const migrated = fresh();
migrated.flags.characterProgressionVersion =
  window.GameStoreStateFactory.characterProgressionVersion;
migrated.resources.relics = ["母亲照片", ...deletedRelics, unknown, "constructor", "准备背包"];
migrated.relicCollection = [unknown, ...deletedRelics, "鬼王扑克"];
migrated.testRelics = ["鬼王扑克", ...deletedRelics, unknown];
migrated.testAllies = ["lokar", "removed_character", "lokar"];
migrated.testEnemies = [0, 9999, 0];
migrated.testSkins = {
  lokar: "lokar_motherbound",
  besta_doll: "lokar_motherbound",
  removed_character: "lokar_motherbound",
};
migrated.equipment = {
  lokar: ["艾尔拉娜裸照", "母亲照片"],
  besta_doll: ["准备背包", "鬼王扑克"],
};
migrated.testEquipment = {
  lokar: ["魔法帽", "鬼王扑克", unknown],
  removed_character: ["鬼王扑克"],
};
migrated.pendingRun = {
  gold: 10, essence: 0, cards: [], relics: ["魔法帽", "鬼王扑克", unknown],
};
migrated._localPendingRun = {
  gold: 5, essence: 0, cards: [], relics: [unknown, "准备背包", "母亲照片"],
};
migrated.view = "dungeon";
migrated.explore = {
  focusId: "run",
  missionId: "machine_factory",
  difficultyId: "normal",
  layers: [[{ id: "n1-0" }]],
  current: "n1-0",
  earned: { gold: 0, essence: 0, cards: [], relics: [unknown, "魔法帽", "母亲照片"] },
};
const receiptId = "machine_factory:normal:run:n1-0";
migrated._localRunState = {
  version: 1,
  key: "run",
  rewards: {
    [receiptId]: { gold: 1, essence: 0, cards: [], relics: [unknown, "鬼王扑克"] },
  },
};
migrated.pendingBountyRewards = [
  { claimId: "valid", reward: { type: "relic", relic: "母亲照片" } },
  ...deletedRelics.map((relic, index) => ({
    claimId: `deleted-${index}`, reward: { type: "relic", relic },
  })),
  { claimId: "legacy-deleted", reward: { type: "relic", relic: "准备背包" } },
  { claimId: "invalid", reward: { type: "relic", relic: unknown } },
];
window.GameStoreMigrations.migrate(migrated);

assert(JSON.stringify(migrated.resources.relics)
  === JSON.stringify(["母亲照片"]),
  "migration must remove deleted and unknown inventory relic ids");
assert(JSON.stringify(migrated.relicCollection) === JSON.stringify(["鬼王扑克"]),
  "migration must remove deleted and unknown relic codex entries");
assert(JSON.stringify(migrated.equipment.lokar)
  === JSON.stringify([null, "母亲照片"]),
  "migration must remove unknown equipped relics without shifting later slots");
assert(JSON.stringify(migrated.equipment.besta_doll)
  === JSON.stringify([null, "鬼王扑克"]),
  "migration must discard the deleted legacy bag id without shifting later slots");
assert(JSON.stringify(migrated.testRelics) === JSON.stringify(["鬼王扑克"]),
  "migration must remove unknown test inventory relics");
assert(JSON.stringify(migrated.testEquipment.lokar) === JSON.stringify([null, "鬼王扑克"]),
  "migration must remove deleted and unknown test equipment relics");
assert(!migrated.testEquipment.removed_character,
  "migration must remove test equipment owned by deleted characters");
assert(JSON.stringify(migrated.testAllies) === JSON.stringify(["lokar", "besta_doll"]),
  "migration must remove deleted and duplicate test characters");
assert(JSON.stringify(migrated.testEnemies) === JSON.stringify([0]),
  "migration must remove deleted and duplicate test enemies");
assert(JSON.stringify(migrated.testSkins)
  === JSON.stringify({ lokar: "lokar_motherbound" }),
"migration must remove deleted, unknown, and mismatched test skins");
assert(JSON.stringify(migrated.pendingRun.relics) === JSON.stringify(["鬼王扑克"]),
  "migration must remove deleted and unknown pending dungeon relics");
assert(JSON.stringify(migrated._localPendingRun.relics)
  === JSON.stringify(["母亲照片"]),
  "migration must discard deleted legacy ids in local pending dungeon rewards");
assert(JSON.stringify(migrated.explore.earned.relics) === JSON.stringify(["母亲照片"]),
  "migration must remove deleted and unknown active-run relic rewards");
assert(JSON.stringify(migrated._localRunState.rewards[receiptId].relics)
  === JSON.stringify(["鬼王扑克"]),
  "migration must remove unknown relic receipt rewards");
assert(migrated.pendingBountyRewards.length === 1
  && migrated.pendingBountyRewards[0].reward.relic === "母亲照片",
  "migration must remove deleted, legacy, and invalid bounty relic rewards");
assert(migrated._needsSaveAfterMigration,
  "relic sanitization must request a follow-up save");
assert(window.GameStoreSaveLimits.validateMigrated(migrated),
  "sanitized relic state must pass migrated-save validation");

const slotted = fresh();
slotted.flags.characterProgressionVersion =
  window.GameStoreStateFactory.characterProgressionVersion;
slotted.equipment = { lokar: [null, "鬼王扑克"] };
window.GameStoreMigrations.migrate(slotted);
assert(JSON.stringify(slotted.equipment.lokar)
  === JSON.stringify([null, "鬼王扑克"]),
  "migration must preserve a relic equipped only in the second slot");
assert(window.GameStoreSaveLimits.validateMigrated(slotted),
  "empty equipment slots must remain valid after migration");
assert(window.RelicSystem.unequip(slotted, "lokar", 1),
  "a formal relic in the second slot must remain removable");
assert(JSON.stringify(slotted.equipment.lokar) === JSON.stringify([]),
  "removing the second-slot relic must leave no phantom slot");

const equipped = fresh();
equipped.resources.relics = ["母亲照片", "鬼王扑克"];
equipped.equipment = { lokar: ["母亲照片", "鬼王扑克"] };
assert(window.RelicSystem.unequip(equipped, "lokar", 0),
  "the first equipped relic must be removable");
assert(JSON.stringify(equipped.equipment.lokar)
  === JSON.stringify([null, "鬼王扑克"]),
  "unequipping slot one must not shift slot two");

const legacyCards = fresh();
legacyCards.flags.characterProgressionVersion =
  window.GameStoreStateFactory.characterProgressionVersion;
const removedCardCopies = deletedCards.map(name => ({ name, suit: "♠" }));
legacyCards.deck.push(...removedCardCopies);
legacyCards.deckVersion = "shoup4-v12";
legacyCards.shopCards = [{ card: { name: "药瓶箱", suit: "♥" }, sold: false }];
legacyCards.unlockedShopCards.push(...deletedCards);
legacyCards.testCards = [...deletedCards, "毒杀"];
legacyCards.bounties = [{
  id: "legacy-card-task", type: "bond", missionId: "machine_factory",
  charId: "lokar", reward: { type: "card", card: { name: "命运硬币", suit: "♦" } },
}];
legacyCards.pendingBountyRewards = [{
  claimId: "legacy-card-reward",
  reward: { type: "card", card: { name: "强杀", suit: "♣" } },
}];
legacyCards.pendingRun = {
  gold: 0, essence: 0,
  cards: [{ name: "重振旗鼓", suit: "♥" }], relics: [],
};
legacyCards._localPendingRun = {
  gold: 0, essence: 0,
  cards: [{ name: "本能反应", suit: "♦" }], relics: [],
};
assert(window.GameStoreSaveLimits.validateRaw(legacyCards),
  "raw saves containing explicitly removed cards must remain eligible for migration");
const inspectedLegacyCards = window.GameStoreMainCopyInspection({
  migrate: window.GameStoreMigrations.migrate,
}).inspectCopy(legacyCards);
assert(!inspectedLegacyCards.corrupt && inspectedLegacyCards.data,
  "main and manual save inspection must migrate removed cards instead of rejecting the copy");
assert(inspectedLegacyCards.data._needsSaveAfterMigration,
  "deleted-card migration must request a durable follow-up save");
Object.assign(legacyCards, inspectedLegacyCards.data);
assert(!legacyCards.deck.some(card => deletedCards.includes(card.name)),
  "migration must remove deleted cards from the persistent deck");
assert(!legacyCards.shopCards.length,
  "migration must remove deleted cards from persisted shop stock");
assert(!legacyCards.unlockedShopCards.some(name => deletedCards.includes(name)),
  "migration must remove deleted card names from shop unlocks");
assert(JSON.stringify(legacyCards.testCards) === JSON.stringify(["毒杀"]),
  "migration must remove deleted cards from test-battle selection");
assert(!legacyCards.bounties[0].reward,
  "migration must remove deleted card rewards from retained bounty tasks");
assert(!legacyCards.pendingBountyRewards.length,
  "migration must remove deleted pending bounty card rewards");
assert(!legacyCards.pendingRun.cards.length
  && !legacyCards._localPendingRun.cards.length,
  "migration must remove deleted cards from pending dungeon rewards");
assert(window.GameStoreSaveLimits.validateMigrated(legacyCards),
  "deleted-card migration result must pass strict migrated-save validation");

const forged = fresh();
forged.resources.relics = [unknown];
assert(window.GameStoreSaveLimits.validateRaw(forged),
  "raw saves with unknown relic ids must remain eligible for migration");
assert(!window.GameStoreSaveLimits.validateMigrated(forged),
  "migrated saves must reject unknown inventory relic ids");
forged.resources.relics = [];
forged.relicCollection = [unknown];
assert(!window.GameStoreSaveLimits.validateMigrated(forged),
  "migrated saves must reject unknown relic codex ids");
forged.relicCollection = [];
forged.equipment = { lokar: [unknown] };
assert(!window.GameStoreSaveLimits.validateMigrated(forged),
  "migrated saves must reject unknown equipped relic ids");
forged.equipment = {};
forged.pendingRun = {
  gold: 0, essence: 0, cards: [], relics: [unknown],
};
assert(!window.GameStoreSaveLimits.validateMigrated(forged),
  "migrated saves must reject unknown pending reward relic ids");

console.log("Relic whitelist tests passed");
