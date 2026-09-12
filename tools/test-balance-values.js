const assert = require("assert");

global.window = global;
[
  "economy-config.js",
  "data-characters-core.js",
  "data-characters-extra.js",
  "data-future-characters.js",
  "data-new-characters.js",
  "data-characters.js",
  "character-progression.js",
  "data-future-dungeons.js",
  "data-future-orc-enemies.js",
  "data-bakar-enemy.js",
  "data-future-enemies.js",
  "data-orc-bondi.js",
  "data-guard-kelly.js",
  "data-sakura-risa.js",
  "data-machine-factory-enemies.js",
  "data-underwater-train-enemies.js",
  "data-ruins-sand-city-enemies.js",
  "data-world.js",
].forEach(file => require(`../src/original/${file}`));

const stats = id => GameDataCharacters.find(character => character.id === id)?.stats;
const expectedCharacters = {
  lokar: { attack: 3, magic: 1, speed: 3, maxHp: 36, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
  besta_doll: { attack: 2, magic: 3, speed: 3, maxHp: 28, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  manny: { attack: 3, magic: 3, speed: 4, maxHp: 36, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 3 },
  miller: { attack: 3, magic: 3, speed: 3, maxHp: 40, bloodlust: 1, handLimit: 5, drawPerTurn: 2, initialDraw: 1 },
  nonoka: { attack: 1, magic: 3, speed: 3, maxHp: 34, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  loki: { attack: 3, magic: 1, speed: 3, maxHp: 42, bloodlust: 2, handLimit: 5, drawPerTurn: 2, initialDraw: 1 },
  flora: { attack: 3, magic: 1, speed: 5, maxHp: 28, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 3 },
  wendy: { attack: 1, magic: 3, speed: 4, maxHp: 34, bloodlust: 1, handLimit: 3, drawPerTurn: 1, initialDraw: 2 },
  cadicis: { attack: 3, magic: 3, speed: 3, maxHp: 36, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 1 },
  carlos: { attack: 3, magic: 1, speed: 4, maxHp: 32, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 4 },
  bertis: { attack: 3, magic: 3, speed: 3, maxHp: 38, bloodlust: 1, handLimit: 3, drawPerTurn: 3, initialDraw: 2 },
  gerlot: { attack: 3, magic: 1, speed: 4, maxHp: 34, bloodlust: 2, handLimit: 4, drawPerTurn: 3, initialDraw: 2 },
  angelica: { attack: 3, magic: 1, speed: 3, maxHp: 45, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
  luka: { attack: 3, magic: 1, speed: 4, maxHp: 38, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 1 },
  elrana: { attack: 1, magic: 3, speed: 4, maxHp: 36, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  little_elrana: { attack: 3, magic: 3, speed: 3, maxHp: 32, bloodlust: 1, handLimit: 3, drawPerTurn: 1, initialDraw: 2 },
  ace: { attack: 3, magic: 1, speed: 3, maxHp: 38, bloodlust: 1, handLimit: 5, drawPerTurn: 1, initialDraw: 2 },
  nanali: { attack: 3, magic: 3, speed: 3, maxHp: 32, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
  ophelia: { attack: 1, magic: 4, speed: 3, maxHp: 30, bloodlust: 1, handLimit: 3, drawPerTurn: 3, initialDraw: 2 },
  aileng: { attack: 3, magic: 3, speed: 4, maxHp: 36, bloodlust: 1, handLimit: 5, drawPerTurn: 2, initialDraw: 1 },
  besta: { attack: 2, magic: 4, speed: 2, maxHp: 28, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  sonia: { attack: 3, magic: 3, speed: 4, maxHp: 36, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 2 },
  chiyo: { attack: 2, magic: 1, speed: 5, maxHp: 30, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 1 },
  gerda: { attack: 3, magic: 3, speed: 4, maxHp: 40, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 1 },
  hoshino_yi: { attack: 3, magic: 3, speed: 3, maxHp: 34, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 2 },
  hoshino_kaiichi: { attack: 1, magic: 3, speed: 2, maxHp: 46, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 2 },
  artina: { attack: 3, magic: 3, speed: 4, maxHp: 36, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 2 },
  maria: { attack: 2, magic: 3, speed: 4, maxHp: 38, bloodlust: 2, handLimit: 3, drawPerTurn: 3, initialDraw: 1 },
};
assert.strictEqual(Object.keys(expectedCharacters).length, GameDataCharacters.length,
  "every character needs a complete initial-stat baseline");
Object.entries(expectedCharacters).forEach(([id, expected]) => {
  assert.deepStrictEqual(stats(id), expected, `${id} balance stats changed`);
});
const expectedGrowth = {
  lokar: [100.8, 24.57, 8.19, 14], besta_doll: [75.6, 13.65, 21.84, 10.5],
  manny: [100.8, 21.84, 13.65, 17.5], miller: [134.4, 13.65, 13.65, 14],
  nonoka: [109.2, 8.19, 24.57, 14], loki: [151.2, 21.84, 5.46, 10.5],
  flora: [75.6, 24.57, 8.19, 26.25], wendy: [100.8, 5.46, 21.84, 17.5],
  cadicis: [117.6, 21.84, 10.92, 14], carlos: [92.4, 19.11, 5.46, 22.75],
  bertis: [134.4, 19.11, 19.11, 10.5], gerlot: [109.2, 21.84, 5.46, 19.25],
  angelica: [147, 27.3, 5.46, 10.5], luka: [142.8, 24.57, 5.46, 17.5],
  elrana: [134.4, 8.19, 27.3, 15.75], little_elrana: [109.2, 13.65, 21.84, 14],
  ace: [117.6, 13.65, 8.19, 19.25], nanali: [100.8, 19.11, 8.19, 14],
  ophelia: [100.8, 5.46, 27.3, 17.5], aileng: [117.6, 19.11, 16.38, 21],
  besta: [84, 8.19, 27.3, 7], sonia: [126, 19.11, 10.92, 19.25],
  chiyo: [92.4, 19.11, 5.46, 24.5], gerda: [159.6, 10.92, 19.11, 17.5],
  hoshino_yi: [109.2, 19.11, 19.11, 15.75], hoshino_kaiichi: [184.8, 8.19, 19.11, 10.5],
  artina: [84, 24.57, 8.19, 21], maria: [117.6, 13.65, 16.38, 17.5],
};
assert.strictEqual(Object.keys(expectedGrowth).length, GameDataCharacters.length,
  "every character needs a complete growth baseline");
Object.entries(expectedGrowth).forEach(([id, expected]) => {
  const growth = CharacterProgression.profile(id);
  assert.deepStrictEqual(
    [growth.maxHp, growth.attack, growth.magic, growth.speed],
    expected, `${id} growth balance changed`,
  );
});

const allEnemies = [
  ...GameDataMachineFactoryEnemies,
  ...GameDataUnderwaterTrainEnemies,
  ...GameDataFutureEnemies.orc_dungeon,
];
const enemyStats = id => {
  const enemy = allEnemies.find(item => item.id === id);
  return [
    enemy?.hp, enemy?.attack, enemy?.magic, enemy?.speed,
    enemy?.bloodlust, enemy?.handLimit, enemy?.drawPerTurn, enemy?.initialDraw,
  ];
};
const expectedEnemies = {
  mechanical_goblin: [18, 3, 2, 5, 2, 4, 1, 1],
  machine_succubus: [16, 3, 4, 4, 1, 4, 1, 2],
  skeleton_patrol: [19, 3, 2, 6, 1, 3, 2, 1],
  mecha_minotaur: [26, 4, 2, 4, 3, 5, 1, 2],
  elrana_clone: [68, 4, 5, 6, 3, 3, 2, 3],
  krow_doctor: [68, 3, 5, 6, 2, 4, 2, 4],
  invader_chiyo: [78, 4, 4, 8, 2, 5, 3, 1],
  mechanical_bull_king: [100, 5, 3, 6, 2, 6, 3, 2],
  pursuer_edis: [180, 3, 2, 7, 2, 5, 2, 1],
  terror_slime: [36, 6, 5, 11, 1, 4, 2, 2],
  shark_pirate_crew: [36, 6, 4, 11, 1, 4, 1, 2],
  shark_pirate_raider: [44, 7, 4, 13, 2, 4, 2, 1],
  shark_pirate_submarine: [64, 6, 5, 8, 2, 5, 3, 2],
  raff_assassin: [120, 6, 6, 14, 2, 3, 2, 1],
  abe_mike: [132, 6, 5, 12, 1, 4, 2, 1],
  shark_captain_mordio: [280, 8, 5, 11, 1, 6, 3, 2],
  mona_eagle_captain: [285, 6, 6, 12, 3, 5, 2, 2],
  suicide_drone: [32, 9, 7, 17, 2, 3, 3, 1],
  demon_beast_unit: [48, 8, 6, 13, 1, 4, 1, 2],
  demon_witch: [30, 5, 11, 14, 1, 3, 2, 2],
  demon_mecha_cerberus: [72, 8, 7, 14, 1, 4, 1, 2],
  witherer_1124_split: [165, 9, 8, 15, 1, 4, 1, 1],
  orc_king_bondi: [220, 10, 5, 12, 1, 4, 2, 1],
  guard_kelly: [210, 8, 8, 14, 1, 4, 3, 2],
  assassin_sakura_risa: [190, 9, 7, 17, 2, 3, 2, 3],
  xx_witherer_1124: [350, 10, 11, 17, 1, 4, 3, 2],
  demon_king_bakaar: [330, 11, 7, 13, 2, 4, 2, 2],
};
assert.strictEqual(allEnemies.length, 27, "balance baseline must cover every canonical enemy");
assert.strictEqual(Object.keys(expectedEnemies).length, allEnemies.length, "every enemy needs a complete stat baseline");
assert(
  allEnemies.every(enemy => enemy.attack > 0 && enemy.magic > 0),
  "every canonical enemy must have positive attack and magic",
);
Object.entries(expectedEnemies).forEach(([id, expected]) => {
  assert.deepStrictEqual(enemyStats(id), expected, `${id} balance stats changed`);
});
assert(Math.max(...GameDataMachineFactoryEnemies.map(enemy => enemy.speed)) <= 8,
  "machine factory must retain its early-game turn-order profile");
assert(Math.min(...GameDataUnderwaterTrainEnemies.map(enemy => enemy.speed)) >= 8,
  "underwater train must remain faster than the onboarding dungeon");
assert(Math.max(...GameDataFutureEnemies.orc_dungeon.map(enemy => enemy.speed)) <= 17,
  "orc dungeon speed must remain aligned with level-15 character growth");
const averageHp = group => group.reduce((sum, enemy) => sum + enemy.hp, 0) / group.length;
assert(averageHp(GameDataMachineFactoryEnemies)
  < averageHp(GameDataUnderwaterTrainEnemies)
  && averageHp(GameDataUnderwaterTrainEnemies)
  < averageHp(GameDataFutureEnemies.orc_dungeon),
  "enemy durability must preserve dungeon progression");
const littleElrana = GameDataCharacters.find(character => character.id === "little_elrana");
const elranaClone = allEnemies.find(enemy => enemy.id === "elrana_clone");
assert.strictEqual(
  littleElrana?.skills.find(skill => skill.name === "毒针")?.icon,
  "⭐",
  "little Elrana poison needle should use the locked-skill star icon",
);
assert.strictEqual(
  elranaClone?.skills.find(skill => skill.name === "毒针")?.icon,
  "⭐",
  "Elrana clone poison needle should use the locked-skill star icon",
);

assert.deepStrictEqual(GameDataWorld.statDefs.map(([id, name]) => [id, name]), [
  ["attack", "攻击力"], ["magic", "魔力"], ["speed", "速度"],
  ["maxHp", "生命值"], ["bloodlust", "杀意上限"],
  ["handLimit", "手牌上限"], ["drawPerTurn", "每回合摸牌"],
  ["initialDraw", "初始摸牌"],
]);
assert.deepStrictEqual(GameEconomy.dungeonGold, {
  normal: [90, 130], elite: 280, boss: 500, chest: 220,
});
assert.strictEqual(GameEconomy.shop.deleteCost, 700);
assert.strictEqual(GameEconomy.relic.smeltGold, 180);

const difficulties = Object.values(GameDataWorld.difficulties);
assert.deepStrictEqual(difficulties.map(item => item.reward), [1, 1.35, 1.75, 2.2, 2.75]);
assert.deepStrictEqual(difficulties.map(item => item.xp), [1, 1.15, 1.35, 1.6, 1.9]);
assert.deepStrictEqual(difficulties.map(item => item.enemy.normal.hp), [1, 1.35, 1.75, 2.3, 3.2]);
assert.deepStrictEqual(difficulties.map(item => item.enemy.normal.power), [1, 1.1, 1.22, 1.36, 1.52]);
assert.deepStrictEqual(difficulties.map(item => item.enemy.normal.speed), [1, 1.06, 1.12, 1.19, 1.27]);
difficulties.forEach(difficulty => {
  allEnemies.forEach(enemy => {
    const scaled = GameDataWorld.scaleEnemyStats(enemy, difficulty, enemy.type);
    assert.strictEqual(scaled.attack, Math.round(enemy.attack * difficulty.enemy[enemy.type].power),
      `${enemy.id} ${difficulty.name} attack scaling mismatch`);
    assert.strictEqual(scaled.magic, Math.round(enemy.magic * difficulty.enemy[enemy.type].power),
      `${enemy.id} ${difficulty.name} magic scaling mismatch`);
    assert.strictEqual(scaled.speed, Math.round(enemy.speed * difficulty.enemy[enemy.type].speed),
      `${enemy.id} ${difficulty.name} speed scaling mismatch`);
  });
});
console.log("Balance values passed: characters, enemies, difficulty, and economy");
