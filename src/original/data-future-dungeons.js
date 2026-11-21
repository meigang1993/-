window.GameDataFutureDungeons = [
  {
    id: "orc_dungeon",
    name: "兽人地下城",
    kind: "dungeon",
    requiresFlag: "orcDungeonUnlocked",
    lockedHint: "首次通关水下列车·冒险级后触发剧情开放",
    reward: { gold: 0, ...window.GameEconomy.missionRewards.orc_dungeon },
    subtitle: "被魔王军占领的兽人领地，凋零者潜伏其间寻找混沌之子",
    bgm: "./assets/new-bgm/orc-dungeon-battle.ogg",
    route: { type: "fixed-random", layers: 13, rest: [12], chest: [7], boss: [13] }
  },
  ...(window.GameDataRuinsSandCity ? [window.GameDataRuinsSandCity.mission] : []),
  // 天日国鹰7研究所：条件展开，未加载该数据文件的工具链会自动略过，不影响既有副本断言。
  ...(window.GameDataTenriInstitute ? [window.GameDataTenriInstitute.mission] : []),
];
