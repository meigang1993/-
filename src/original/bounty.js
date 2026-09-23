window.BountySystem = (() => {
  const tasks = window.BountyTasks;

  function acceptTask(state, id) {
    tasks.ensure(state);
    const task = state.bounties.find(candidate => candidate.id === id);
    if (!task || task.accepted || tasks.accepted(state, true).length >= tasks.maxCount(state)) return false;
    task.accepted = true;
    task.failed = false;
    return task;
  }

  function abandonTask(state, id) {
    const task = state.bounties?.find(candidate => candidate.id === id);
    if (!task) return false;
    task.accepted = false;
    task.failed = false;
    return task;
  }

  function failRun(state, missionId, fallenIds = [], failedFocusId = "", reason = "副本未完成") {
    tasks.ensure(state);
    const used = tasks.usedTargets(state);
    state.bounties = state.bounties.map(task => {
      const acceptedFailure = task.accepted && (task.type === "hunt"
        || task.type === "bond" && (!fallenIds.length || fallenIds.includes(task.charId)));
      if (task.missionId !== missionId || (!acceptedFailure && !task.failed)) return task;
      if (acceptedFailure) state.log.unshift(`任务失败：${title(task)}（${reason}），已刷新任务。`);
      return tasks.generate(state, used);
    }).filter(Boolean);
    tasks.ensure(state);
    if (failedFocusId) {
      const suffix = `:${failedFocusId}`;
      state.pendingBountyRewards = (state.pendingBountyRewards || [])
        .filter(item => !String(item?.receiptKey || "").endsWith(suffix));
    }
  }

  function markFallen(state, fallenIds) {
    const run = state.explore;
    if (!run || !fallenIds.length) return;
    tasks.accepted(state)
      .filter(task => task.type === "bond" && task.missionId === run.missionId
        && fallenIds.includes(task.charId))
      .forEach(task => {
        task.accepted = false;
        task.failed = true;
        state.log.unshift(`任务失败：${task.charName}在副本中被击倒。`);
      });
  }

  function completeBattle(state, battle, run = state.explore) {
    if (!run || !battle?.defeatedEnemyIds) return;
    battle.defeatedEnemyIds.forEach(id => completeMatching(state,
      task => task.type === "hunt" && task.missionId === run.missionId && task.targetId === id, run));
  }

  function completeDungeon(state, run) {
    if (!run?.complete) return;
    completeMatching(state, task =>
      task.type === "bond" && task.missionId === run.missionId
      && run.party?.includes(task.charId) && run.activeParty?.includes(task.charId), run);
  }

  function completeMatching(state, predicate, run = state.explore) {
    tasks.ensure(state);
    state.bounties.forEach((task, index) => {
      if (!task.accepted || !predicate(task)) return;
      queueReward(state, task, run);
      state.bounties[index] = tasks.generate(state) || null;
    });
    state.bounties = state.bounties.filter(Boolean);
  }

  function queueReward(state, task, run) {
    const reward = tasks.ensureReward(task, state).reward;
    if (!reward) return;
    const bonusGold = tasks.ensureBonus(task, state).bonusGold || 0;
    state.pendingBountyRewards = state.pendingBountyRewards || [];
    const receiptKey = `${task.id}:${run?.focusId || "run"}`;
    if (state.pendingBountyRewards.some(item => item?.receiptKey === receiptKey)) return;
    state.pendingBountyRewards.push({
      receiptKey, taskTitle: title(task), taskType: task.type,
      targetId: task.targetId, missionId: task.missionId, reward, bonusGold,
    });
    state.log.unshift(`任务完成：${title(task)}，获得${window.BountyRewards.rewardText(reward)}${bonusGold ? `、莉莉丝元+${bonusGold}` : ""}，奖励自动结算中。`);
  }

  function title(task) { return window.BountyRender.title(task); }
  function render(state) {
    return window.BountyRender.render(state, {
      ensure: tasks.ensure,
      accepted: tasks.accepted,
      ensureReward: tasks.prepareTask,
      maxCount: tasks.maxCount,
    });
  }
  function markMapNode(node, task) {
    if (node && task) node.bounty = { type: task.type, title: title(task) };
  }
  return {
    ensure: tasks.ensure, render, acceptTask, abandonTask,
    completeBattle, completeDungeon, failRun, markFallen,
    claimPending: window.BountyRewards.claimPending, markMapNode,
    title, maxCount: tasks.maxCount,
  };
})();
