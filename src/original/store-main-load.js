window.GameStoreMainLoad = ({ freshState, migrate, noteSaveMeta, noteLoadRecovery }) => {
  const { key, getRawDetails } = window.GameStoreIO;
  const { inspectCopy } = window.GameStoreMainCopyInspection({ migrate });
  function storageUnavailable() {
    const error = new Error("STORAGE_UNAVAILABLE");
    error.code = "STORAGE_UNAVAILABLE";
    return error;
  }
  function requireReadable(details) {
    if (!details.cloudAvailable && details.localUnavailable) throw storageUnavailable();
    return details;
  }
  async function load() {
    const details = requireReadable(await getRawDetails(key, {
      strictCloud: true,
      allowLocalOnCloudFailure: true,
    }));
    const local = details.localCorrupt
      ? { data: null, corrupt: true, error: details.localError }
      : inspectCopy(details.local);
    const cloud = details.cloudCorrupt
      ? { data: null, corrupt: true, error: details.cloudInvalidError }
      : inspectCopy(details.cloud);
    if (details.cloudReadFailed) {
      if (!local.data) throw details.cloudError;
      noteLoadRecovery(null);
      noteSaveMeta(local.data);
      return local.data;
    }
    const valid = [
      { source: "local", copy: local, exists: details.localExists },
      { source: "cloud", copy: cloud, exists: details.cloudExists },
    ].filter(item => item.copy.data);
    if (!valid.length) {
      noteLoadRecovery(null);
      if (!details.localExists && !details.cloudExists) return freshState();
      throw new Error("主存档副本均已损坏，请使用读档或新建游戏恢复");
    }
    const selected = valid.find(item => item.source === details.source) || valid[0];
    const damaged = [
      local.corrupt ? "local" : null,
      cloud.corrupt ? "cloud" : null,
    ].filter(Boolean);
    const stale = details.conflict && valid.length === 2
      ? selected.source === "local" ? "cloud" : "local"
      : null;
    noteLoadRecovery(damaged.length || stale
      ? { source: damaged[0] || stale, data: selected.copy.data }
      : null);
    const loaded = selected.copy.data;
    noteSaveMeta(loaded);
    return loaded;
  }
  async function hasMainSave() {
    const details = requireReadable(await getRawDetails(key, {
      strictCloud: true,
      allowLocalOnCloudFailure: true,
    }));
    if (details.cloudReadFailed && !details.localExists) throw details.cloudError;
    return !!(details.localExists || details.cloudExists);
  }
  return { load, hasMainSave, requireReadable, inspectCopy };
};
