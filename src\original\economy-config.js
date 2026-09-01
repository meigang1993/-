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
  }),
});
