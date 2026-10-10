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
  function nextOf(difficultyId) {
    return Object.entries(window.GameData.difficulties || {})
      .find(([, difficulty]) => difficulty.unlock === difficultyId)?.[0] || null;
  }
  // 该副本该难度是否真有通关记录（成果记录形如 "clear:副本id@难度id"）。
  // 返回 null 表示通关记录模块缺失、无法判定——此时绝不回收，避免误锁玩家进度。
  function cleared(state, missionId, difficultyId) {
    const progress = window.ButlerManualProgress;
    if (!progress?.has) return null;
    // 通关记录缺失（例如本地核心的字段快照里没带上 butlerFeats）时无法判定，
    // 必须返回 null 让调用方保持原值不动——否则会被误读成「没通关」而回收难度。
    if (!Array.isArray(state?.butlerFeats)) return null;
    return !!progress.has(state, "clear", missionId, difficultyId);
  }
  // 按通关记录递推：普通级恒解锁，此后每一档都必须真的通关了上一档。
  // 由全局数组外溢得来的难度没有任何该副本的通关记录，会被锁回普通级。
  // 无法判定时返回 null，调用方保持原值不动。
  function chain(state, missionId) {
    const result = [DEFAULT_ID];
    let current = DEFAULT_ID;
    for (;;) {
      const next = nextOf(current);
      if (!next) break;
      const ok = cleared(state, missionId, current);
      if (ok === null) return null;
      if (!ok) break;
      result.push(next);
      current = next;
    }
    return result;
  }
  // 老存档迁移：数组形态 → 按副本独立。
  // 每次加载都按通关记录重算一遍，因此已经写入过 dungeonUnlocks 的存档
  // 若含有外溢来的难度，也会在本次加载时被回收。
  function migrate(state) {
    if (!state || typeof state !== "object") return state;
    // 先整体算完：只要有一个副本无法判定，就整份跳过，
    // 避免写入半套数据后 syncLegacy 把旧数组清空，造成进度丢失。
    const chains = missions().map(mission => ({ id: mission.id, next: chain(state, mission.id) }));
    if (!chains.length || chains.some(item => !item.next)) return state;
    const own = table(state);
    chains.forEach(item => { own[item.id] = item.next; });
    syncLegacy(state);
    return state;
  }
  return { DEFAULT_ID, has, list, migrate, missions, table, unlock, unlockNext };
})();
