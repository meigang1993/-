window.BountyTaskRewards = (() => {
  function prepareTask(task, state = window.state) { return ensureBonus(ensureReward(task, state), state); }
  function ensureReward(task, state = window.state) {
    if (task && (!task.reward || isBaseCardReward(task.reward)
      || !window.BountyRewards.matchesTask(task, task.reward))) {
      const reward = window.BountyRewards.rollReward(task, state);
      if (reward) task.reward = reward;
    }
    return task;
  }
  function ensureBonus(task, state = window.state) {
    if (!isDungeonMission(task?.missionId)) return task;
    const [min, max] = bonusRange(task.missionId);
    const gold = Number(task.bonusGold);
    if (task.accepted && isCommittedBonus(task.missionId, gold)) task.bonusGold = Math.floor(gold);
    else if (!Number.isFinite(gold) || gold < min || gold > max) {
      task.bonusGold = rollBonusGold(task.missionId, state);
    } else task.bonusGold = Math.floor(gold);
    return task;
  }
  function isCommittedBonus(missionId, gold) {
    const reward = (GameData.missions || []).find(mission => mission.id === missionId)?.reward || {};
    const ranges = [reward.bountyGoldRange, ...(reward.bountyLegacyGoldRanges || [])].filter(Boolean);
    return Number.isFinite(gold) && gold > 0
      && ranges.some(([min, max]) => gold >= min && gold <= max);
  }
  function isDungeonMission(missionId) {
    return (GameData.missions || []).some(mission => mission.id === missionId && mission.kind === "dungeon");
  }
  function bonusRange(missionId) {
    return (GameData.missions || []).find(mission => mission.id === missionId)
      ?.reward?.bountyGoldRange || [400, 1000];
  }
  function rollBonusGold(missionId, state = window.state) {
    const [min, max] = bonusRange(missionId);
    return window.GameRandom.int(min, max, state);
  }
  function isBaseCardReward(reward) {
    return reward?.type === "card"
      && (GameData.baseDeck || []).some(card => card.name === reward.card?.name);
  }
  return {
    prepareTask, ensureReward, ensureBonus, isCommittedBonus,
    isDungeonMission, bonusRange, rollBonusGold, isBaseCardReward,
  };
})();
