window.GameStoreMainSaveWriter = ({
  key,
  putLocalRaw,
  putCloudRaw,
  isStale,
  noteSaveMeta,
  clearDirtyThrough,
  onSaved,
  saveFailure,
}) => {
  async function saveMainSnapshot(data, opts = {}) {
    const cloudAvailable = !!window.dzmm?.kv?.put;
    const savedCloud = cloudAvailable ? await putCloudRaw(key, data, opts) : false;
    if (cloudAvailable && !savedCloud && opts.deferLocalUntilCloud) {
      const results = {
        key,
        local: { attempted: false, ok: null },
        cloud: { attempted: true, ok: false },
      };
      throw saveFailure("cloud", results);
    }
    noteSaveMeta(data, { isolated: true });
    const savedLocal = isStale(data) || opts.localSaved
      ? true
      : putLocalRaw(key, data, { validated: opts.validated === true });
    const results = {
      key,
      local: { attempted: true, ok: savedLocal },
      cloud: { attempted: cloudAvailable, ok: cloudAvailable ? savedCloud : null },
    };
    if (cloudAvailable && !savedCloud) {
      const error = saveFailure(savedLocal ? "cloud" : "both", results);
      error.code = savedLocal ? "SAVE_PARTIAL" : "SAVE_FAILED";
      throw error;
    }
    if (!cloudAvailable && !savedLocal) throw saveFailure("local", results);
    const dirtyCleared = clearDirtyThrough(data);
    onSaved(dirtyCleared);
    return results;
  }

  return { saveMainSnapshot };
};
