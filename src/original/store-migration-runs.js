window.StoreRunMigrations = (() => {
  function migrateDifficulties(list) {
    const aliases = { apprentice: "normal", elite: "adventure", champion: "warrior" };
    const source = Array.isArray(list) && list.length ? list : ["normal"];
    const result = source.map(id => aliases[id] || id)
      .filter(id => GameData.difficulties[id]);
    return [...new Set(result.length ? result : ["normal"])];
  }

  function validDungeonRun(run) {
    if (!run || typeof run !== "object") return false;
    if (!GameData.difficulties?.[run.difficultyId]
      || !GameData.missions?.some(mission => mission.id === run.missionId)) return false;
    return Array.isArray(run.layers) && run.layers.length > 0
      && run.layers.some(layer => Array.isArray(layer) && layer.some(node => node?.id));
  }

  function recoverBrokenDungeonState(state) {
    if (state.view !== "dungeon" || validDungeonRun(state.explore)) return;
    state.view = "hall";
    state.explore = null;
    state.battle = null;
    state.loadingBattleName = null;
    state.loadingBattleProgress = null;
    state.log = [
      "检测到未完成副本数据异常，已返回据点，请重新出征。",
      ...(state.log || []),
    ].slice(0, 30);
    Object.defineProperty(state, "_needsSaveAfterMigration", {
      value: true, configurable: true,
    });
  }

  function rollbackPendingNode(run, expectedNodeId = "") {
    if (!run?.pending || expectedNodeId && run.pending !== expectedNodeId) return false;
    const pending = run.pending;
    const list = Array.isArray(run.layers) ? run.layers.flat().filter(Boolean) : [];
    const leadsToPending = node => node.done && Array.isArray(node.next)
      && node.next.includes(pending);
    const previous = run.previous
      && list.find(node => node.id === run.previous && leadsToPending(node));
    const fallback = previous || list.find(leadsToPending)
      || list.filter(node => node.done)
        .sort((a, b) => (Number(b.layer) || 0) - (Number(a.layer) || 0))[0];
    if (fallback) run.current = fallback.id;
    run.pending = null;
    run.lastReward = null;
    delete run.previous;
    return true;
  }

  function recoverOrphanedBattleNode(state) {
    const run = state.explore;
    if (state.battle || state.view !== "dungeon" || !run?.pending) return false;
    const pendingNode = Array.isArray(run.layers)
      ? run.layers.flat().find(node => node?.id === run.pending) : null;
    if (!["normal", "elite", "boss"].includes(pendingNode?.type)) return false;
    rollbackPendingNode(run);
    state.log = [
      "检测到上次战斗节点未解锁，已恢复为可重新进入状态。",
      ...(state.log || []),
    ].slice(0, 30);
    Object.defineProperty(state, "_needsSaveAfterMigration", {
      value: true, configurable: true,
    });
    return true;
  }

  function migrateRunReceipts(state) {
    const raw = state._localRunState;
    if (!raw) return false;
    const run = state.explore;
    const focusId = String(run?.focusId || "");
    if (!focusId) {
      state._localRunState = null;
      return true;
    }
    const prefix = `${run.missionId || ""}:${run.difficultyId || ""}:${focusId}:`;
    const rewards = {};
    Object.entries(raw.rewards || {}).forEach(([key, reward]) => {
      const receiptId = raw.version === 1
        ? key
        : raw.key
          ? `${run.missionId || ""}:${run.difficultyId || ""}:${raw.key}:${key}`
          : key;
      if (receiptId.startsWith(prefix)) rewards[receiptId] = reward;
    });
    const next = { version: 1, key: focusId, rewards };
    const changed = JSON.stringify(next) !== JSON.stringify(raw);
    state._localRunState = next;
    return changed;
  }

  return {
    migrateDifficulties, recoverBrokenDungeonState, rollbackPendingNode,
    recoverOrphanedBattleNode, migrateRunReceipts,
  };
})();
