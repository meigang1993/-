// 副本难度解锁表：难度解锁按副本独立，不再全局共享。
//
// 旧行为：state.unlockedDifficulties 是全局数组，通关任一副本的某难度会把下一难度
// 推入全局，导致其余副本的同名难度同时显示为已解锁。
// 新行为：state.dungeonUnlocks 形如 { machine_factory: ["normal", "adventure"] }，
// 每个副本各自维护自己的难度链。
// state.unlockedDifficulties 保留为派生字段——所有副本已解锁难度的并集，
// 用于同步协议与历史存档兼容，不作为解锁判据。
window.DungeonUnlocks = (() => {
  const DEFAULT_ID = "normal";

  function missions() {
    return (window.GameData?.missions || []).filter(m => m?.kind === "dungeon");
  }
  function validMission(id) {
    return missions().some(m => m.id === id);
  }
  function validDifficulty(id) {
    return !!window.GameData?.difficulties?.[id];
  }
  function isOpen(state, mission) {
    return !mission.requiresFlag || !!state?.flags?.[mission.requiresFlag];
  }
  function table(state) {
    if (!state) return {};
    const own = state.dungeonUnlocks;
    if (!own || typeof own !== "object" || Array.isArray(own)) state.dungeonUnlocks = {};
    return state.dungeonUnlocks;
  }
  function clean(list) {
    const ids = Array.isArray(list) ? list : [];
    return [...new Set(ids.filter(validDifficulty))];
  }
  function list(state, missionId) {
    if (!validMission(missionId)) return [];
    const own = table(state);
    const mine = clean(own[missionId]);
    if (mine.length) return mine.includes(DEFAULT_ID) ? mine : [DEFAULT_ID, ...mine];
    // 整张表还是空的 = 这份 state 从未走过按副本迁移（老存档未迁移 / 测试夹具）。
    // 此时回退到旧的全局数组，避免误锁；一旦表里有了任一副本的记录，
    // 就严格按副本独立，未记录的副本只给普通级，不允许外溢。
    if (!Object.keys(own).length) {
      const legacy = clean(state.unlockedDifficulties);
      return legacy.length ? legacy : [DEFAULT_ID];
    }
    return [DEFAULT_ID];
  }
  function has(state, missionId, difficultyId) {
    return list(state, missionId).includes(difficultyId);
  }
  // 同步派生字段，保持与旧存档/同步协议兼容。
  function syncLegacy(state) {
    const merged = [...new Set(Object.values(table(state)).flat())];
    state.unlockedDifficulties = clean(merged);
  }
  function unlock(state, missionId, difficultyId) {
    if (!validMission(missionId) || !validDifficulty(difficultyId)) return false;
    const current = list(state, missionId);
    if (current.includes(difficultyId)) return false;
    table(state)[missionId] = [...current, difficultyId];
    syncLegacy(state);
    return true;
  }
  function unlockNext(state, missionId, difficultyId) {
    const next = Object.entries(window.GameData.difficulties || {})
      .find(([, difficulty]) => difficulty.unlock === difficultyId)?.[0];
    if (!next) return null;
    return unlock(state, missionId, next) ? next : null;
  }
  // 老存档迁移：数组形态 → 按副本独立。
  // 已开放的副本继承原全局进度（不丢档）；未开放的副本只给普通级，需自行从头推进。
  function migrate(state) {
    if (!state || typeof state !== "object") return state;
    const legacy = clean(state.unlockedDifficulties);
    const own = table(state);
    const filled = missions().filter(m => Object.prototype.hasOwnProperty.call(own, m.id));
    missions().forEach(mission => {
      if (filled.includes(mission)) return;
      own[mission.id] = isOpen(state, mission) && legacy.length ? [...legacy] : [DEFAULT_ID];
    });
    syncLegacy(state);
    return state;
  }
  return { DEFAULT_ID, has, list, migrate, missions, table, unlock, unlockNext };
})();
