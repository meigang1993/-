window.GameStoreMainSave = ({ freshState, migrate }) => {
  const { key, putLocalRaw, putCloudRaw } = window.GameStoreIO;

  function notifyStatus() {
    if (!window.dispatchEvent || typeof window.Event !== "function") return;
    window.dispatchEvent(new window.Event("game-store-status"));
  }

  const meta = window.GameStoreMainSaveMeta(notifyStatus);
  const loader = window.GameStoreMainLoad({
    freshState,
    migrate,
    noteSaveMeta: meta.note,
    noteLoadRecovery: meta.noteRecovery,
  });
  const {
    queueMainSave,
    flushPending,
    isSyncing,
    pause,
    resume,
  } = window.GameStoreMainSaveQueue({
    key,
    putLocalRaw,
    putCloudRaw,
    isStale: meta.isStale,
    noteSaveMeta: meta.note,
    markDirty: meta.markDirty,
    clearDirtyThrough: meta.clearDirtyThrough,
    onSaved: dirtyCleared => {
      const changed = dirtyCleared || !!meta.recovery();
      meta.clearRecovery();
      if (changed) notifyStatus();
    },
    onError: notifyStatus,
  });
  const snapshot = window.GameStoreMainSnapshot({ meta });
  const recovery = window.GameStoreMainRecovery({
    key,
    putLocalRaw,
    meta,
    queueMainSave,
    ...snapshot,
    notifyStatus,
  });

  async function save(state, opts = {}) {
    const data = snapshot.prepareSaveSnapshot(state, { trusted: opts.trusted === true });
    const queueOptions = {
      ...opts,
      validated: true,
      isolated: true,
    };
    delete queueOptions.trusted;
    const result = await queueMainSave(data, queueOptions);
    return result;
  }

  function status() {
    return meta.status(isSyncing());
  }

  function acceptRestored(data) {
    meta.note(data);
  }

  return {
    load: loader.load,
    hasMainSave: loader.hasMainSave,
    save,
    ...recovery,
    status,
    requireReadable: loader.requireReadable,
    inspectCopy: loader.inspectCopy,
    prepareSaveSnapshot: snapshot.prepareSaveSnapshot,
    queueMainSave,
    flushPending,
    pause,
    resume,
    acceptRestored,
  };
};
