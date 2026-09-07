window.DungeonRewards = (() => {
  const nodes = window.DungeonNodeRewards;
  const run = window.DungeonRunRewards;

  function confirmReward(state) {
    if (!state.explore) return;
    state.explore.rewardPopup = null;
  }

  return {
    completeBattle: nodes.completeBattle,
    chest: nodes.chest,
    rest: run.rest,
    retreat: run.retreat,
    finish: run.finish,
    fail: run.fail,
    confirmReward,
    rewardText: run.rewardText,
    retryPending: nodes.retryPending,
    pendingCount: window.SettlementRecovery.count,
  };
})();
