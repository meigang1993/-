window.GameStoreSettings = (() => {
  const key = window.GameStoreIO.settingsKey;
  const {
    compareRaw, getLocalDetails, getRawDetails, putLocalRaw, putCloudRaw,
  } = window.GameStoreIO;
  const read = window.GameStoreSettingsState({
    sfxVolume: 80, musicVolume: 80, battleSpeed: 1, manualResponse: false,
  });
  const { normalize } = read;
  let loadId = 0;
  let generation = 0;

  function settingsError(code, cause = null) {
    const error = new Error(code);
    error.code = code;
    if (cause) error.cause = cause;
    return error;
  }

  const writer = window.GameStoreSettingsWriter({
    key, read, putLocalRaw, putCloudRaw, settingsError,
  });

  function useReadFailure(local, code, cause, requireCloud, cloudUnknown = true) {
    writer.updateVersion(local);
    const settings = read.failed(local, code, cloudUnknown);
    if (!local || requireCloud) throw settingsError(code, cause);
    return settings;
  }

  async function load(options = {}) {
    const requireCloud = options.requireCloud === true;
    const requestId = ++loadId;
    const requestGeneration = generation;
    read.beginLoad();
    let details;
    try {
      details = await getRawDetails(key, {
        strictCloud: true,
        allowLocalOnCloudFailure: true,
      });
    } catch (error) {
      if (requestId !== loadId || requestGeneration !== generation) {
        throw settingsError("SETTINGS_LOAD_STALE", error);
      }
      const local = getLocalDetails(key).value;
      return useReadFailure(
        read.validStored(local) ? local : null,
        "SETTINGS_LOAD_FAILED", error, requireCloud
      );
    }
    if (requestId !== loadId || requestGeneration !== generation) {
      throw settingsError("SETTINGS_LOAD_STALE");
    }
    const local = read.validStored(details.local) ? details.local : null;
    const cloud = read.validStored(details.cloud) ? details.cloud : null;
    if (details.cloudReadFailed) {
      return useReadFailure(
        local, "SETTINGS_CLOUD_LOAD_FAILED",
        details.cloudError, requireCloud
      );
    }
    if (details.cloudCorrupt || (details.cloudExists && !cloud)) {
      return useReadFailure(
        local, "SETTINGS_CLOUD_INVALID",
        details.cloudInvalidError, requireCloud, false
      );
    }
    const data = read.validStored(details.selected) ? details.selected
      : local && cloud ? (compareRaw(local, cloud) > 0 ? local : cloud)
        : local || cloud;
    writer.updateVersion(data);
    return read.ready(
      data, !data ? "default" : data === local ? "local" : "cloud",
      !!local
    );
  }

  async function retryLoad() {
    let loaded;
    try {
      loaded = await load({ requireCloud: true });
    } catch (error) {
      if (error.code !== "SETTINGS_CLOUD_INVALID") throw error;
      const localRaw = getLocalDetails(key).value;
      const local = read.validStored(localRaw) ? localRaw : null;
      const pending = read.pendingIntent();
      const repair = pending?.settings || (local ? normalize(local) : null);
      if (!repair) throw error;
      read.ready(local || repair, local ? "local" : "default", !!local);
      read.beginSync();
      return writer.save(repair, {
        allowBlocked: true,
        intent: pending || read.createIntent(repair),
      });
    }
    const pending = read.pendingIntent();
    if (!pending) return loaded;
    read.beginSync();
    return writer.save(pending.settings, { allowBlocked: true, intent: pending });
  }

  function clearMemory() {
    generation += 1;
    read.reset();
  }

  return {
    load,
    retryLoad,
    save: writer.save,
    normalize,
    status: read.status,
    clearMemory,
    pause: writer.pause,
    resume: writer.resume,
  };
})();
