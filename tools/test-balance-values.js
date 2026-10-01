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
  lokar: { attack: 4.8, magic: 2.5, speed: 5.5, maxHp: 62, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
  besta_doll: { attack: 3.6, magic: 5, speed: 5.5, maxHp: 48, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  manny: { attack: 4.8, magic: 5, speed: 6.7, maxHp: 62, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 3 },
  miller: { attack: 4.8, magic: 5, speed: 5.5, maxHp: 69, bloodlust: 1, handLimit: 5, drawPerTurn: 2, initialDraw: 1 },
  nonoka: { attack: 2.4, magic: 5, speed: 5.5, maxHp: 59, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  loki: { attack: 4.8, magic: 2.5, speed: 5.5, maxHp: 72, bloodlust: 2, handLimit: 5, drawPerTurn: 2, initialDraw: 1 },
  flora: { attack: 4.8, magic: 2.5, speed: 7.8, maxHp: 48, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 3 },
  wendy: { attack: 2.4, magic: 5, speed: 6.7, maxHp: 59, bloodlust: 1, handLimit: 3, drawPerTurn: 1, initialDraw: 2 },
  cadicis: { attack: 4.8, magic: 5, speed: 5.5, maxHp: 62, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 1 },
  carlos: { attack: 4.8, magic: 2.5, speed: 6.7, maxHp: 55, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 4 },
  bertis: { attack: 4.8, magic: 5, speed: 5.5, maxHp: 65, bloodlust: 1, handLimit: 3, drawPerTurn: 3, initialDraw: 2 },
  gerlot: { attack: 4.8, magic: 2.5, speed: 6.7, maxHp: 59, bloodlust: 2, handLimit: 4, drawPerTurn: 3, initialDraw: 2 },
  angelica: { attack: 4.8, magic: 2.5, speed: 5.5, maxHp: 77, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
  luka: { attack: 4.8, magic: 2.5, speed: 6.7, maxHp: 65, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 1 },
  elrana: { attack: 2.4, magic: 5, speed: 6.7, maxHp: 62, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  little_elrana: { attack: 4.8, magic: 5, speed: 5.5, maxHp: 55, bloodlust: 1, handLimit: 3, drawPerTurn: 1, initialDraw: 2 },
  ace: { attack: 4.8, magic: 2.5, speed: 5.5, maxHp: 65, bloodlust: 1, handLimit: 5, drawPerTurn: 1, initialDraw: 2 },
  nanali: { attack: 4.8, magic: 5, speed: 5.5, maxHp: 55, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
  ophelia: { attack: 2.4, magic: 6.2, speed: 5.5, maxHp: 52, bloodlust: 1, handLimit: 3, drawPerTurn: 3, initialDraw: 2 },
  aileng: { attack: 4.8, magic: 5, speed: 6.7, maxHp: 62, bloodlust: 1, handLimit: 5, drawPerTurn: 2, initialDraw: 1 },
  besta: { attack: 3.6, magic: 6.2, speed: 4.4, maxHp: 48, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  catherine: { attack: 2.4, magic: 5, speed: 4.4, maxHp: 48, bloodlust: 1, handLimit: 3, drawPerTurn: 2, initialDraw: 1 },
  hitwell: { attack: 4.8, magic: 5, speed: 6.7, maxHp: 59, bloodlust: 2, handLimit: 4, drawPerTurn: 1, initialDraw: 2 },
  gerda: { attack: 4.8, magic: 5, speed: 6.7, maxHp: 69, bloodlust: 1, handLimit: 4, drawPerTurn: 1, initialDraw: 1 },
  hoshino_yi: { attack: 4.8, magic: 5, speed: 5.5, maxHp: 59, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 2 },
  hoshino_kaiichi: { attack: 2.4, magic: 5, speed: 4.4, maxHp: 79, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 2 },
  artina: { attack: 4.8, magic: 3.7, speed: 6.7, maxHp: 62, bloodlust: 1, handLimit: 4, drawPerTurn: 2, initialDraw: 2 },
  maria: { attack: 4.8, magic: 5, speed: 6.7, maxHp: 65, bloodlust: 2, handLimit: 3, drawPerTurn: 3, initialDraw: 1 },
  sonia: { attack: 4.8, magic: 5, speed: 6.7, maxHp: 62, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 2 },
  chiyo: { attack: 3.6, magic: 2.5, speed: 7.8, maxHp: 52, bloodlust: 1, handLimit: 4, drawPerTurn: 3, initialDraw: 1 },
};
assert.strictEqual(Object.keys(expectedCharacters).length, GameDataCharacters.length,
  "every character needs a complete initial-stat baseline");
Object.entries(expectedCharacters).forEach(([id, expected]) => {
  assert.deepStrictEqual(stats(id), expected, `${id} balance stats changed`);
});
const expectedGrowth = {
  lokar: [140.21, 33.71, 12.25, 14.59], besta_doll: [105.16, 18.73, 32.66, 10.95], manny: [140.21, 29.97, 20.41, 18.24],
  miller: [186.95, 18.73, 20.41, 14.59], nonoka: [151.90, 11.24, 36.73, 14.59], loki: [210.32, 29.97, 8.16, 10.95],
  flora: [105.16, 33.71, 12.25, 27.36], wendy: [140.21, 7.49, 32.66, 18.24], cadicis: [163.58, 29.97, 16.32, 14.59],
  carlos: [128.53, 26.22, 8.16, 23.71], bertis: [186.95, 26.22, 28.57, 10.95], gerlot: [151.90, 29.97, 8.16, 20.06],
  angelica: [204.48, 37.45, 8.16, 10.95], luka: [198.63, 33.71, 8.16, 18.24], elrana: [186.95, 11.24, 40.82, 16.41],
  little_elrana: [151.90, 18.73, 32.66, 14.59], ace: [163.58, 18.73, 12.25, 20.06], nanali: [128.53, 33.71, 12.25, 16.41],
  ophelia: [140.21, 7.49, 40.82, 18.24], aileng: [163.58, 26.22, 24.5, 21.89], besta: [116.84, 11.24, 40.82, 7.3],
  catherine: [116.84, 7.49, 32.66, 7.3], hitwell: [140.21, 18.73, 32.66, 18.24], gerda: [222.00, 14.98, 28.57, 18.24],
  hoshino_yi: [151.90, 26.22, 28.57, 16.41], hoshino_kaiichi: [257.06, 11.24, 28.57, 10.95], artina: [116.84, 33.71, 12.25, 21.89],
  maria: [163.58, 22.48, 24.5, 18.24], sonia: [175.27, 26.22, 16.32, 20.06], chiyo: [128.53, 26.22, 8.16, 25.54],
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
  mechanical_goblin: [20, 4, 3, 6, 2, 4, 1, 1],
  machine_succubus: [18, 4, 5, 5, 1, 4, 1, 2],
  skeleton_patrol: [21, 4, 3, 7, 1, 3, 2, 1],
  mecha_minotaur: [30, 5, 3, 5, 3, 5, 1, 2],
  elrana_clone: [90, 7, 8, 9, 3, 3, 2, 3],
  krow_doctor: [90, 6, 8, 9, 2, 4, 2, 4],
  invader_chiyo: [100, 7, 7, 11, 2, 5, 3, 1],
  mechanical_bull_king: [135, 8, 6, 9, 2, 6, 3, 2],
  pursuer_edis: [220, 6, 5, 10, 2, 5, 2, 1],
  terror_slime: [44, 7, 6, 12, 1, 4, 2, 2],
  shark_pirate_crew: [44, 7, 5, 12, 1, 4, 1, 2],
  shark_pirate_raider: [52, 8, 5, 14, 2, 4, 2, 1],
  shark_pirate_submarine: [72, 7, 6, 9, 2, 5, 3, 2],
  raff_assassin: [150, 8, 8, 15, 2, 3, 2, 1],
  abe_mike: [160, 8, 7, 14, 1, 4, 2, 1],
  shark_captain_mordio: [330, 10, 7, 13, 1, 6, 3, 2],
  mona_eagle_captain: [335, 8, 8, 14, 3, 5, 2, 2],
  suicide_drone: [36, 10, 8, 17, 2, 3, 3, 1],
  demon_beast_unit: [54, 9, 7, 13, 1, 4, 1, 2],
  demon_witch: [34, 6, 13, 15, 1, 3, 2, 2],
  demon_mecha_cerberus: [78, 9, 8, 15, 1, 4, 1, 2],
  witherer_1124_split: [190, 11, 10, 16, 1, 4, 1, 1],
  orc_king_bondi: [235, 11, 6, 13, 1, 4, 2, 1],
  guard_kelly: [225, 9, 10, 15, 1, 4, 3, 2],
  assassin_sakura_risa: [205, 10, 8, 17, 2, 3, 2, 3],
  xx_witherer_1124: [400, 12, 13, 17, 1, 4, 3, 2],
  demon_king_bakaar: [380, 13, 9, 14, 2, 4, 2, 2],
  noble_soldier: [68, 10, 8, 15, 1, 4, 2, 2],
  noble_sniper: [60, 11, 8, 18, 1, 4, 1, 1],
  merca_tank: [92, 10, 10, 14, 1, 4, 2, 2],
  attack_drone: [52, 10, 10, 20, 1, 3, 2, 1],
  hilde: [260, 13, 12, 17, 2, 3, 2, 1],
  attack_helicopter: [240, 11, 10, 14, 1, 5, 3, 2],
  armored_carrier: [250, 12, 8, 16, 1, 4, 2, 1],
  mech_ai_dragon: [430, 16, 11, 17, 1, 4, 2, 1],
  witherer_1312: [450, 15, 14, 16, 2, 3, 3, 2],
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
// 四副本 × 五难度的平均实际属性目标表（重新平衡方案）
// 旧条件「机械工厂速度不超过 8 / 兽人速度不超过 17」是按 1.06～1.27 的旧速度倍率标定的，
// 速度倍率提高到 1.12～1.58 后已无法表达先手压力的设计意图，改为直接锁定缩放后的平均属性。
(() => {
  const average = (list, key) => list.reduce((sum, item) => sum + item[key], 0) / list.length;
  const difficulties = Object.values(GameDataWorld.difficulties);
  const targets = {
    魔国机械工厂: [GameDataMachineFactoryEnemies, [
      [80, 6, 5, 8], [101, 7, 7, 9], [125, 8, 7, 10], [157, 10, 9, 11], [198, 11, 11, 12],
    ]],
    水下列车: [GameDataUnderwaterTrainEnemies, [
      [148, 8, 7, 13], [186, 10, 8, 15], [231, 11, 9, 16], [290, 13, 11, 18], [364, 16, 13, 20],
    ]],
    兽人地下城: [GameDataFutureEnemies.orc_dungeon, [
      [184, 10, 9, 15], [230, 12, 11, 17], [285, 14, 13, 19], [359, 17, 15, 21], [451, 20, 18, 24],
    ]],
    废墟沙城: [GameDataRuinsSandCityEnemies, [
      [211, 12, 10, 16], [264, 14, 12, 18], [328, 17, 14, 21], [412, 20, 17, 23], [518, 24, 20, 26],
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
  // 副本间强度递进：平均 HP 逐副本递增
  const baseHp = Object.entries(targets).map(([, [list]]) => average(list, "hp"));
  assert.ok(baseHp.every((v, i) => i === 0 || v > baseHp[i - 1]),
    `副本平均生命未递进: ${baseHp.map(v => v.toFixed(1)).join("→")}`);
  // 先手压力：水下列车英雄级平均速度不低于 20 级角色速度（20.46）的 90%
  const trainHell = average(
    GameDataUnderwaterTrainEnemies.map(enemy => GameDataWorld.scaleEnemyStats(enemy, difficulties[4], enemy.type)),
    "speed",
  );
  assert.ok(trainHell >= 20.46 * 0.9,
    `水下列车英雄级平均速度 ${trainHell.toFixed(1)} 未形成先手压力（20 级角色 20.46）`);
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
assert.deepStrictEqual(difficulties.map(item => item.enemy.normal.hp), [1, 1.25, 1.55, 1.95, 2.45]);
assert.deepStrictEqual(difficulties.map(item => item.enemy.normal.power), [1, 1.20, 1.42, 1.68, 1.98]);
assert.deepStrictEqual(difficulties.map(item => item.enemy.normal.speed), [1, 1.12, 1.26, 1.42, 1.58]);

// 难度倍率严格递增（生命 / 输出），速度维持原表，XP 维持原表
(() => {
  const hp = difficulties.map(item => item.enemy.normal.hp);
  const power = difficulties.map(item => item.enemy.normal.power);
  const speed = difficulties.map(item => item.enemy.normal.speed);
  const strictlyUp = list => list.every((v, i) => i === 0 || v > list[i - 1]);
  assert.ok(strictlyUp(hp), `难度生命倍率未严格递增: ${hp.join("→")}`);
  assert.ok(strictlyUp(power), `难度输出倍率未严格递增: ${power.join("→")}`);
  assert.ok(strictlyUp(speed), `难度速度倍率未严格递增: ${speed.join("→")}`);
  assert.strictEqual(difficulties[4].enemy.normal.speed, 1.58,
    `英雄级速度倍率应为 1.58，实际 ${difficulties[4].enemy.normal.speed}`);
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
    ["冒险级", "生命125%/输出120%/速度112%"],
    ["勇士级", "生命155%/输出142%/速度126%"],
    ["王者级", "生命195%/输出168%/速度142%"],
    ["英雄级", "生命245%/输出198%/速度158%/精英与BOSS携带掉落饰品技能"],
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
  assert.strictEqual(digest,
    "402cdbcf4840d5a237c64afc4f98598f7feeaab6ff4ea8e76da8319cc736fd77",
    "0～20 级角色成长数据被改动（快照不匹配，若有意调整请更新摘要）");
  const lokar = GameDataCharacters.find(character => character.id === "lokar");
  assert.deepStrictEqual(
    [progression.statsAt(lokar, 0).maxHp, progression.statsAt(lokar, 20).maxHp],
    [62, 202],
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
