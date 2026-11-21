if (!Array.isArray(window.GameDataMachineFactoryEnemies) || window.GameDataMachineFactoryEnemies.length === 0) {
  throw new Error("Missing required enemy data: data-machine-factory-enemies.js");
}
if (!Array.isArray(window.GameDataUnderwaterTrainEnemies) || window.GameDataUnderwaterTrainEnemies.length === 0) {
  throw new Error("Missing required enemy data: data-underwater-train-enemies.js");
}
if (!Array.isArray(window.GameDataRuinsSandCityEnemies) || window.GameDataRuinsSandCityEnemies.length === 0) {
  throw new Error("Missing required enemy data: data-ruins-sand-city-enemies.js");
}

window.GameDataWorld = {
  statDefs: [
    ["attack", "攻击力"], ["magic", "魔力"], ["speed", "速度"], ["maxHp", "生命值"],
    ["bloodlust", "淫气上限"], ["handLimit", "手牌上限"],
    ["drawPerTurn", "每回合摸牌"], ["initialDraw", "初始摸牌"],
  ],
  scaleEnemyStats(base, diff, type) {
    // 难度曲线统一为整数百分比参数（150 = 150% = 四项属性 +50%），实际倍率等价不变；
    // 所有缩放输出继续收敛为整数，避免小数属性漏进战斗结算与面板。
    const cfg = diff.enemy[type] ?? { hp: 100, power: 100, speed: 100 }, next = { ...base };
    // 先乘整数百分比再除 100：避免 1.5 / 3.0 这类浮点倍率产生 1892.0000000000002 尾巴。
    const pct = value => (Number.isFinite(Number(value)) ? Number(value) : 100);
    if (typeof cfg === "number") {
      ["hp", "attack", "magic", "speed", "bloodlust", "handLimit"].forEach(k => { if (Number.isFinite(base[k])) next[k] = Math.ceil(base[k] * cfg); });
      return next;
    }
    if (Number.isFinite(base.hp)) next.hp = Math.ceil(base.hp * pct(cfg.hp) / 100);
    ["attack", "magic"].forEach(k => { if (Number.isFinite(base[k])) next[k] = Math.round(base[k] * pct(cfg.power) / 100); });
    if (Number.isFinite(base.speed) && Number.isFinite(Number(cfg.speed))) next.speed = Math.round(base.speed * Number(cfg.speed) / 100);
    ["bloodlust", "handLimit", "drawPerTurn"].forEach(k => { if (Number.isFinite(base[k]) && Number.isFinite(cfg[k])) next[k] = base[k] + cfg[k]; });
    return next;
  },
  lore: "母亲贝丝妲命罗卡尔收集精华宝珠。精华宝珠为累计消耗型资源，未来可在孕育殿堂中自由选择消耗指定数量解锁姐姐角色；所有角色无前置限制，大姐安洁莉卡不再要求最后解锁。温蒂与芙萝娅为双胞胎，可分别消耗8颗解锁；双胞胎同时在场时将获得连携技能加成。当前初始仅罗卡尔与贝丝妲魔偶出战，后续再按设计补充。",
  // 四档难度的生命/攻击/魔力/速度四项属性统一按 +50%/+100%/+150%/+200% 递增，
  // 普通级保持 100%；精英与首领同倍率；奖励/经验/精英率/掉落率维持原表。
  difficulties: {
    normal: { name: "普通级", tone: "green", attrText: "基础", eliteRate: 20, reward: 100, xp: 100, dropRate: 20, layers: 10, unlock: null, enemy: { normal: { hp: 100, power: 100, speed: 100 }, elite: { hp: 100, power: 100, speed: 100 }, boss: { hp: 100, power: 100, speed: 100 } }, weights: { normal: 78, rest: 12, chest: 10 } },
    adventure: { name: "冒险级", tone: "blue", attrText: "生命150%/输出150%/速度150%", eliteRate: 30, reward: 135, xp: 115, dropRate: 40, layers: 10, unlock: "normal", enemy: { normal: { hp: 150, power: 150, speed: 150 }, elite: { hp: 150, power: 150, speed: 150 }, boss: { hp: 150, power: 150, speed: 150 } }, weights: { normal: 75, rest: 10, chest: 15 } },
    warrior: { name: "勇士级", tone: "purple", attrText: "生命200%/输出200%/速度200%", eliteRate: 40, reward: 175, xp: 135, dropRate: 50, layers: 10, unlock: "adventure", enemy: { normal: { hp: 200, power: 200, speed: 200 }, elite: { hp: 200, power: 200, speed: 200 }, boss: { hp: 200, power: 200, speed: 200 } }, weights: { normal: 75, rest: 10, chest: 15 } },
    king: { name: "王者级", tone: "orange", attrText: "生命250%/输出250%/速度250%", eliteRate: 50, reward: 220, xp: 160, dropRate: 60, layers: 10, unlock: "warrior", enemy: { normal: { hp: 250, power: 250, speed: 250 }, elite: { hp: 250, power: 250, speed: 250 }, boss: { hp: 250, power: 250, speed: 250 } }, weights: { normal: 75, rest: 10, chest: 15 } },
    hell: { name: "英雄级", tone: "red", attrText: "生命300%/输出300%/速度300%/精英与BOSS携带掉落饰品技能", eliteRate: 60, reward: 275, xp: 190, dropRate: 70, layers: 10, unlock: "king", enemyRelics: true, enemy: { normal: { hp: 300, power: 300, speed: 300 }, elite: { hp: 300, power: 300, speed: 300 }, boss: { hp: 300, power: 300, speed: 300 } }, weights: { normal: 75, rest: 10, chest: 15 } },
  },
  missions: [
    // 原本没有 route，走 defaultLayers：休整与宝箱靠权重随机，英雄级因精英率 .6
    // 挤占掷点，约 27% 的路线整张图没有休整点（全队回血的唯一手段），故改为固定层。
    { id: "machine_factory", name: "魔国机械工厂", kind: "dungeon", reward: { gold: 0, ...window.GameEconomy.missionRewards.machine_factory }, subtitle: "自动化魔械生产线", route: { type: "fixed-random", layers: 10, rest: [9], chest: [8], boss: [10] } },
    { id: "underwater_train", name: "水下列车", kind: "dungeon", requiresFlag: "underwaterTrainUnlocked", lockedHint: "娜娜莉解锁后触发别墅事件开放", reward: { gold: 0, ...window.GameEconomy.missionRewards.underwater_train }, subtitle: "被狂鲨海盗团劫持的人鱼国航线", bgm: "./assets/sounds/underwater-train-battle.ogg", route: { type: "linear", layers: 15, rest: [14], chest: [8], boss: [15] } },
    ...(window.GameDataFutureDungeons || []),
  ],
  enemies: {
    machine_factory: window.GameDataMachineFactoryEnemies,
    underwater_train: window.GameDataUnderwaterTrainEnemies,
    ruins_sand_city: window.GameDataRuinsSandCityEnemies,
    // 怪物设计未定稿：天日国鹰7研究所临时复用废墟沙城随机池。
    // 条件展开与 mission 聚合同源，未加载新数据文件的工具链不会产生孤立敌人组 key。
    ...(window.GameDataTenriInstitute ? { tenri_institute: window.GameDataTenriInstitute.enemies } : {}),
    ...(window.GameDataFutureEnemies || {}),
  },
  testEnemies: [],
};
// Keep the test enemy picker synchronized with every canonical dungeon group.
window.GameDataWorld.testEnemies = Object.values(window.GameDataWorld.enemies)
  .flatMap(group => Array.isArray(group) ? group : []);
