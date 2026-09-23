window.GameStoreSettingsWriter = ({
  key, read, putLocalRaw, putCloudRaw, settingsError,
}) => {
  let version = 0;

  function updateVersion(data) {
    version = Math.max(version, Number(data?._saveVersion) || 0);
  }

  const queue = window.GameStorePauseQueue(async task => {
    const { data, localDeferred } = task;
    if (!window.dzmm?.kv?.put) {
      if (!putLocalRaw(key, data)) throw new Error("SETTINGS_SAVE_FAILED");
      return data.settings;
    }
    const savedCloud = await putCloudRaw(key, data, { flush: true });
    if (!savedCloud) throw new Error("SETTINGS_SAVE_FAILED");
    if (localDeferred) putLocalRaw(key, data);
    return data.settings;
  });

  function trackSave(
    task, intent, source, successLocalAvailable, failureLocalAvailable
  ) {
    return Promise.resolve(task).then(
      () => read.saved(intent, source, successLocalAvailable),
      error => {
        const current = read.saveFailed(intent, failureLocalAvailable);
        throw settingsError(
          current ? "SETTINGS_SAVE_FAILED" : "SETTINGS_SAVE_SUPERSEDED",
          error
        );
      }
    );
  }

  function save(settings, options = {}) {
    const intent = options.intent || read.createIntent(settings);
    const normalized = intent.settings;
    if (read.blocksWrites() && options.allowBlocked !== true) {
      read.stage(intent);
      const status = read.status();
      return Promise.reject(settingsError(
        status.state === "loading" ? "SETTINGS_LOAD_PENDING"
          : status.cloudUnknown ? "SETTINGS_CLOUD_UNKNOWN"
            : "SETTINGS_SYNC_REQUIRED"
      ));
    }
    const data = {
      updatedAt: Date.now(),
      _saveVersion: ++version,
      settings: normalized,
    };
    const savedLocal = queue.isPaused() ? false : putLocalRaw(key, data);
    const cloudAvailable = !!window.dzmm?.kv?.put;
    if (!cloudAvailable) {
      const task = queue.isPaused()
        ? queue.enqueue({ data, localDeferred: true })
        : savedLocal ? Promise.resolve(data.settings)
          : Promise.reject(new Error("SETTINGS_SAVE_FAILED"));
      return trackSave(task, intent, "local", true, savedLocal);
    }
    return trackSave(
      queue.enqueue({ data, localDeferred: queue.isPaused() }),
      intent, "cloud", savedLocal, savedLocal
    );
  }

  return {
    updateVersion,
    save,
    pause: queue.pause,
    resume: queue.resume,
  };
};
