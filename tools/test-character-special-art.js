const assert = require("assert");
const fs = require("fs");

global.window = global;
require("../src/original/data-skins.js");
require("../src/original/skins.js");

// 期望表不再硬编码：直接由 data-skins.js 派生，新增等级立绘无需改动本文件。
// 统一命名/字段校验放在 verifyRegistry 里，保证所有条目口径一致。
const expectedSpecialArt = Object.fromEntries(
  SkinSystem.skins.filter(skin => skin.specialIllustration)
    .map(skin => [skin.id, [skin.charId, skin.art]]));

function verifyRegistry() {
  const specials = SkinSystem.skins.filter(skin => skin.specialIllustration);
  assert(specials.length > 0, "至少要有一条等级特殊立绘登记");
  const seen = new Set();
  specials.forEach(skin => {
    assert(!seen.has(skin.charId), `${skin.charId} 不能重复登记等级立绘`);
    seen.add(skin.charId);
    assert.strictEqual(skin.id, `${skin.charId}_level_${skin.unlockLevel}_special`,
      `${skin.id} 必须遵循 {charId}_level_{N}_special 命名`);
    assert.strictEqual(skin.unlockLevel, 10, `${skin.id} 的解锁等级必须为 10`);
    assert.strictEqual(skin.name, "特殊立绘", `${skin.id} 的名称必须为「特殊立绘」`);
    assert.strictEqual(skin.quality, "special", `${skin.id} 的品质必须为 special`);
    assert.strictEqual(skin.price, 0, `${skin.id} 必须免费（等级自动解锁）`);
    assert(/^\.\/assets\/generated\/[a-z0-9_-]+-level-\d+-special\.[0-9a-f]{8}\.webp$/
      .test(skin.art), `${skin.id} 的美术路径必须统一为 generated 目录下的 hash webp`);
    assert(fs.existsSync(`./publish/${skin.art.slice(2)}`),
      `${skin.id} 的图片必须真实存在`);
    assert(SkinSystem.skins.some(item =>
      item.charId === skin.charId && item.initial),
    `${skin.charId} 缺少默认外观，等级立绘会无处回落`);
  });
}
verifyRegistry();

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
    `${skinId} must be trialable in test battles below level 10`);
  const freshState = {
    chars: [{ id: charId, locked: false, level: 0 }],
    ownedSkins: {}, equippedSkins: {}, testSkins: {}, battle: { test: true },
  };
  assert(SkinSystem.testEquip(freshState, charId, skin.id),
    `${skinId} must be trialable while unowned`);
  assert(!freshState.ownedSkins[skin.id] && !freshState.equippedSkins[charId],
    `${skinId} trial must not grant ownership or equip formally`);
  assert(freshState.testSkins[charId] === skin.id,
    `${skinId} trial must land in testSkins only`);
  assert(state.testSkins[charId] === skin.id,
    `${skinId} trial must land in testSkins only`);
  state.chars[0].level = 10;
  assert(SkinSystem.testEquip(state, charId, skin.id),
    `${skinId} must be trialable in test battles once unlocked`);
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
