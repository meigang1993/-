window.GameStoreMainSaveQueue = ({
  key, putLocalRaw, putCloudRaw, isStale, noteSaveMeta,
  markDirty, clearDirtyThrough, onSaved, onError,
}) => {
  const pendingJobs = [];
  const support = window.GameStoreMainSaveSupport({ key });
  const writer = window.GameStoreMainSaveWriter({
    key,
    putLocalRaw,
    putCloudRaw,
    isStale,
    noteSaveMeta,
    clearDirtyThrough,
    onSaved,
    saveFailure: support.saveFailure,
  });
  return window.GameStoreMainSaveScheduler({
    key,
    putLocalRaw,
    isStale,
    noteSaveMeta,
    markDirty,
    clearDirtyThrough,
    onSaved,
    onError,
    ...support,
    ...writer,
    pendingJobs,
  });
};
