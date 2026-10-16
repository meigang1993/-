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
    // 本地必须总是尝试写入：原先只在云端成功时才写本地，一旦云端故障
    // （无网络 / kv 报错），本地副本就完全没有落盘，玩家进度直接丢失。
    // 两边都写后再由读取侧按 _saveVersion / updatedAt 选取较新的一份，
    // 因此本地写入不会覆盖掉云端的更新进度。
    //
    // 本地必须先于云端写入：云端 put 在网络异常时最多挂起若干秒才超时，
    // 若先 await 云端，本地副本要等云端结束才落盘，这段时间内玩家关掉
    // 游戏或进程崩溃，就会出现"云端没成功、本地也没写"的丢档窗口。
    // putLocalRaw 是同步写入，先写本地不增加任何等待。
    const localAttempted = true;
    const savedLocal = localAttempted ? putLocalRaw(key, value) : false;
    const savedCloud = cloudAvailable ? await putCloudRaw(key, value, opts) : null;
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
    // 云端副本删不掉时绝不能先删本地：本地没了、云端还在，下次读取会
    // 把云端的旧数据重新读回来（已删的存档位复活 / 旧档清了又回来）。
    // 因此云端删除未成功就原样抛出，本地保持不动，由调用方重试。
    if (cloudError) throw cloudError;
    const localResult = removeLocalRaw(key);
    const localError = localResult.ok ? null : localResult.error;
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
