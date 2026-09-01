window.DungeonSystem = (() => {
  const events = () => window.DungeonEvents;
  const rewards = () => window.DungeonRewards;
  return {
    createFocusId: (missionId, difficultyId = "normal", state = window.state) =>
      events().createFocusId(missionId, difficultyId, state),
    start: (state, missionId, difficultyId = "normal", runId = "") => events().start(state, missionId, difficultyId, runId),
    plan: (run) => events().plan(run),
    applyServerPlan: (run, plan, state) => events().applyServerPlan(run, plan, state),
    restoreServerRun: (state, plan, pendingRun) => events().restoreServerRun(state, plan, pendingRun),
    enter: (state, id) => events().enter(state, id),
    rollbackPending: (state, expectedNodeId = "") => events().rollbackPending(state, expectedNodeId),
    completeBattle: (state, win) => rewards().completeBattle(state, win),
    chest: (state) => rewards().chest(state),
    rest: (state, full) => rewards().rest(state, full),
    retreat: (state) => rewards().retreat(state),
    finish: (state) => rewards().finish(state),
    fail: (state) => rewards().fail(state),
    confirmReward: (state) => rewards().confirmReward(state),
    render: (state) => events().render(state),
    rewardPopup: (run) => events().rewardPopup(run),
  };
})();
