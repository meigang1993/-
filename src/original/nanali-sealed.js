window.NanaliSealed = (() => {
  // 293 前这里自己遍历 unit.nanaliSealed 回手牌。现统一由
  // BattleCharacterCardStorage 管理「角色牌上的存储牌」：任意角色回合结束时
  // 返还 release=anyTurnEnd 的条目，阵亡者不返还（其牌已入弃牌堆）。
  // 保留本转发层，battle-end-phase 的既有装配链无需改动。
  function returnSealed(state) {
    return window.BattleCharacterCardStorage?.endTurn?.(state) ?? 0;
  }
  return { returnSealed };
})();
