const assert = require("assert");
const fs = require("fs");

global.window = global;
require("../src/original/data-skins.js");
require("../src/original/skins.js");

const expectedSpecialArt = {
  bertis_level_10_special: ["bertis", "./assets/generated/bertis-level-10-special.022dd113.webp"],
  nonoka_level_10_special: ["nonoka", "./assets/generated/nonoka-level-10-special.ba4c8ff8.webp"],
  manny_level_10_special: ["manny", "./assets/generated/manny-level-10-special.a8c2eeed.webp"],
  flora_level_10_special: ["flora", "./assets/generated/flora-level-10-special.075896ea.webp"],
  wendy_level_10_special: ["wendy", "./assets/generated/wendy-level-10-special.8b3d47ab.webp"],
  elrana_level_10_special: ["elrana", "./assets/generated/elrana-level-10-special.3154d24b.webp"],
  angelica_level_10_special: ["angelica", "./assets/generated/angelica-level-10-special.1d7b9a23.webp"],
};

function verifySpecialArt(charId, skinId, art) {
  const skin = SkinSystem.byId(skinId);
  assert(skin?.charId === charId && skin.unlockLevel === 10
    && skin.specialIllustration, `${skinId} must be a level-10 skin`);
  assert(skin.art === art, `${skinId} must use its compressed uploaded asset`);
  assert(fs.existsSync(`./publish/${skin.art.slice(2)}`),
    `${skinId} asset must exist in publish`);
  const state = {
    chars: [{ id: charId, locked: false, level: 9 }],
    ownedSkins: {}, equippedSkins: {}, testSkins: {}, battle: null,
  };
  assert(!SkinSystem.owned(state, skin), `${skinId} must stay locked below level 10`);
  assert(!SkinSystem.equip(state, skin.id), `${skinId} must not equip while locked`);
  state.ownedSkins[skin.id] = true;
  state.equippedSkins[charId] = skin.id;
  SkinSystem.ensure(state);
  assert(!state.ownedSkins[skin.id] && state.equippedSkins[charId] === `${charId}_default`,
    `${skinId} must clear legacy ownership and equipment below level 10`);
  state.chars[0].level = 10;
  assert(SkinSystem.owned(state, skin), `${skinId} must unlock at level 10`);
  assert(state.ownedSkins[skin.id], `${skinId} must enter the owned-skin set`);
  assert(SkinSystem.equip(state, skin.id), `${skinId} must equip formally`);
  assert(SkinSystem.applyToChar(state, state.chars[0]).art === skin.art,
    `${skinId} must replace the formal portrait`);
  state.chars[0].level = 0;
  state.battle = { test: true };
  assert(SkinSystem.testEquip(state, charId, skin.id),
    `${skinId} must be trialable in test battles regardless of level`);
  assert(SkinSystem.applyToChar(state, state.chars[0], true).art === skin.art,
    `${skinId} trial must replace the portrait in test battle`);
}

assert.deepStrictEqual(
  SkinSystem.skins.filter(skin => skin.specialIllustration).map(skin => skin.id).sort(),
  Object.keys(expectedSpecialArt).sort(),
  "every level special illustration must be covered by the legacy-save matrix",
);
Object.entries(expectedSpecialArt).forEach(([skinId, [charId, art]]) => {
  verifySpecialArt(charId, skinId, art);
});

global.StoreRepairs = { refreshBountyGold() {} };
global.RelicSystem = {
  normalizeNames: value => Array.isArray(value) ? value : [],
  normalizeMap: value => value && typeof value === "object" ? value : {},
  normalizeSlots: value => Array.isArray(value) ? value : [],
};
global.GameData = {
  testEnemies: [{}], difficulties: { normal: {} }, cardCodex: [], baseCardNames: [],
};
require("../src/original/store-migration-normalizers.js");

function migrationState(charId, level, owned = {}, equipped = {}) {
  return {
    chars: [{ id: charId, locked: false, level }],
    resources: { relics: [] },
    ownedSkins: owned,
    equippedSkins: equipped,
    testAllies: [charId],
    testEnemies: [0],
    testCards: [],
    testRelics: [],
    testEquipment: {},
    testSkins: {},
    testDifficulty: "normal",
    sortieStarting: false,
    testBattleStarting: false,
  };
}

Object.entries(expectedSpecialArt).forEach(([skinId, [charId]]) => {
  let migrationWrites = 0;
  const eligibleSave = migrationState(charId, 10);
  StoreMigrationNormalizers.normalizeCollectionState(
    eligibleSave, () => { migrationWrites += 1; },
  );
  assert(eligibleSave.ownedSkins[skinId],
    `${skinId} must be granted to eligible old saves`);
  assert.strictEqual(migrationWrites, 1,
    `${skinId} auto-unlock must mark the migrated save for rewrite`);

  migrationWrites = 0;
  const invalidSave = migrationState(charId, 9,
    { [skinId]: true }, { [charId]: skinId });
  StoreMigrationNormalizers.normalizeCollectionState(
    invalidSave, () => { migrationWrites += 1; },
  );
  assert(!invalidSave.ownedSkins[skinId]
    && invalidSave.equippedSkins[charId] === `${charId}_default`,
  `${skinId} must clear ineligible old-save ownership and equipment`);
  assert.strictEqual(migrationWrites, 1,
    `${skinId} cleanup must mark the migrated save for rewrite`);
});

console.log("Character special art tests passed");
