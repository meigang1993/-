window.GameStoreMainCopyInspection = ({ migrate }) => {
  const { validateRaw, validateMigrated } = window.GameStoreSaveLimits;

  function clone(state) {
    return JSON.parse(JSON.stringify(state));
  }

  function summary(state) {
    const total = GameData.characters.length;
    const unlocked = (state.chars || [])
      .filter(character => !character.locked).length;
    const party = (state.party || [])
      .map(id => state.chars?.find(character => character.id === id)?.name)
      .filter(Boolean)
      .join("、");
    return {
      time: new Date(state.updatedAt || Date.now())
        .toLocaleString("zh-CN", { hour12: false }),
      unlocked,
      total,
      party,
      gold: state.resources?.gold || 0,
      essence: state.resources?.essence || 0,
    };
  }

  function inspectCopy(raw) {
    if (raw === null || raw === undefined) {
      return { data: null, summary: null, corrupt: false };
    }
    try {
      if (!validateRaw(raw)) throw new Error("INVALID_SAVE_STRUCTURE");
      const data = migrate(clone(raw));
      if (!validateMigrated(data)) throw new Error("INVALID_MIGRATED_SAVE");
      return { data, summary: summary(data), corrupt: false };
    } catch (error) {
      return { data: null, summary: null, corrupt: true, error };
    }
  }

  return { inspectCopy };
};
