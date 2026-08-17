window.BountyTaskRepair = ({
  maxCount,
  ensureReward,
  ensureBonus,
  generator,
}) => {
  const { rebuildCard, safeId } = window.GameStoreSaveSchema;
  function cleanReward(reward) {
    if (!reward || typeof reward !== "object" || Array.isArray(reward)) return null;
    if (reward.type === "card") {
      const card = rebuildCard(reward.card);
      return card ? { type: "card", card } : null;
    }
    if (reward.type === "relic") {
      const relic = window.RelicSystem?.data?.(reward.relic)?.name;
      return relic ? { type: "relic", relic } : null;
    }
    const essence = Number(reward.essence);
    return reward.type === "essence" && Number.isInteger(essence)
      && essence >= 0 && essence <= 7 ? { type: "essence", essence } : null;
  }
  function cleanTask(task, state) {
    if (!task || typeof task !== "object" || Array.isArray(task)
      || !safeId(task.id) || !safeId(task.missionId)) return null;
    const common = {
      id: task.id,
      type: task.type,
      accepted: task.accepted === true,
      failed: task.failed === true,
      missionId: task.missionId,
    };
    const reward = cleanReward(task.reward);
    if (reward) common.reward = reward;
    if (Number.isFinite(Number(task.bonusGold))) common.bonusGold = Math.floor(Number(task.bonusGold));
    if (task.type === "hunt" && safeId(task.targetId)) {
      const target = generator.huntTarget(task);
      return target ? {
        ...common, targetId: target.id, targetName: target.name, targetType: target.type,
      } : null;
    }
    if (task.type !== "bond" || !safeId(task.charId)) return null;
    const character = (state.chars || [])
      .find(candidate => candidate.id === task.charId);
    return character ? { ...common, charId: character.id, charName: character.name } : null;
  }

  function repairDuplicateTasks(state) {
    const seen = { hunt: new Set(), bond: new Set() };
    const used = generator.usedTargets(state);
    const bossMissions = new Set();
    const repaired = new Array(state.bounties.length);
    state.bounties.map((task, index) => ({ task, index }))
      .sort((left, right) =>
        Number(!!right.task?.accepted) - Number(!!left.task?.accepted))
      .forEach(({ task, index }) => {
        if (task?.type === "hunt") {
          const target = generator.huntTarget(task);
          const boss = target?.type === "boss";
          const crossMission = (state.defeatedElites || [])
            .includes("shark_captain_mordio");
          const extraBoss = boss && (bossMissions.has(task.missionId)
            || !crossMission && bossMissions.size);
          if (!seen.hunt.has(task.targetId)
            && (!extraBoss || task.accepted)
            && generator.validHunt(state, task)) {
            task.targetName = target.name;
            task.targetType = target.type;
            seen.hunt.add(task.targetId);
            if (boss) bossMissions.add(task.missionId);
            repaired[index] = task;
          } else repaired[index] = generator.generate(state, used);
          return;
        }
        if (task?.type === "bond") {
          const character = (state.chars || [])
            .find(candidate => candidate.id === task.charId && !candidate.locked);
          if (!seen.bond.has(task.charId) && generator.isUnlockedBond(state, task)) {
            task.charName = character.name;
            seen.bond.add(task.charId);
            repaired[index] = task;
          } else repaired[index] = generator.generate(state, used);
          return;
        }
        repaired[index] = generator.generate(state, used);
      });
    state.bounties = repaired.filter(Boolean);
  }

  function ensure(state) {
    const max = maxCount(state);
    state.bounties = Array.isArray(state.bounties)
      ? state.bounties.slice(0, max).map(task => cleanTask(task, state)).filter(Boolean)
      : [];
    state.bounties.forEach(task => {
      ensureReward(task, state);
      ensureBonus(task, state);
    });
    repairDuplicateTasks(state);
    while (state.bounties.length < max) {
      const task = generator.generate(state);
      if (!task) break;
      state.bounties.push(task);
    }
    state.pendingBountyRewards ||= [];
  }

  function accepted(state, ready = false) {
    if (!ready) ensure(state);
    return state.bounties.filter(task => task.accepted);
  }

  return { ensure, accepted };
};
