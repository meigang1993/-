window.GameStoreIOMutations = deps => {
  const { validateRaw, putLocalRaw, removeLocalRaw, runMutation } = deps;

  async function putCloudRaw(key, value, opts = {}) {
    if (!validateRaw(value) || !window.dzmm?.kv?.put) return false;
    try {
      await runMutation(
        key,
        () => opts.flush
          ? window.dzmm.kv.put(key, value, { flush: true })
          : window.dzmm.kv.put(key, value),
        opts
      );
      return true;
    } catch (error) {
      console.warn("kv put failed:", error.code, error.message, error.stack);
      return false;
    }
  }

  async function putRawDetailed(key, value, opts = {}) {
    const cloudAvailable = !!window.dzmm?.kv?.put;
    const savedCloud = cloudAvailable ? await putCloudRaw(key, value, opts) : null;
    const localAttempted = !cloudAvailable || savedCloud;
    const savedLocal = localAttempted ? putLocalRaw(key, value) : false;
    return {
      key,
      local: { attempted: localAttempted, ok: savedLocal },
      cloud: { attempted: cloudAvailable, ok: savedCloud },
    };
  }

  async function putRaw(key, value, opts = {}) {
    const results = await putRawDetailed(key, value, opts);
    const required = results.cloud.attempted ? results.cloud : results.local;
    if (required.ok) return results;
    const saved = [results.local, results.cloud]
      .some(copy => copy.attempted && copy.ok);
    const error = new Error(saved ? "SAVE_PARTIAL" : "SAVE_FAILED");
    error.code = error.message;
    error.results = results;
    throw error;
  }

  async function delRaw(key, opts = {}) {
    const cloudKv = window.dzmm?.kv;
    const cloudBacked = !!(cloudKv?.get || cloudKv?.put || cloudKv?.delete);
    let cloudError = null;
    if (cloudBacked && !cloudKv?.delete) {
      cloudError = new Error("CLOUD_DELETE_UNAVAILABLE");
      cloudError.code = "CLOUD_DELETE_UNAVAILABLE";
    }
    if (cloudKv?.delete) {
      try {
        await runMutation(key, () => window.dzmm.kv.delete(key), opts);
      } catch (error) {
        console.warn("kv delete failed:", error.code, error.message, error.stack);
        cloudError = new Error("CLOUD_DELETE_FAILED");
        cloudError.code = "CLOUD_DELETE_FAILED";
        cloudError.cause = error;
      }
    }
    const localResult = removeLocalRaw(key);
    const localError = localResult.ok ? null : localResult.error;
    if (cloudError) throw cloudError;
    if (localError
      && (opts.requireAll ? !localResult.unavailable : !cloudKv?.delete)) {
      const error = new Error("LOCAL_DELETE_FAILED");
      error.code = "LOCAL_DELETE_FAILED";
      error.cause = localError;
      throw error;
    }
  }

  return { putCloudRaw, putRawDetailed, putRaw, delRaw };
};
