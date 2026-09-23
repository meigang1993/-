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
    if (!gold && !essence && !cards.length && !relics.length) return null;
    return {
      nodeId, gold, essence,
      experience: Math.max(0, Math.floor(Number(raw.experience) || 0)),
      progression: Array.isArray(raw.progression) ? raw.progression : [],
      cards, relics,
    };
  }

  function rewardFromSettlement(result, state, nodeId, before) {
    const core = result.result?.core;
    const direct = [core?.lastLocalReward, result.result?.lastLocalReward, result.result?.reward]
      .map(raw => normalizeReward(raw, nodeId)).find(Boolean);
    if (direct) return direct;
    const ledger = Object.values(state?._localRunState?.rewards || {})
      .map(raw => normalizeReward(raw, nodeId)).find(Boolean);
    if (ledger) return ledger;
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
