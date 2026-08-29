window.GameDataRuinsSandCity = {
  mission: {
    id: "ruins_sand_city", name: "废墟沙城", kind: "dungeon",
    requiresFlag: "ruinsSandCityUnlocked", lockedHint: "首次通关兽人地下城·勇士级后触发解锁事件",
    reward: { gold: 0, ...window.GameEconomy.missionRewards.orc_dungeon },
    subtitle: "帮助反抗军击退入侵小国的世界贵族军",
    bgm: "./assets/sounds/ruins-sand-city-battle.ogg",
    route: { type: "fixed-random", layers: 15, rest: [4, 9], chest: [7], boss: [15] },
  },
  enemies: window.GameDataRuinsSandCityEnemies,
};
