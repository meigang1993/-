window.GameEconomy = Object.freeze({
  startingGold: 0,
  shop: Object.freeze({
    defaultCardPrice: 80,
    deleteCost: 700,
    stockSize: 6,
    expandedStockSize: 7,
  }),
  relic: Object.freeze({
    smeltGold: 180,
  }),
  dungeonGold: Object.freeze({
    normal: Object.freeze([90, 130]),
    elite: 280,
    boss: 500,
    chest: 220,
  }),
  missionRewards: Object.freeze({
    machine_factory: Object.freeze({
      goldMultiplier: 1,
      bountyGoldRange: Object.freeze([500, 900]),
      bountyLegacyGoldRanges: Object.freeze([Object.freeze([400, 1000])]),
    }),
    underwater_train: Object.freeze({
      goldMultiplier: 1.25,
      bountyGoldRange: Object.freeze([800, 1400]),
      bountyLegacyGoldRanges: Object.freeze([Object.freeze([2000, 5000])]),
    }),
    orc_dungeon: Object.freeze({
      goldMultiplier: 1.7,
      bountyGoldRange: Object.freeze([1200, 2000]),
      bountyLegacyGoldRanges: Object.freeze([
        Object.freeze([4000, 9000]),
        Object.freeze([7000, 12000]),
      ]),
    }),
    // 废墟沙城：排在兽人地下城之后的更后期副本（进度权重 4 > 兽人 3），
    // 金币倍率按 1 → 1.25 → 1.7 → 2.3 递增。
    // bountyLegacyGoldRanges 保留曾与兽人相同的 [1200,2000]，用于旧存档兼容。
    ruins_sand_city: Object.freeze({
      goldMultiplier: 2.3,
      bountyGoldRange: Object.freeze([1600, 2600]),
      bountyLegacyGoldRanges: Object.freeze([
        Object.freeze([1200, 2000]),
      ]),
    }),
  }),
});
