window.StoreMigrationsCharacters = deps => {
  const {
    markForSave, characterProgressionVersion, characterGrowthVersion,
  } = deps;

  function finishCharacterMigration(state, migrateProgression, migrateGrowth) {
    const progressionRepaired =
      state.chars.some(character => character.progressionRepaired);
    state.chars.forEach(character => {
      delete character.progressionRepaired;
    });
    if (migrateProgression) {
      state.flags.characterProgressionVersion = characterProgressionVersion;
      delete state.flags.characterStatResetVersion;
      markForSave(state);
    }
    if (migrateGrowth) {
      state.flags.characterGrowthVersion = characterGrowthVersion;
      markForSave(state);
    }
    if (progressionRepaired) markForSave(state);
    if (migrateProgression) {
      state.log = [
        "角色成长系统已更新：原有等级已保留，手动加点已移除，当前等级经验从0开始。",
        ...(state.log || []),
      ].slice(0, 30);
    } else if (migrateGrowth) {
      state.log = [
        "角色成长已调整：等级与经验保留，核心属性已重算，当前生命按原比例调整。",
        ...(state.log || []),
      ].slice(0, 30);
    }
  }

  return { finishCharacterMigration };
};
