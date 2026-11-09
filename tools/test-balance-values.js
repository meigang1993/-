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
  lokar: { attack: 9.6, magic: 5.0, speed: 11.0, maxHp: 124, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
  besta_doll: { attack: 7.2, magic: 10, speed: 11.0, maxHp: 96, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  manny: { attack: 9.6, magic: 10, speed: 13.4, maxHp: 124, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 3 },
  miller: { attack: 9.6, magic: 10, speed: 11.0, maxHp: 138, bloodlust: 1, handLimit: 5, drawPerTurn: 2, initialDraw: 1 },
  nonoka: { attack: 4.8, magic: 10, speed: 11.0, maxHp: 118, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  loki: { attack: 9.6, magic: 5.0, speed: 11.0, maxHp: 144, bloodlust: 2, handLimit: 5, drawPerTurn: 2, initialDraw: 1 },
  flora: { attack: 9.6, magic: 5.0, speed: 15.6, maxHp: 96, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 3 },
  wendy: { attack: 4.8, magic: 10, speed: 13.4, maxHp: 118, bloodlust: 1, handLimit: 3, drawPerTurn: 1, initialDraw: 2 },
  cadicis: { attack: 9.6, magic: 10, speed: 11.0, maxHp: 124, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 1 },
  carlos: { attack: 9.6, magic: 5.0, speed: 13.4, maxHp: 110, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 4 },
  bertis: { attack: 9.6, magic: 10, speed: 11.0, maxHp: 130, bloodlust: 1, handLimit: 3, drawPerTurn: 3, initialDraw: 2 },
  gerlot: { attack: 9.6, magic: 5.0, speed: 13.4, maxHp: 118, bloodlust: 2, handLimit: 4, drawPerTurn: 3, initialDraw: 2 },
  angelica: { attack: 9.6, magic: 5.0, speed: 11.0, maxHp: 154, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
  luka: { attack: 9.6, magic: 5.0, speed: 13.4, maxHp: 130, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 1 },
  elrana: { attack: 4.8, magic: 10, speed: 13.4, maxHp: 124, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  little_elrana: { attack: 9.6, magic: 10, speed: 11.0, maxHp: 110, bloodlust: 1, handLimit: 3, drawPerTurn: 1, initialDraw: 2 },
  ace: { attack: 9.6, magic: 5.0, speed: 11.0, maxHp: 130, bloodlust: 1, handLimit: 5, drawPerTurn: 1, initialDraw: 2 },
  nanali: { attack: 9.6, magic: 10, speed: 11.0, maxHp: 110, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
  ophelia: { attack: 4.8, magic: 12.4, speed: 11.0, maxHp: 104, bloodlust: 1, handLimit: 3, drawPerTurn: 3, initialDraw: 2 },
  aileng: { attack: 9.6, magic: 10, speed: 13.4, maxHp: 124, bloodlust: 1, handLimit: 5, drawPerTurn: 2, initialDraw: 1 },
  besta: { attack: 7.2, magic: 12.4, speed: 8.8, maxHp: 96, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  catherine: { attack: 4.8, magic: 10, speed: 8.8, maxHp: 96, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  hitwell: { attack: 9.6, magic: 10, speed: 13.4, maxHp: 118, bloodlust: 2, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
  gerda: { attack: 9.6, magic: 10, speed: 13.4, maxHp: 138, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 1 },
  hoshino_yi: { attack: 9.6, magic: 10, speed: 11.0, maxHp: 118, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 2 },
  hoshino_kaiichi: { attack: 4.8, magic: 10, speed: 8.8, maxHp: 158, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 2 },
  artina: { attack: 9.6, magic: 7.4, speed: 13.4, maxHp: 124, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 2 },
  maria: { attack: 9.6, magic: 10, speed: 13.4, maxHp: 130, bloodlust: 2, handLimit: 3, drawPerTurn: 3, initialDraw: 1 },
  sonia: { attack: 9.6, magic: 10, speed: 13.4, maxHp: 124, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 2 },
  chiyo: { attack: 7.2, magic: 5.0, speed: 15.6, maxHp: 104, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 1 },
  // 普雷希（第 31 名）：0 级生命 112（翻倍前 56）、杀意 1、手牌上限 4；摸牌为「基础 2+1」「初始 4+1」，
  // 与其余角色同口径，基础表内仍记 drawPerTurn 1 / initialDraw 1。
  preshi: { attack: 9.6, magic: 10, speed: 11.0, maxHp: 112, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 1 },
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
  lokar: [280.42, 67.42, 24.50, 29.18], besta_doll: [210.32, 37.46, 65.32, 21.90], manny: [280.42, 59.94, 40.82, 36.48],
  // 洛基与卡迪西斯在 10-10 版随【护母心切】【战场指挥官】一并删除而重分配满级成长
  // （两人定位统一改为输出：攻击均提升，卡迪西斯魔力下调，洛基体力下调、速度提升），
  // 详见 update-notice-recent.js 10月10日公告。此表须与该公告口径保持一致。
  miller: [373.90, 37.46, 40.82, 29.18], nonoka: [303.80, 22.48, 73.46, 29.18], loki: [397.26, 74.90, 16.32, 32.82],
  flora: [210.32, 67.42, 24.50, 54.72], wendy: [280.42, 14.98, 65.32, 36.48], cadicis: [327.16, 74.90, 16.32, 32.82],
  carlos: [257.06, 52.44, 16.32, 47.42], bertis: [373.90, 52.44, 57.14, 21.90], gerlot: [303.80, 59.94, 16.32, 40.12],
  angelica: [408.96, 74.90, 16.32, 21.90], luka: [397.26, 67.42, 16.32, 36.48], elrana: [373.90, 22.48, 81.64, 32.82],
  little_elrana: [303.80, 37.46, 65.32, 29.18], ace: [327.16, 37.46, 24.50, 40.12], nanali: [257.06, 67.42, 24.50, 32.82],
  ophelia: [280.42, 14.98, 81.64, 36.48], aileng: [327.16, 52.44, 49.0, 43.78], besta: [233.68, 22.48, 81.64, 14.6],
  catherine: [233.68, 14.98, 65.32, 14.6], hitwell: [280.42, 37.46, 65.32, 36.48], gerda: [444.00, 29.96, 57.14, 36.48],
  hoshino_yi: [303.80, 52.44, 57.14, 32.82], hoshino_kaiichi: [514.12, 22.48, 57.14, 21.90], artina: [233.68, 67.42, 24.50, 43.78],
  maria: [327.16, 44.96, 49.0, 36.48], sonia: [350.54, 52.44, 32.64, 40.12], chiyo: [257.06, 52.44, 16.32, 51.08],
  preshi: [257.06, 37.46, 65.32, 29.18], mieryula: [397.26, 82.4, 40.82, 80.26],
  abe_karuna: [233.68, 14.98, 73.46, 43.78],
  // 第 34 名：攻击 11 档（41.2）为全表最高攻击成长，明确输出倾向。
  noa: [327.16, 82.4, 24.50, 43.78],
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
// 结构性护栏：成长表由统一档位生成，每个值都必须是档位单位的整数倍。
// 这条不锁定具体数值，因此不会随平衡调整而腐坏；但能捕获手改、复制粘贴或串行写入导致的错值。
const growthGrid = { maxHp: 11.684, attack: 7.491, magic: 8.163, speed: 3.648 };
Object.entries(CharacterProgression.growth).forEach(([id, growth]) => {
  Object.entries(growthGrid).forEach(([key, unit]) => {
    const tier = growth[key] / unit;
    assert.ok(
      Math.abs(tier - Math.round(tier)) < 0.02,
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
// 旧条件「机械工厂速度不超过 8 / 兽人速度不超过 17」是按 1.06～1.27 的旧速度倍率标定的，
// 速度倍率提高到 1.12～1.58 后已无法表达先手压力的设计意图，改为直接锁定缩放后的平均属性。
(() => {
  const average = (list, key) => list.reduce((sum, item) => sum + item[key], 0) / list.length;
  const difficulties = Object.values(GameDataWorld.difficulties);
  // 基线重定：怪物基础属性翻倍，四档难度倍率改为线性加成；普通级均值也随之翻倍。
  const targets = {
    魔国机械工厂: [GameDataMachineFactoryEnemies, [
      [161, 11, 11, 16], [225, 15, 14, 19], [290, 18, 17, 22], [355, 22, 20, 25], [418, 25, 23, 28],
    ]],
    水下列车: [GameDataUnderwaterTrainEnemies, [
      [297, 16, 13, 26], [416, 21, 17, 31], [535, 25, 21, 36], [653, 30, 25, 41], [772, 35, 29, 46],
    ]],
    兽人地下城: [GameDataFutureEnemies.orc_dungeon, [
      [367, 20, 18, 30], [515, 26, 24, 37], [662, 32, 30, 43], [809, 38, 35, 49], [955, 44, 40, 55],
    ]],
    废墟沙城: [GameDataRuinsSandCityEnemies, [
      [423, 24, 20, 33], [592, 31, 26, 39], [761, 38, 32, 46], [930, 46, 38, 52], [1099, 53, 44, 59],
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
  // 结构性护栏：用倍率比值锁定「冒险/勇士/王者/英雄 = +40%/+80%/+120%/+160% 生命」这一设计意图。
  // 以相对比值表达，敌人个体数值调整时不会腐坏，只在难度倍率被改动时才报错。
  const hpRatios = [1.4, 1.8, 2.2, 2.6];
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
  // 先手压力：水下列车英雄级平均速度不低于 20 级角色速度（47.28）的 90%
  const trainHell = average(
    GameDataUnderwaterTrainEnemies.map(enemy => GameDataWorld.scaleEnemyStats(enemy, difficulties[4], enemy.type)),
    "speed",
  );
  assert.ok(trainHell >= 47.28 * 0.9,
    `水下列车英雄级平均速度 ${trainHell.toFixed(1)} 未形成先手压力（20 级角色 47.28）`);
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
  normal: [90, 130], elite: 280, boss: 500, chest: 220,
});
assert.strictEqual(GameEconomy.shop.deleteCost, 700);
assert.strictEqual(GameEconomy.relic.smeltGold, 180);

const difficulties = Object.values(GameDataWorld.difficulties);
assert.deepStrictEqual(difficulties.map(item => item.reward), [1, 1.35, 1.75, 2.2, 2.75]);
assert.deepStrictEqual(difficulties.map(item => item.xp), [1, 1.15, 1.35, 1.6, 1.9]);
// 难度倍率按线性加成重定：冒险 +40%/+30%/+20%，逐档 +40/+30/+20 个百分点，
// 即 1.4/1.3/1.2 → 1.8/1.6/1.4 → 2.2/1.9/1.6 → 2.6/2.2/1.8。
assert.deepStrictEqual(difficulties.map(item => item.enemy.normal.hp), [1, 1.4, 1.8, 2.2, 2.6]);
assert.deepStrictEqual(difficulties.map(item => item.enemy.normal.power), [1, 1.3, 1.6, 1.9, 2.2]);
assert.deepStrictEqual(difficulties.map(item => item.enemy.normal.speed), [1, 1.2, 1.4, 1.6, 1.8]);

// 难度倍率严格递增（生命 / 输出 / 速度），XP 维持原表
(() => {
  const hp = difficulties.map(item => item.enemy.normal.hp);
  const power = difficulties.map(item => item.enemy.normal.power);
  const speed = difficulties.map(item => item.enemy.normal.speed);
  const strictlyUp = list => list.every((v, i) => i === 0 || v > list[i - 1]);
  assert.ok(strictlyUp(hp), `难度生命倍率未严格递增: ${hp.join("→")}`);
  assert.ok(strictlyUp(power), `难度输出倍率未严格递增: ${power.join("→")}`);
  assert.ok(strictlyUp(speed), `难度速度倍率未严格递增: ${speed.join("→")}`);
  assert.strictEqual(difficulties[4].enemy.normal.speed, 1.8,
    `英雄级速度倍率应为 1.8，实际 ${difficulties[4].enemy.normal.speed}`);
  assert.deepStrictEqual(difficulties.map(item => item.xp), [1, 1.15, 1.35, 1.6, 1.9]);
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
    ["冒险级", "生命140%/输出130%/速度120%"],
    ["勇士级", "生命180%/输出160%/速度140%"],
    ["王者级", "生命220%/输出190%/速度160%"],
    ["英雄级", "生命260%/输出220%/速度180%/精英与BOSS携带掉落饰品技能"],
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
  assert.strictEqual(digest,
    "b46967d466e844e36a1b1f3b455d62bea2bc5190afc5434c506c905138b9d637",
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
  const baseline = { 0: 14.27, 5: 9.91, 10: 8.89, 15: 8.43, 20: 8.17 };
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
    assert.strictEqual(scaled.attack, Math.round(enemy.attack * difficulty.enemy[enemy.type].power),
      `${enemy.id} ${difficulty.name} attack scaling mismatch`);
    assert.strictEqual(scaled.magic, Math.round(enemy.magic * difficulty.enemy[enemy.type].power),
      `${enemy.id} ${difficulty.name} magic scaling mismatch`);
    assert.strictEqual(scaled.speed, Math.round(enemy.speed * difficulty.enemy[enemy.type].speed),
      `${enemy.id} ${difficulty.name} speed scaling mismatch`);
  });
});
console.log("Balance values passed: characters, enemies, difficulty, and economy");
