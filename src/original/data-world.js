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
    ["bloodlust", "杀意上限"], ["handLimit", "手牌上限"],
    ["drawPerTurn", "每回合摸牌"], ["initialDraw", "初始摸牌"],
  ],
  scaleEnemyStats(base, diff, type) {
    const raw = diff.enemy[type] ?? 1, next = { ...base };
    if (typeof raw === "number") {
      ["hp", "attack", "magic", "speed", "bloodlust", "handLimit"].forEach(k => { if (Number.isFinite(base[k])) next[k] = Math.ceil(base[k] * raw); });
      return next;
    }
    if (Number.isFinite(base.hp)) next.hp = Math.ceil(base.hp * (raw.hp ?? 1));
    ["attack", "magic"].forEach(k => { if (Number.isFinite(base[k])) next[k] = Math.round(base[k] * (raw.power ?? 1)); });
    if (Number.isFinite(base.speed) && Number.isFinite(raw.speed)) next.speed = Math.round(base.speed * raw.speed);
    ["bloodlust", "handLimit", "drawPerTurn"].forEach(k => { if (Number.isFinite(base[k]) && Number.isFinite(raw[k])) next[k] = base[k] + raw[k]; });
    return next;
  },
  lore: "母亲贝丝妲命罗卡尔收集精华宝珠。精华宝珠为累计消耗型资源，未来可在孕育殿堂中自由选择消耗指定数量解锁姐姐角色；所有角色无前置限制，大姐安洁莉卡不再要求最后解锁。温蒂与芙萝娅为双胞胎，可分别消耗8颗解锁；双胞胎同时在场时将获得连携技能加成。当前初始仅罗卡尔与贝丝妲魔偶出战，后续再按设计补充。",
  difficulties: {
    normal: { name: "普通级", tone: "green", attrText: "基础", eliteRate: .2, reward: 1, xp: 1, dropRate: .2, layers: 10, unlock: null, enemy: { normal: { hp: 1, power: 1, speed: 1 }, elite: { hp: 1, power: 1, speed: 1 }, boss: { hp: 1, power: 1, speed: 1 } }, weights: { normal: 78, rest: 12, chest: 10 } },
    adventure: { name: "冒险级", tone: "blue", attrText: "生命135%/输出110%/速度106%", eliteRate: .3, reward: 1.35, xp: 1.15, dropRate: .4, layers: 10, unlock: "normal", enemy: { normal: { hp: 1.35, power: 1.1, speed: 1.06 }, elite: { hp: 1.35, power: 1.1, speed: 1.06 }, boss: { hp: 1.35, power: 1.1, speed: 1.06 } }, weights: { normal: 75, rest: 10, chest: 15 } },
    warrior: { name: "勇士级", tone: "purple", attrText: "生命175%/输出122%/速度112%", eliteRate: .4, reward: 1.75, xp: 1.35, dropRate: .5, layers: 10, unlock: "adventure", enemy: { normal: { hp: 1.75, power: 1.22, speed: 1.12 }, elite: { hp: 1.75, power: 1.22, speed: 1.12 }, boss: { hp: 1.75, power: 1.22, speed: 1.12 } }, weights: { normal: 75, rest: 10, chest: 15 } },
    king: { name: "王者级", tone: "orange", attrText: "生命230%/输出136%/速度119%", eliteRate: .5, reward: 2.2, xp: 1.6, dropRate: .6, layers: 10, unlock: "warrior", enemy: { normal: { hp: 2.3, power: 1.36, speed: 1.19 }, elite: { hp: 2.3, power: 1.36, speed: 1.19 }, boss: { hp: 2.3, power: 1.36, speed: 1.19 } }, weights: { normal: 75, rest: 10, chest: 15 } },
    hell: { name: "英雄级", tone: "red", attrText: "生命320%/输出152%/速度127%/精英与BOSS携带掉落饰品技能", eliteRate: .6, reward: 2.75, xp: 1.9, dropRate: .7, layers: 10, unlock: "king", enemyRelics: true, enemy: { normal: { hp: 3.2, power: 1.52, speed: 1.27 }, elite: { hp: 3.2, power: 1.52, speed: 1.27 }, boss: { hp: 3.2, power: 1.52, speed: 1.27 } }, weights: { normal: 75, rest: 10, chest: 15 } },
  },
  missions: [
    { id: "machine_factory", name: "魔国机械工厂", kind: "dungeon", reward: { gold: 0, ...window.GameEconomy.missionRewards.machine_factory }, subtitle: "自动化魔械生产线" },
    { id: "underwater_train", name: "水下列车", kind: "dungeon", requiresFlag: "underwaterTrainUnlocked", lockedHint: "娜娜莉解锁后触发别墅事件开放", reward: { gold: 0, ...window.GameEconomy.missionRewards.underwater_train }, subtitle: "被狂鲨海盗团劫持的人鱼国航线", bgm: "./assets/sounds/underwater-train-battle.ogg", route: { type: "linear", layers: 15, rest: [10], chest: [8], boss: [15], mixedEliteFrom: 11 } },
    ...(window.GameDataFutureDungeons || []),
  ],
  enemies: {
    machine_factory: window.GameDataMachineFactoryEnemies,
    underwater_train: window.GameDataUnderwaterTrainEnemies,
    ruins_sand_city: window.GameDataRuinsSandCityEnemies,
    ...(window.GameDataFutureEnemies || {}),
  },
  testEnemies: [],
};
// Keep the test enemy picker synchronized with every canonical dungeon group.
window.GameDataWorld.testEnemies = Object.values(window.GameDataWorld.enemies)
  .flatMap(group => Array.isArray(group) ? group : []);
