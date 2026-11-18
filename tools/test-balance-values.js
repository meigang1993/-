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
  lokar: { attack: 10, magic: 5, speed: 11, maxHp: 124, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
  besta_doll: { attack: 7, magic: 10, speed: 11, maxHp: 96, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  manny: { attack: 10, magic: 10, speed: 13, maxHp: 124, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 3 },
  miller: { attack: 10, magic: 10, speed: 11, maxHp: 138, bloodlust: 1, handLimit: 5, drawPerTurn: 2, initialDraw: 1 },
  nonoka: { attack: 5, magic: 10, speed: 11, maxHp: 118, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  loki: { attack: 10, magic: 5, speed: 11, maxHp: 144, bloodlust: 2, handLimit: 5, drawPerTurn: 2, initialDraw: 1 },
  flora: { attack: 10, magic: 5, speed: 16, maxHp: 96, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 3 },
  wendy: { attack: 5, magic: 10, speed: 13, maxHp: 118, bloodlust: 1, handLimit: 3, drawPerTurn: 1, initialDraw: 2 },
  cadicis: { attack: 10, magic: 10, speed: 11, maxHp: 124, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 1 },
  carlos: { attack: 10, magic: 5, speed: 13, maxHp: 110, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 4 },
  bertis: { attack: 10, magic: 10, speed: 11, maxHp: 130, bloodlust: 1, handLimit: 3, drawPerTurn: 3, initialDraw: 2 },
  gerlot: { attack: 10, magic: 5, speed: 13, maxHp: 118, bloodlust: 2, handLimit: 4, drawPerTurn: 3, initialDraw: 2 },
  angelica: { attack: 10, magic: 5, speed: 11, maxHp: 154, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
  luka: { attack: 10, magic: 5, speed: 13, maxHp: 130, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 1 },
  elrana: { attack: 5, magic: 10, speed: 13, maxHp: 124, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  little_elrana: { attack: 10, magic: 10, speed: 11, maxHp: 110, bloodlust: 1, handLimit: 3, drawPerTurn: 1, initialDraw: 2 },
  ace: { attack: 10, magic: 5, speed: 11, maxHp: 130, bloodlust: 1, handLimit: 5, drawPerTurn: 1, initialDraw: 2 },
  nanali: { attack: 10, magic: 10, speed: 11, maxHp: 110, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
  ophelia: { attack: 5, magic: 12, speed: 11, maxHp: 104, bloodlust: 1, handLimit: 3, drawPerTurn: 3, initialDraw: 2 },
  aileng: { attack: 10, magic: 10, speed: 13, maxHp: 124, bloodlust: 1, handLimit: 5, drawPerTurn: 2, initialDraw: 1 },
  besta: { attack: 7, magic: 12, speed: 9, maxHp: 96, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  catherine: { attack: 5, magic: 10, speed: 9, maxHp: 96, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  hitwell: { attack: 10, magic: 10, speed: 13, maxHp: 118, bloodlust: 2, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
  gerda: { attack: 10, magic: 10, speed: 13, maxHp: 138, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 1 },
  hoshino_yi: { attack: 10, magic: 10, speed: 11, maxHp: 118, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 2 },
  hoshino_kaiichi: { attack: 5, magic: 10, speed: 9, maxHp: 158, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 2 },
  artina: { attack: 10, magic: 7, speed: 13, maxHp: 124, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 2 },
  maria: { attack: 10, magic: 10, speed: 13, maxHp: 130, bloodlust: 2, handLimit: 3, drawPerTurn: 3, initialDraw: 1 },
  sonia: { attack: 10, magic: 10, speed: 13, maxHp: 124, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 2 },
  chiyo: { attack: 7, magic: 5, speed: 16, maxHp: 104, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 1 },
  // 普雷希（第 31 名）：0 级生命 112（翻倍前 56）、杀意 1、手牌上限 4；摸牌为「基础 2+1」「初始 4+1」，
  // 与其余角色同口径，基础表内仍记 drawPerTurn 1 / initialDraw 1。
  preshi: { attack: 10, magic: 10, speed: 11, maxHp: 112, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 1 },
  // 米尔尤拉（第 32 名）：0 级生命 104（翻倍前 52）、魔力 4（翻倍前 2）；高阶成长表落在统一档位网格上。
  mieryula: { attack: 8, magic: 4, speed: 10, maxHp: 104, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  // 安倍卡露娜（第 33 名）：0 级生命 100、攻击 4、魔力 8、速度 6（均为翻倍后）；摸牌为「基础 2+1」「初始 4+1」，
  // 与其余角色同口径，基础表内仍记 drawPerTurn 1 / initialDraw 1。
  abe_karuna: { attack: 4, magic: 8, speed: 6, maxHp: 100, bloodlust: 1, handLimit: 3, drawPerTurn: 1, initialDraw: 1 },
  // 怪面诺亚（第 34 名）：0 级攻击 6 / 魔力 4 / 速度 8 / 生命 130（均为翻倍后）；摸牌为「基础 2+1」「初始 4+1」。
  noa: { attack: 6, magic: 4, speed: 8, maxHp: 130, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 1 },
};
assert.strictEqual(Object.keys(expectedCharacters).length, GameDataCharacters.length,
  "every character needs a complete initial-stat baseline");
Object.entries(expectedCharacters).forEach(([id, expected]) => {
  assert.deepStrictEqual(stats(id), expected, `${id} balance stats changed`);
});
const expectedGrowth = {
  lokar: [280, 67, 25, 29], besta_doll: [210, 37, 65, 22], manny: [280, 60, 41, 36],
  // 洛基与卡迪西斯在 10-10 版随【护母心切】【战场指挥官】一并删除而重分配满级成长
  // （两人定位统一改为输出：攻击均提升，卡迪西斯魔力下调，洛基体力下调、速度提升），
  // 详见 update-notice-recent.js 10月10日公告。此表须与该公告口径保持一致。
  miller: [374, 37, 41, 29], nonoka: [304, 22, 73, 29], loki: [397, 75, 16, 33],
  flora: [210, 67, 25, 55], wendy: [280, 15, 65, 36], cadicis: [327, 75, 16, 33],
  carlos: [257, 52, 16, 47], bertis: [374, 52, 57, 22], gerlot: [304, 60, 16, 40],
  angelica: [409, 75, 16, 22], luka: [397, 67, 16, 36], elrana: [374, 22, 82, 33],
  little_elrana: [304, 37, 65, 29], ace: [327, 37, 25, 40], nanali: [257, 67, 25, 33],
  ophelia: [280, 15, 82, 36], aileng: [327, 52, 49, 44], besta: [234, 22, 82, 15],
  catherine: [234, 15, 65, 15], hitwell: [280, 37, 65, 36], gerda: [444, 30, 57, 36],
  hoshino_yi: [304, 52, 57, 33], hoshino_kaiichi: [514, 22, 57, 22], artina: [234, 67, 25, 44],
  maria: [327, 45, 49, 36], sonia: [351, 52, 33, 40], chiyo: [257, 52, 16, 51],
  preshi: [257, 37, 65, 29], mieryula: [397, 82, 41, 80],
  abe_karuna: [234, 15, 73, 44],
  // 第 34 名：攻击 11 档（41）为全表最高攻击成长，明确输出倾向。
  noa: [327, 82, 25, 44],
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
// 结构性护栏：成长表原本由统一档位生成，现已全部四舍五入为整数。
// 仍要求每个值落在原档位网格上（允许 ±0.5 取整误差 / 最小档位 3.648 ≈ 0.137 的 tier 偏差），
// 能捕获手改、复制粘贴或串行写入导致的错值，同时不随整数化腐坏。
const growthGrid = { maxHp: 11.684, attack: 7.491, magic: 8.163, speed: 3.648 };
Object.entries(CharacterProgression.growth).forEach(([id, growth]) => {
  Object.entries(growthGrid).forEach(([key, unit]) => {
    const tier = growth[key] / unit;
    assert.ok(Number.isInteger(growth[key]),
      `${id} 的 ${key} 成长必须为整数（全部属性取整口径），实际 ${growth[key]}`);
    assert.ok(
      Math.abs(tier - Math.round(tier)) < 0.15,
      `${id} 的 ${key} 成长 ${growth[key]} 不在档位网格上（档位 ${tier.toFixed(3)} 非整数）`,
    );
  });
});

const allEnemies = [
  ...GameDataMachineFactoryEnemies,
  ...GameDataUnderwaterTrainEnemies,
  ...GameDataFutureEnemies.orc_dungeon,
  ...GameDataRuinsSandCityEnemies,
];
const enemyStats = id => {
  const enemy = allEnemies.find(item => item.id === id);
  return [
    enemy?.hp, enemy?.attack, enemy?.magic, enemy?.speed,
    enemy?.bloodlust, enemy?.handLimit, enemy?.drawPerTurn, enemy?.initialDraw,
  ];
};
const expectedEnemies = {
  mechanical_goblin: [40, 8, 6, 12, 2, 4, 1, 1],
  machine_succubus: [36, 8, 10, 10, 1, 4, 1, 2],
  skeleton_patrol: [42, 8, 6, 14, 1, 3, 2, 1],
  mecha_minotaur: [60, 10, 6, 10, 3, 5, 1, 2],
  elrana_clone: [180, 14, 16, 18, 3, 3, 2, 3],
  krow_doctor: [180, 12, 16, 18, 2, 4, 2, 4],
  invader_chiyo: [200, 14, 14, 22, 2, 5, 3, 1],
  mechanical_bull_king: [270, 16, 12, 18, 2, 6, 3, 2],
  pursuer_edis: [440, 12, 10, 20, 2, 5, 2, 1],
  terror_slime: [88, 14, 12, 24, 1, 4, 2, 2],
  shark_pirate_crew: [88, 14, 10, 24, 1, 4, 1, 2],
  shark_pirate_raider: [104, 16, 10, 28, 2, 4, 2, 1],
  shark_pirate_submarine: [144, 14, 12, 18, 2, 5, 3, 2],
  raff_assassin: [300, 16, 16, 30, 2, 3, 2, 1],
  abe_mike: [320, 16, 14, 28, 1, 4, 2, 1],
  shark_captain_mordio: [660, 20, 14, 26, 1, 6, 3, 2],
  mona_eagle_captain: [670, 16, 16, 28, 3, 5, 2, 2],
  suicide_drone: [72, 20, 16, 34, 2, 3, 3, 1],
  demon_beast_unit: [108, 18, 14, 26, 1, 4, 1, 2],
  demon_witch: [68, 12, 26, 30, 1, 3, 2, 2],
  demon_mecha_cerberus: [156, 18, 16, 30, 1, 4, 1, 2],
  witherer_1124_split: [380, 22, 20, 32, 1, 4, 1, 1],
  orc_king_bondi: [470, 22, 12, 26, 1, 4, 2, 1],
  guard_kelly: [450, 18, 20, 30, 1, 4, 3, 2],
  assassin_sakura_risa: [410, 20, 16, 34, 2, 3, 2, 3],
  xx_witherer_1124: [800, 24, 26, 34, 1, 4, 3, 2],
  demon_king_bakaar: [760, 26, 18, 28, 2, 4, 2, 2],
  noble_soldier: [136, 20, 16, 30, 1, 4, 2, 2],
  noble_sniper: [120, 22, 16, 36, 1, 4, 1, 1],
  merca_tank: [184, 20, 20, 28, 1, 4, 2, 2],
  attack_drone: [104, 20, 20, 40, 1, 3, 2, 1],
  hilde: [520, 26, 24, 34, 2, 3, 2, 1],
  attack_helicopter: [480, 22, 20, 28, 1, 5, 3, 2],
  armored_carrier: [500, 24, 16, 32, 1, 4, 2, 1],
  mech_ai_dragon: [860, 32, 22, 34, 1, 4, 2, 1],
  witherer_1312: [900, 30, 28, 32, 2, 3, 3, 2],
};
assert.strictEqual(allEnemies.length, 36, "balance baseline must cover every canonical enemy");
assert.strictEqual(Object.keys(expectedEnemies).length, allEnemies.length, "every enemy needs a complete stat baseline");
assert(
  allEnemies.every(enemy => enemy.attack > 0 && enemy.magic > 0),
  "every canonical enemy must have positive attack and magic",
);
Object.entries(expectedEnemies).forEach(([id, expected]) => {
  assert.deepStrictEqual(enemyStats(id), expected, `${id} balance stats changed`);
});
// 四副本 × 五难度的平均实际属性目标表（2026-11-09 全属性翻倍 + 线性难度倍率重定后重算）
// 旧条件「机械工厂速度不超过 8 / 兽人速度不超过 17」是按旧速度倍率标定的，
// 四档倍率改为四项属性统一 +50%/+100%/+150%/+200% 后，改为直接锁定缩放后的平均属性。
(() => {
  const average = (list, key) => list.reduce((sum, item) => sum + item[key], 0) / list.length;
  const difficulties = Object.values(GameDataWorld.difficulties);
  // 基线重定：怪物基础属性翻倍，四档难度改为四项属性统一倍率；普通级均值也随之翻倍。
  const targets = {
    魔国机械工厂: [GameDataMachineFactoryEnemies, [
      [161, 11, 11, 16],
      [241, 17, 16, 24],
      [322, 23, 21, 32],
      [402, 28, 27, 39],
      [483, 34, 32, 47],
    ]],
    水下列车: [GameDataUnderwaterTrainEnemies, [
      [297, 16, 13, 26],
      [445, 24, 20, 39],
      [594, 32, 26, 52],
      [742, 39, 33, 64],
      [890, 47, 39, 77],
    ]],
    兽人地下城: [GameDataFutureEnemies.orc_dungeon, [
      [367, 20, 18, 30],
      [551, 30, 28, 46],
      [735, 40, 37, 61],
      [919, 50, 46, 76],
      [1102, 60, 55, 91],
    ]],
    废墟沙城: [GameDataRuinsSandCityEnemies, [
      [423, 24, 20, 33],
      [634, 36, 30, 49],
      [845, 48, 40, 65],
      [1057, 60, 51, 82],
      [1268, 72, 61, 98],
    ]],

  };
  const keys = ["hp", "attack", "magic", "speed"];
  Object.entries(targets).forEach(([dungeon, [list, rows]]) => {
    assert.ok(list.length > 0, `${dungeon} 敌人群为空`);
    rows.forEach((row, index) => {
      const difficulty = difficulties[index];
      const scaled = list.map(enemy => GameDataWorld.scaleEnemyStats(enemy, difficulty, enemy.type));
      row.forEach((expected, k) => {
        const actual = average(scaled, keys[k]);
        // 允许 1 点舍入差（均值取整方式不同）
        assert.ok(Math.abs(actual - expected) <= 1,
          `${dungeon} ${difficulty.name} 平均${keys[k]} 应为 ${expected}±1，实际 ${actual.toFixed(1)}`);
      });
    });
  });
  // 结构性护栏：用倍率比值锁定「冒险/勇士/王者/英雄 = 四项属性 +50%/+100%/+150%/+200%」这一设计意图。
  // 以相对比值表达，敌人个体数值调整时不会腐坏，只在难度倍率被改动时才报错。
  const hpRatios = [1.5, 2, 2.5, 3];
  Object.entries(targets).forEach(([dungeon, [list]]) => {
    const scaledHp = index => average(
      list.map(enemy => GameDataWorld.scaleEnemyStats(enemy, difficulties[index], enemy.type)), "hp",
    );
    const base = scaledHp(0);
    hpRatios.forEach((expected, i) => {
      const ratio = scaledHp(i + 1) / base;
      assert.ok(Math.abs(ratio - expected) <= 0.03,
        `${dungeon} ${difficulties[i + 1].name} 生命倍率 ${ratio.toFixed(3)} 与预期 ${expected} 不符`);
    });
  });
  // 副本间强度递进：平均 HP 逐副本递增
  const baseHp = Object.entries(targets).map(([, [list]]) => average(list, "hp"));
  assert.ok(baseHp.every((v, i) => i === 0 || v > baseHp[i - 1]),
    `副本平均生命未递进: ${baseHp.map(v => v.toFixed(1)).join("→")}`);
  // 先手压力：水下列车英雄级平均速度不低于 20 级角色速度（47.12）的 90%
  const trainHell = average(
    GameDataUnderwaterTrainEnemies.map(enemy => GameDataWorld.scaleEnemyStats(enemy, difficulties[4], enemy.type)),
    "speed",
  );
  assert.ok(trainHell >= 47.12 * 0.9,
    `水下列车英雄级平均速度 ${trainHell.toFixed(1)} 未形成先手压力（20 级角色 47.12）`);
})();
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
  normal: [63, 91], elite: 196, boss: 350, chest: 154,
});
assert.strictEqual(GameEconomy.shop.deleteCost, 700);
assert.strictEqual(GameEconomy.relic.smeltGold, 180);

const difficulties = Object.values(GameDataWorld.difficulties);
assert.deepStrictEqual(difficulties.map(item => item.reward), [100, 135, 175, 220, 275]);
assert.deepStrictEqual(difficulties.map(item => item.xp), [100, 115, 135, 160, 190]);
// 难度倍率按四项属性统一加成重定：普通 100%，四档依次为 150/200/250/300（+50 个百分点逐档）。
assert.deepStrictEqual(difficulties.map(item => item.enemy.normal.hp), [100, 150, 200, 250, 300]);
assert.deepStrictEqual(difficulties.map(item => item.enemy.normal.power), [100, 150, 200, 250, 300]);
assert.deepStrictEqual(difficulties.map(item => item.enemy.normal.speed), [100, 150, 200, 250, 300]);

// 难度倍率严格递增（生命 / 输出 / 速度），XP 维持原表
(() => {
  const hp = difficulties.map(item => item.enemy.normal.hp);
  const power = difficulties.map(item => item.enemy.normal.power);
  const speed = difficulties.map(item => item.enemy.normal.speed);
  const strictlyUp = list => list.every((v, i) => i === 0 || v > list[i - 1]);
  assert.ok(strictlyUp(hp), `难度生命倍率未严格递增: ${hp.join("→")}`);
  assert.ok(strictlyUp(power), `难度输出倍率未严格递增: ${power.join("→")}`);
  assert.ok(strictlyUp(speed), `难度速度倍率未严格递增: ${speed.join("→")}`);
  assert.strictEqual(difficulties[4].enemy.normal.speed, 300,
    `英雄级速度倍率应为 300，实际 ${difficulties[4].enemy.normal.speed}`);
  assert.deepStrictEqual(difficulties.map(item => item.xp), [100, 115, 135, 160, 190]);
  // elite / boss 与 normal 同倍率，避免只改了普通档导致精英不跟随
  ["elite", "boss"].forEach(kind => {
    assert.deepStrictEqual(difficulties.map(item => item.enemy[kind].hp), hp,
      `${kind} 生命倍率与 normal 不一致`);
    assert.deepStrictEqual(difficulties.map(item => item.enemy[kind].power), power,
      `${kind} 输出倍率与 normal 不一致`);
  });
})();

// attrText 与倍率一致（界面展示不得停留在旧倍率）
(() => {
  const expected = [
    ["冒险级", "生命150%/输出150%/速度150%"],
    ["勇士级", "生命200%/输出200%/速度200%"],
    ["王者级", "生命250%/输出250%/速度250%"],
    ["英雄级", "生命300%/输出300%/速度300%/精英与BOSS携带掉落饰品技能"],
  ];
  expected.forEach(([name, text]) => {
    const d = difficulties.find(item => item.name === name);
    assert.strictEqual(d.attrText, text, `${name} attrText 为「${d.attrText}」，应为「${text}」`);
  });
  assert.strictEqual(difficulties[0].attrText, "基础", "普通级 attrText 应为「基础」");
})();

// 0～20 级角色成长数据快照（随副本数值重平衡同步更新）
(() => {
  const crypto = require("crypto");
  const progression = window.CharacterProgression;
  assert.ok(progression?.statsAt, "未取到 CharacterProgression.statsAt，快照失效");
  assert.strictEqual(progression.maxLevel, 20, "满级应为 20");
  assert.strictEqual(progression.expToNext.reduce((a, b) => a + b, 0), 47710,
    "升级经验总需求被改动");
  const rows = GameDataCharacters.map(character => {
    const levels = [];
    for (let level = 0; level <= progression.maxLevel; level += 1) {
      const s = progression.statsAt(character, level);
      levels.push([s.maxHp, s.attack, s.magic, s.speed].join("/"));
    }
    return `${character.id}|${levels.join(",")}`;
  }).sort();
  const digest = crypto.createHash("sha256").update(rows.join("\n")).digest("hex");
  // 摘要变更记录：10-10 洛基/卡迪西斯满级成长重分配、10-14 新增第 31 名角色普雷希、
  // 10-25 补第 32 名米尔尤拉与第 33 名安倍卡露娜的 0～20 级成长快照、
  // 10-25 米尔尤拉成长表改回统一档位网格（198.63/41.2/20.41/40.13）、
  // 10-26 安倍卡露娜速度成长由 4 档（7.3）上调至 12 档（21.89，满级速度 24.89）、
  // 11-09 新增第 34 名怪面诺亚并补齐专属成长表（输出倾向：攻击 11 档 41.2）。
  // 11-09 全角色初始属性与成长、全怪物基础属性统一翻倍，成长档位单位同步翻倍。
  // 11-17 全部角色与怪物属性统一四舍五入取整，成长快照、生命/输出比与先手阈值同步重定。
  // 11-18 四档难度改为四项属性统一倍率、副本节点金币统一下调 30%，均值表与金币基线同步重定。
  assert.strictEqual(digest,
    "d7a08d4e858f7de74dd1d40e5d530a4f797bd665cbff408722883259ec0e4c28",
    "0～20 级角色成长数据被改动（快照不匹配，若有意调整请更新摘要）");
  const lokar = GameDataCharacters.find(character => character.id === "lokar");
  assert.deepStrictEqual(
    [progression.statsAt(lokar, 0).maxHp, progression.statsAt(lokar, 20).maxHp],
    [124, 404],
    "罗卡尔 0/20 级生命与预期不符",
  );
})();

// 生命/输出比例：重平衡把攻击抬到约 1.4～1.77 倍、魔力约 1.53～1.77 倍，
// 生命若只按敌人生命涨幅（约 1.18 倍）走，角色内部比例会失衡。
// 锁定「平均生命 ÷ 平均(攻击+魔力)/2」回到调整前的水平，防止生命再次掉队。
(() => {
  const progression = window.CharacterProgression;
  const ratio = level => {
    let hp = 0; let power = 0;
    GameDataCharacters.forEach(character => {
      const s = progression.statsAt(character, level);
      hp += s.maxHp;
      power += (s.attack + s.magic) / 2;
    });
    return hp / power;
  };
  // 调整前（HEAD）实测的 0/5/10/15/20 级比例，重平衡后应回到同一水平（±0.4 容差）
  const baseline = { 0: 14.28, 5: 9.98, 10: 8.74, 15: 8.26, 20: 7.97 };
  Object.entries(baseline).forEach(([level, expected]) => {
    const value = ratio(Number(level));
    assert.ok(Math.abs(value - expected) <= 0.4,
      `${level} 级生命/输出比 ${value.toFixed(2)} 偏离调整前 ${expected}±0.4（生命与输出失衡）`);
  });
  assert.ok(ratio(20) < ratio(0), "生命/输出比应随等级下降（输出成长快于生命）");
})();
difficulties.forEach(difficulty => {
  allEnemies.forEach(enemy => {
    const scaled = GameDataWorld.scaleEnemyStats(enemy, difficulty, enemy.type);
    assert.strictEqual(scaled.attack, Math.round(enemy.attack * difficulty.enemy[enemy.type].power / 100),
      `${enemy.id} ${difficulty.name} attack scaling mismatch`);
    assert.strictEqual(scaled.magic, Math.round(enemy.magic * difficulty.enemy[enemy.type].power / 100),
      `${enemy.id} ${difficulty.name} magic scaling mismatch`);
    assert.strictEqual(scaled.speed, Math.round(enemy.speed * difficulty.enemy[enemy.type].speed / 100),
      `${enemy.id} ${difficulty.name} speed scaling mismatch`);
  });
});
console.log("Balance values passed: characters, enemies, difficulty, and economy");
