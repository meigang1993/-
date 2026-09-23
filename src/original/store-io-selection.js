window.GameStoreIOSelection = deps => {
  const { validateRaw, getLocalDetails, getCloudRaw } = deps;

  function safeNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number : 0;
  }

  function compareRaw(left, right) {
    const versionDiff = safeNumber(left?._saveVersion) - safeNumber(right?._saveVersion);
    if (versionDiff) return versionDiff;
    return safeNumber(left?.updatedAt) - safeNumber(right?.updatedAt);
  }

  async function getRawDetails(key, opts = {}) {
    const localDetails = getLocalDetails(key);
    let local = localDetails.value;
    let cloudAvailable = !!window.dzmm?.kv?.get;
    let cloud = null;
    let cloudError = null;
    let cloudInvalidError = null;
    try {
      cloud = await getCloudRaw(key, opts);
    } catch (error) {
      if (!opts.allowLocalOnCloudFailure) throw error;
      cloudError = error;
    }
    let cloudExists = cloud !== null;
    if (cloudExists && !validateRaw(cloud)) {
      cloudInvalidError = new Error("INVALID_SAVE_STRUCTURE");
      cloud = null;
    }
    const localUsable = !!local && !localDetails.corrupt;
    const cloudUsable = !!cloud && !cloudInvalidError;
    const source = !cloudUsable ? "local" : !localUsable ? "cloud"
      : compareRaw(local, cloud) > 0 ? "local" : "cloud";
    const selected = source === "local"
      ? localUsable ? local : null
      : cloudUsable ? cloud : null;
    const conflict = !!(localDetails.exists && cloudExists
      && (localDetails.corrupt || cloudInvalidError
        || JSON.stringify(local) !== JSON.stringify(cloud)));
    return {
      selected, source, conflict,
      local: localUsable ? local : null,
      cloud: cloudUsable ? cloud : null,
      cloudExists, cloudAvailable,
      cloudReadFailed: !!cloudError, cloudError, cloudInvalidError,
      localExists: localDetails.exists,
      localCorrupt: localDetails.corrupt,
      cloudCorrupt: !!cloudInvalidError,
      localUnavailable: localDetails.unavailable,
      localError: localDetails.error,
    };
  }

  async function getRaw(key) {
    return (await getRawDetails(key)).selected;
  }

  return { compareRaw, getRawDetails, getRaw };
};
