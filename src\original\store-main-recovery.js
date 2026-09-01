window.GameStoreMainRecovery = ({
  key,
  putLocalRaw,
  meta,
  queueMainSave,
  cloneRuntimeState,
  finalizeSaveSnapshot,
  prepareSaveSnapshot,
  notifyStatus,
}) => {
  function deferLoadedCloudPromotion(data) {
    const savedLocal = putLocalRaw(key, data);
    const results = {
      key,
      local: { attempted: true, ok: savedLocal },
      cloud: { attempted: false, ok: false, pending: true },
    };
    const error = new Error(savedLocal ? "SAVE_PARTIAL" : "SAVE_FAILED");
    error.code = error.message;
    error.storage = savedLocal ? "cloud" : "both";
    error.results = results;
    meta.note(data);
    throw meta.markDirty(data, error) || error;
  }

  async function promoteLoaded(state) {
    const deferCloud = state?.__slotCloudUnknown === true;
    if (deferCloud) delete state.__slotCloudUnknown;
    if (!deferCloud) return overwrite(state);
    return deferLoadedCloudPromotion(prepareSaveSnapshot(state));
  }

  async function repairMain() {
    const recovery = meta.recovery();
    if (!recovery) return true;
    const source = recovery.source;
    const snapshot = finalizeSaveSnapshot(
      cloneRuntimeState(meta.latest() || recovery.data));
    let results;
    try {
      results = await queueMainSave(snapshot, { flush: true });
    } catch (error) {
      if (!error.results?.[source]?.ok) throw error;
      results = error.results;
    }
    if (!results?.[source]?.ok) {
      const error = new Error("REPAIR_FAILED");
      error.code = "REPAIR_FAILED";
      error.storage = source;
      throw error;
    }
    meta.clearRecovery();
    return true;
  }

  async function retryDirty() {
    if (!meta.dirty()) return true;
    await queueMainSave(meta.dirty(), { flush: true });
    return true;
  }

  async function overwrite(state) {
    const data = prepareSaveSnapshot(state);
    try {
      const result = await queueMainSave(data, {
        flush: true,
        deferLocalUntilCloud: true,
      });
      if (result?.stale) {
        const error = new Error("SAVE_SUPERSEDED");
        error.code = "SAVE_SUPERSEDED";
        error.storage = "cloud";
        throw error;
      }
      return result;
    } catch (error) {
      if (error?.code === "SAVE_SUPERSEDED") {
        notifyStatus();
        throw error;
      }
      meta.markDirty(data, error);
      notifyStatus();
      throw error;
    }
  }

  function restoreCurrent(state) {
    const snapshot = finalizeSaveSnapshot(cloneRuntimeState(state));
    meta.reset(snapshot);
    notifyStatus();
    return state;
  }

  return {
    promoteLoaded,
    repairMain,
    retryDirty,
    overwrite,
    restoreCurrent,
  };
};
