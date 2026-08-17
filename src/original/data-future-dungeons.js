window.GameDataFutureDungeons = [
  {
    id: "orc_dungeon",
    name: "兽人地下城",
    kind: "dungeon",
    requiresFlag: "orcDungeonUnlocked",
    lockedHint: "首次通关水下列车·冒险级后触发剧情开放",
    reward: { gold: 0, ...window.GameEconomy.missionRewards.orc_dungeon },
    subtitle: "被魔王军占领的兽人领地，凋零者潜伏其间寻找混沌之子",
    bgm: "./assets/new-bgm/orc-dungeon-battle.m4a",
    route: { type: "fixed-random", layers: 13, rest: [9], chest: [7], boss: [13] }
  },
];
