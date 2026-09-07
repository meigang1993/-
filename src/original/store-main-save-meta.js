window.GameStoreMainSaveMeta = notifyStatus => {
  let dirtySave = null;
  let saveError = null;
  let mainSaveVersion = 0;
  let latestSaveMeta = null;
  let loadRecovery = null;

  function safeNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }
  function clone(value) {
    return typeof structuredClone === "function"
      ? structuredClone(value)
      : JSON.parse(JSON.stringify(value));
  }
  function compare(left, right) {
    const versionDiff = safeNumber(left?._saveVersion) - safeNumber(right?._saveVersion);
    return versionDiff || safeNumber(left?.updatedAt) - safeNumber(right?.updatedAt);
  }
  function note(data, options = {}) {
    if (latestSaveMeta && compare(data, latestSaveMeta) < 0) return;
    const next = options.isolated ? data : clone(data);
    latestSaveMeta = {
      updatedAt: safeNumber(data?.updatedAt),
      _saveVersion: safeNumber(data?._saveVersion),
      data: next,
    };
    mainSaveVersion = latestSaveMeta._saveVersion;
  }
  function reserveVersion(value) {
    mainSaveVersion = Math.max(mainSaveVersion, safeNumber(value));
  }
  function noteRecovery(recovery) {
    loadRecovery = recovery ? { source: recovery.source, data: clone(recovery.data) } : null;
  }
  function markDirty(data, error) {
    if (dirtySave && compare(data, dirtySave) < 0) return saveError;
    dirtySave = data;
    saveError = error;
    return saveError;
  }
  function clearDirtyThrough(data) {
    if (dirtySave && compare(data, dirtySave) < 0) return false;
    const changed = !!dirtySave;
    dirtySave = null;
    saveError = null;
    return changed;
  }
  function reset(snapshot) {
    dirtySave = null;
    saveError = null;
    latestSaveMeta = null;
    mainSaveVersion = 0;
    loadRecovery = null;
    note(snapshot);
  }
  function status(syncing) {
    return {
      dirty: !!dirtySave, syncing,
      error: saveError?.message || "", storage: saveError?.storage || "",
      recovery: loadRecovery?.source || "",
    };
  }

  return {
    clone, compare, note, reserveVersion, noteRecovery, markDirty, clearDirtyThrough,
    isStale: data => !!latestSaveMeta && compare(data, latestSaveMeta) < 0,
    version: () => mainSaveVersion,
    latest: () => latestSaveMeta?.data || null,
    recovery: () => loadRecovery,
    clearRecovery: () => { loadRecovery = null; },
    dirty: () => dirtySave,
    reset, status, notifyStatus,
  };
};
