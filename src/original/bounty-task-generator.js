window.BountyTaskGenerator = ({ prepareTask }) => {
  const sample = (list, state) => window.GameRandom.sample(list, state);

  function availableMissions(state) {
    const flags = state.flags || {};
    return (GameData.missions || []).filter(mission =>
      mission.kind === "dungeon" && (!mission.requiresFlag || flags[mission.requiresFlag]));
  }

  const knownMission = missionId =>
    (GameData.missions || []).some(mission =>
      mission.id === missionId && mission.kind === "dungeon");
  const crossMissionBosses = state =>
    (state.defeatedElites || []).includes("shark_captain_mordio");
  const huntTarget = task => (GameData.enemies?.[task?.missionId] || [])
    .find(enemy => enemy.id === task?.targetId);
  const isBossHunt = task =>
    task?.type === "hunt" && huntTarget(task)?.type === "boss";

  function isUnlockedMission(state, missionId) {
    return availableMissions(state).some(mission => mission.id === missionId);
  }

  function validHunt(state, task) {
    const target = huntTarget(task);
    return !!(target && ["elite", "boss"].includes(target.type)
      && window.BountyRewards.hasHuntDrop(target.id)
      && (task.accepted || isUnlockedMission(state, task.missionId)));
  }

  function isUnlockedBond(state, task) {
    return knownMission(task?.missionId)
      && (task?.accepted || isUnlockedMission(state, task?.missionId))
      && (state.chars || []).some(character =>
        character.id === task?.charId && !character.locked);
  }

  function usedTargets(state) {
    const hunt = new Set((state.bounties || [])
      .filter(task => task?.type === "hunt").map(task => task.targetId));
    hunt.bossMissions = new Set((state.bounties || [])
      .filter(isBossHunt).map(task => task.missionId));
    return {
      hunt,
      bond: new Set((state.bounties || [])
        .filter(task => task?.type === "bond").map(task => task.charId)),
    };
  }

  function huntTask(state, used = new Set()) {
    const missions = availableMissions(state).map(mission => mission.id);
    const bossMissions = used.bossMissions || new Set(
      (state.bounties || []).filter(isBossHunt).map(task => task.missionId));
    const pool = missions.flatMap(missionId =>
      (GameData.enemies[missionId] || [])
        .filter(enemy => ["elite", "boss"].includes(enemy.type)
          && window.BountyRewards.hasHuntDrop(enemy.id)
          && !used.has(enemy.id)
          && (enemy.type !== "boss"
            || !bossMissions.has(missionId)
              && (crossMissionBosses(state) || !bossMissions.size)))
        .map(enemy => ({ ...enemy, missionId })));
    const target = sample(pool, state);
    const missionId = target?.missionId;
    if (!target) return null;
    used.add(target.id);
    if (target.type === "boss") bossMissions.add(missionId);
    return prepareTask({
      id: uid(state),
      type: "hunt",
      accepted: false,
      missionId,
      targetId: target.id,
      targetName: target.name,
      targetType: target.type,
    }, state);
  }

  function bondTask(state, used = new Set()) {
    const all = Array.isArray(state.chars) ? state.chars : [];
    const pool = all.filter(character => !character.locked && !used.has(character.id));
    const missions = availableMissions(state).map(mission => mission.id);
    const character = sample(pool, state);
    const missionId = sample(missions, state);
    if (!character || !missionId) return null;
    used.add(character.id);
    return prepareTask({
      id: uid(state),
      type: "bond",
      accepted: false,
      missionId,
      charId: character.id,
      charName: character.name,
    }, state);
  }

  function generate(state, used = usedTargets(state)) {
    const preferHunt = window.GameRandom.chance(.55, state);
    return preferHunt
      ? huntTask(state, used.hunt) || bondTask(state, used.bond)
      : bondTask(state, used.bond) || huntTask(state, used.hunt);
  }

  function uid(state) {
    return window.GameRandom.persistentId("b", state);
  }

  return {
    generate,
    huntTarget,
    isBossHunt,
    validHunt,
    isUnlockedBond,
    usedTargets,
  };
};
