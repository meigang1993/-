// 天日国鹰7研究所 · 副本骨架（阶段性占位，2026-11-21）
// 复用既有副本范式：mission 由 data-future-dungeons.js 聚合进 GameData.missions，
// 路线走 DungeonMap.fixedRandomLayers，敌人池走 GameData.enemies，经验走
// CharacterProgression.dungeonExpMultiplier，金币走 GameEconomy.missionRewards。
// 怪物表已定稿 4 只普通怪：data-tenri-institute-enemies.js；精英/首领待补，
// dungeon-enemies.js 的 tenriEnemies 分支三型节点都从普通池随机。
// 入口暂锁：devLocked 为 true 时大厅面板 / 客户端 / 本地核心 / 悬赏生成一律拒绝，
// 提示「未开发完成」；剧情解锁只负责把 requiresFlag 置真，不改变入口状态。
window.GameDataTenriInstitute = (() => {
  const ID = "tenri_institute";
  const mission = {
    id: ID,
    name: "天日国鹰7研究所",
    kind: "dungeon",
    requiresFlag: "tenriInstituteUnlocked",
    lockedHint: "解锁普雷希与米尔尤拉后首次通关废墟沙城·冒险级触发剧情开放",
    devLocked: true,
    devHint: "未开发完成",
    reward: { gold: 0, ...(window.GameEconomy?.missionRewards?.[ID] || {}) },
    subtitle: "天日国南都海域无人小岛上的秘密研究所，橘千樱调查拥鹰派罪证与英雄学院学生失踪真相",
    // 研究所专属战斗曲：已做首尾零样本闭合 + LOOPSTART/LOOPLENGTH 循环点（无缝循环）。
    bgm: "./assets/new-bgm/tenri-institute-battle.c9d87b58.ogg",
    // 14 层：第 7 层宝箱、第 13 层休整、第 14 层 BOSS，其余层按难度掷精英。
    route: { type: "fixed-random", layers: 14, rest: [13], chest: [7], boss: [14] },
  };
  const lore = [
    "天日国南都海域有个无人小岛，天日国政府在这个小岛上建了个秘密研究所。",
    "橘千樱想去收集拥鹰派罪证，调查英雄学院学生不知所踪的真相。",
  ];
  return {
    ID,
    mission,
    lore,
    // getter 延迟取值，避免加载顺序差异导致怪物池为空。
    get enemies() { return window.GameDataTenriInstituteEnemies || []; },
    // 解锁前置：普雷希与米尔尤拉都已在角色栏解锁。
    unlockCastReady(state) {
      const chars = state?.chars || [];
      return ["preshi", "mieryula"].every(id => chars.some(c => c.id === id && !c.locked));
    },
    // 是否通关过废墟沙城·冒险级：本次通关 run 或管家手册通关记录任一成立。
    // 后者让「更新前已通关」的老存档也能在回大厅时补触发剧情。
    clearedRuinsAdventure(state, run) {
      const byRun = run?.missionId === "ruins_sand_city"
        && run?.difficultyId === "adventure" && run?.complete === true;
      const byRecord = !!window.ButlerManualProgress?.has?.(state, "clear", "ruins_sand_city", "adventure");
      return byRun || byRecord;
    },
  };
})();
