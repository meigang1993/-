window.GameStoreMainSnapshot = ({ meta }) => {
  const { stripTemporaryCards, compactSaveData } = window.GameStoreCompact;
  const { validateRaw, validateMigrated } = window.GameStoreSaveLimits;

  function invalidSnapshot() {
    const error = new Error("INVALID_SAVE_STRUCTURE");
    error.code = "INVALID_SAVE_STRUCTURE";
    return error;
  }

  function safeNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  function cloneRuntimeState(state, options = {}) {
    if (!options.trusted && !validateMigrated(state)) throw invalidSnapshot();
    try {
      return meta.clone(state);
    } catch (_) {
      throw invalidSnapshot();
    }
  }

  function finalizeSaveSnapshot(snapshot) {
    const battle = window.BattleSaveCheckpoint?.snapshot?.(snapshot, { inPlace: true });
    if (battle) delete snapshot.battle;
    const data = compactSaveData(stripTemporaryCards(snapshot));
    if (battle) data.battle = battle;
    if (!validateRaw(data)) throw invalidSnapshot();
    return data;
  }

  function prepareSaveSnapshot(state, options = {}) {
    const updatedAt = Math.max(Date.now(), safeNumber(state.updatedAt) + 1);
    const saveVersion = Math.max(
      meta.version() + 1,
      safeNumber(state._saveVersion) + 1,
    );
    const snapshot = cloneRuntimeState(state, options);
    delete snapshot._saveHeads;
    snapshot.updatedAt = updatedAt;
    snapshot._saveVersion = saveVersion;
    const data = finalizeSaveSnapshot(snapshot);
    meta.reserveVersion(saveVersion);
    state.updatedAt = updatedAt;
    state._saveVersion = saveVersion;
    return data;
  }

  return { cloneRuntimeState, finalizeSaveSnapshot, prepareSaveSnapshot };
};
