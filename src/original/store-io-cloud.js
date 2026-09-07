window.GameStoreCloudIO = (() => {
  const mutationTails = new Map();

  function timeoutError(code = "KV_TIMEOUT") {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function remaining(options, fallback = 8000) {
    if (Number.isFinite(options?.deadline)) {
      return Math.max(0, options.deadline - Date.now());
    }
    if (Number.isFinite(options?.timeoutMs)) return Math.max(0, options.timeoutMs);
    if (Number.isFinite(options)) return Math.max(0, options);
    return fallback;
  }

  function withTimeout(task, options = 8000, code = "KV_TIMEOUT") {
    const ms = remaining(options);
    if (ms <= 0) return Promise.reject(timeoutError(code));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(timeoutError(code)), ms);
      Promise.resolve(task).then(
        value => { clearTimeout(timer); resolve(value); },
        error => { clearTimeout(timer); reject(error); }
      );
    });
  }

  // Timed-out SDK mutations can still settle later, so keep them ordered per key.
  async function runMutation(key, operation, options) {
    const previous = mutationTails.get(key) || Promise.resolve();
    const task = previous.then(() => {
      if (remaining(options) <= 0) throw timeoutError();
      return operation();
    });
    const tail = task.catch(() => {});
    mutationTails.set(key, tail);
    tail.then(() => {
      if (mutationTails.get(key) === tail) mutationTails.delete(key);
    });
    return withTimeout(task, options);
  }

  async function getRaw(key, opts = {}) {
    try {
      if (window.dzmm?.kv?.get) {
        const result = await withTimeout(window.dzmm.kv.get(key), opts);
        return result?.value ?? null;
      }
    } catch (error) {
      console.warn("kv get failed:", error.message);
      if (opts.strictCloud) {
        const failure = new Error("CLOUD_LOAD_FAILED");
        failure.code = "CLOUD_LOAD_FAILED";
        failure.cause = error;
        throw failure;
      }
    }
    return null;
  }

  return { withTimeout, runMutation, getRaw };
})();
