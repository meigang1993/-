window.BountyTasks = (() => {
  const { prepareTask, ensureReward, ensureBonus } = window.BountyTaskRewards;
  const maxCount = state => state.flags?.orcDungeonUnlocked ? 10
    : (state.defeatedElites || []).includes("shark_captain_mordio") ? 7 : 4;
  const generator = window.BountyTaskGenerator({ prepareTask });
  const repair = window.BountyTaskRepair({
    maxCount,
    ensureReward,
    ensureBonus,
    generator,
  });
  return {
    maxCount,
    ensure: repair.ensure,
    accepted: repair.accepted,
    generate: generator.generate,
    usedTargets: generator.usedTargets,
    prepareTask,
    ensureReward,
    ensureBonus,
  };
})();
