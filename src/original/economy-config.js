window.GameEconomy = Object.freeze({
  startingGold: 0,
  shop: Object.freeze({
    defaultCardPrice: 80,
    deleteCost: 700,
    stockSize: 6,
    expandedStockSize: 7,
    // 商店手动刷新商品（重摇全部库存）的固定费用（莉莉丝元）。
    refreshCost: 500,
  }),
  relic: Object.freeze({
    smeltGold: 180,
  }),
  bounty: Object.freeze({
    // 任务界面/商店手动刷新任务列表的固定费用（莉莉丝元）。
    refreshCost: 500,
  }),
  // 所有副本的莉莉丝元获得统一减少 30%：基础值为原值 ×70%（90/130→63/91、280→196、
  // 500→350、220→154，恰为整数）；难度倍率与副本倍率不变，节点结算仍按整数四舍五入。
  dungeonGold: Object.freeze({
    normal: Object.freeze([63, 91]),
    elite: 196,
    boss: 350,
    chest: 154,
  }),
  missionRewards: Object.freeze({
    machine_factory: Object.freeze({
      goldMultiplier: 100,
      bountyGoldRange: Object.freeze([500, 900]),
      bountyLegacyGoldRanges: Object.freeze([Object.freeze([400, 1000])]),
    }),
    underwater_train: Object.freeze({
      goldMultiplier: 125,
      bountyGoldRange: Object.freeze([800, 1400]),
      bountyLegacyGoldRanges: Object.freeze([Object.freeze([2000, 5000])]),
    }),
    orc_dungeon: Object.freeze({
      goldMultiplier: 170,
      bountyGoldRange: Object.freeze([1200, 2000]),
      bountyLegacyGoldRanges: Object.freeze([
        Object.freeze([4000, 9000]),
        Object.freeze([7000, 12000]),
      ]),
    }),
    // 废墟沙城：排在兽人地下城之后的更后期副本（进度权重 4 > 兽人 3），
    // 金币倍率按整数百分比 100 → 125 → 170 → 230 递增（结算时除以 100）。
    // bountyLegacyGoldRanges 保留曾与兽人相同的 [1200,2000]，用于旧存档兼容。
    ruins_sand_city: Object.freeze({
      goldMultiplier: 230,
      bountyGoldRange: Object.freeze([1600, 2600]),
      bountyLegacyGoldRanges: Object.freeze([
        Object.freeze([1200, 2000]),
      ]),
    }),
    // 天日国鹰7研究所：莉莉丝元按废墟沙城调整（倍率与悬赏区间同表）。
    // 入口开发完成前悬赏生成已排除本副本，配置先行落位以便后续直接启用。
    tenri_institute: Object.freeze({
      goldMultiplier: 230,
      bountyGoldRange: Object.freeze([1600, 2600]),
      bountyLegacyGoldRanges: Object.freeze([
        Object.freeze([1600, 2600]),
      ]),
    }),
  }),
});
