window.GameStoreSettingsState = (defaults) => {
  const { normalize, validStored } = window.GameStoreSettingsSchema(defaults);
  let pending = null;
  let intentId = 0;
  let latestIntentId = 0;
  let current = {
    state: "idle",
    source: "default",
    cloudUnknown: false,
    localAvailable: false,
    error: null,
    pending: false,
  };

  function createIntent(settings) {
    const intent = { id: ++intentId, settings: normalize(settings) };
    latestIntentId = intent.id;
    return intent;
  }

  function update(next) {
    current = { ...current, ...next, pending: !!pending };
  }

  function beginLoad() {
    update({ state: "loading", error: null });
  }

  function beginSync() {
    update({
      state: "syncing",
      cloudUnknown: false,
      error: null,
    });
  }

  function ready(data, source, localAvailable) {
    const settings = normalize(data);
    update({
      state: pending ? "error" : "ready",
      source,
      cloudUnknown: false,
      localAvailable,
      error: pending ? "SETTINGS_SYNC_PENDING" : null,
    });
    return settings;
  }

  function failed(local, code, cloudUnknown) {
    update({
      state: "error",
      source: local ? "local" : "default",
      cloudUnknown,
      localAvailable: !!local,
      error: code,
    });
    return normalize(local);
  }

  function stage(intent) {
    if (!pending || intent.id >= pending.id) {
      pending = { id: intent.id, settings: normalize(intent.settings) };
    }
    update({});
    return pending.settings;
  }

  function saveFailed(intent, localAvailable) {
    if (intent.id < latestIntentId) {
      if (pending) update({ state: "error", error: "SETTINGS_SYNC_PENDING" });
      return false;
    }
    pending = { id: intent.id, settings: normalize(intent.settings) };
    update({
      state: "error",
      source: localAvailable ? "local" : current.source,
      cloudUnknown: false,
      localAvailable: localAvailable || current.localAvailable,
      error: "SETTINGS_SAVE_FAILED",
    });
    return true;
  }

  function saved(intent, source, localAvailable) {
    if (pending && pending.id <= intent.id) pending = null;
    return ready(
      intent.settings, source, localAvailable || current.localAvailable
    );
  }

  function reset() {
    pending = null;
    latestIntentId = intentId;
    current = {
      state: "idle",
      source: "default",
      cloudUnknown: false,
      localAvailable: false,
      error: null,
      pending: false,
    };
  }

  return {
    normalize,
    validStored,
    createIntent,
    beginLoad,
    beginSync,
    ready,
    failed,
    stage,
    saveFailed,
    saved,
    reset,
    pendingIntent: () => pending
      ? { id: pending.id, settings: { ...pending.settings } } : null,
    blocksWrites: () => ["loading", "syncing", "error"].includes(current.state),
    status: () => ({ ...current }),
  };
};
