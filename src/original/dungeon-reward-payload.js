window.DungeonRewardPayload = (() => {
  const emptyPending = () => ({ gold: 0, essence: 0, cards: [], relics: [] });

  function pendingSnapshot(state) {
    const pending = state?._localPendingRun || emptyPending();
    return {
      gold: Number(pending.gold) || 0,
      essence: Number(pending.essence) || 0,
      cards: Array.isArray(pending.cards) ? [...pending.cards] : [],
      relics: Array.isArray(pending.relics) ? [...pending.relics] : [],
    };
  }

  function normalizeReward(raw, nodeId) {
    if (!raw || raw.nodeId !== nodeId) return null;
    const gold = Number(raw.gold);
    const essence = Number(raw.essence);
    if (!Number.isFinite(gold) || gold < 0
      || !Number.isFinite(essence) || essence < 0) return null;
    const cards = Array.isArray(raw.cards) ? raw.cards : [];
    const relics = Array.isArray(raw.relics) ? raw.relics : [];
    // 首次击败精英/BOSS 的入池提示由服务端随奖励回传，不能因奖励数值为空被丢弃。
    const notices = Array.isArray(raw.notices) ? raw.notices.filter(item => typeof item === "string" && item) : [];
    if (!gold && !essence && !cards.length && !relics.length && !notices.length) return null;
    return {
      nodeId, gold, essence,
      experience: Math.max(0, Math.floor(Number(raw.experience) || 0)),
      progression: Array.isArray(raw.progression) ? raw.progression : [],
      cards, relics, notices,
    };
  }

  // 首次击败精英/BOSS 的入池提示由服务端随奖励回传（lastLocalReward.notices）。
  // 写在这里而非结算调用点，是为了任何消费奖励的路径都能看到提示；
  // 重试会再次回传同一批 notices，用 state 上的已展示清单去重。
  function showNotices(state, notices) {
    if (!Array.isArray(notices) || !notices.length) return;
    const shown = (state._shownUnlockNotices ||= []);
    notices.forEach(text => {
      if (typeof text !== "string" || !text || shown.includes(text)) return;
      shown.push(text);
      state.log?.unshift?.(text);
    });
  }

  function rewardFromSettlement(result, state, nodeId, before) {
    const core = result.result?.core;
    const direct = [core?.lastLocalReward, result.result?.lastLocalReward, result.result?.reward]
      .map(raw => normalizeReward(raw, nodeId)).find(Boolean);
    if (direct) { showNotices(state, direct.notices); return direct; }
    const ledger = Object.values(state?._localRunState?.rewards || {})
      .map(raw => normalizeReward(raw, nodeId)).find(Boolean);
    if (ledger) { showNotices(state, ledger.notices); return ledger; }
    const after = pendingSnapshot(state);
    const gold = after.gold - before.gold;
    const essence = after.essence - before.essence;
    const cards = after.cards.slice(before.cards.length);
    const relics = after.relics.slice(before.relics.length);
    if (gold < 0 || essence < 0
      || (!gold && !essence && !cards.length && !relics.length)) return null;
    return { nodeId, gold, essence, experience: 0, progression: [], cards, relics };
  }

  function missingReward(state, nodeId) {
    const message = `副本奖励返回异常（节点${nodeId}），结算已暂停，请重试。`;
    console.error(message);
    state.log?.unshift?.(message);
    window.dzmm?.toast?.error?.(message);
  }

  return { missingReward, pendingSnapshot, rewardFromSettlement };
})();
