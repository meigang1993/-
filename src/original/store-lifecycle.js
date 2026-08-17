(() => {
  let registered = false;
  let handling = false;

  function deadlineError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
  }

  function withDeadline(task, deadline, code) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return Promise.reject(deadlineError(code));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(deadlineError(code)), remaining);
      Promise.resolve(task).then(
        value => { clearTimeout(timer); resolve(value); },
        error => { clearTimeout(timer); reject(error); }
      );
    });
  }

  function actionDeadlines(timeoutMs) {
    const budget = Number.isFinite(timeoutMs) ? Math.max(0, timeoutMs) : 10000;
    const usable = Math.max(0, budget - 250);
    const now = Date.now();
    return {
      operation: now + Math.floor(usable * 0.72),
      final: now + usable,
    };
  }

  async function captureOwnedKeys(deadline) {
    return Promise.all(window.GameStore.ownedKeys.map(key =>
      window.GameStoreIO.captureRaw(key, { deadline, retry: false })
    ));
  }

  async function restoreOwnedKeys(captures, attempted, deadline) {
    const failures = [];
    for (const capture of captures) {
      if (!attempted.has(capture.key) || !capture.value) continue;
      try {
        const restored = await window.GameStoreIO.restoreRaw(capture, {
          deadline,
          retry: false,
        });
        window.GameStore.acceptRestored?.(capture.key, restored);
      } catch (error) {
        failures.push(error);
      }
    }
    if (!failures.length) return true;
    const error = new Error("SAVE_RESTORE_FAILED");
    error.code = "SAVE_RESTORE_FAILED";
    error.causes = failures;
    throw error;
  }

  async function clearOwnedKeys(deadline, attempted = new Set()) {
    for (const key of window.GameStore.ownedKeys) {
      attempted.add(key);
      await window.GameStoreIO.delRaw(key, {
        requireAll: true,
        deadline,
        retry: false,
      });
    }
    return true;
  }

  async function handle(request) {
    if (!["reset", "prepareDeleteRecord"].includes(request?.action)) {
      return { ok: false, code: "unsupported", message: "不支持的存档操作" };
    }
    if (window.sessionOnly === true) {
      return {
        ok: false,
        code: "SESSION_ONLY",
        message: "临时试玩无法管理云存档，请恢复连接后重试",
      };
    }
    if (handling) {
      return { ok: false, code: "busy", message: "存档清理正在进行" };
    }
    handling = true;
    let succeeded = false;
    let captures = [];
    const attempted = new Set();
    const deadlines = actionDeadlines(request.timeoutMs);
    try {
      await withDeadline(
        window.GameStore.pauseSaving(),
        deadlines.operation,
        "SAVE_PAUSE_TIMEOUT"
      );
      captures = await withDeadline(
        captureOwnedKeys(deadlines.operation),
        deadlines.operation,
        "SAVE_CAPTURE_TIMEOUT"
      );
      await withDeadline(
        clearOwnedKeys(deadlines.operation, attempted),
        deadlines.operation,
        "SAVE_CLEAR_TIMEOUT"
      );
      window.GameStore.clearSettingsMemory?.();
      succeeded = true;
      return request.action === "reset"
        ? { ok: true, reload: true }
        : { ok: true };
    } catch (error) {
      console.error("save lifecycle cleanup failed:", error.code, error.message, error.stack);
      try {
        await withDeadline(
          restoreOwnedKeys(captures, attempted, deadlines.final),
          deadlines.final,
          "SAVE_RESTORE_TIMEOUT"
        );
      } catch (restoreError) {
        console.error("save lifecycle restore failed:",
          restoreError.code, restoreError.message, restoreError.stack);
      }
      return { ok: false, code: "SAVE_CLEAR_FAILED", message: "存档清理失败，请重试" };
    } finally {
      if (!succeeded) {
        handling = false;
        window.GameStore.resumeSaving();
      }
    }
  }

  function register() {
    if (registered) return true;
    const onAction = window.dzmm?.save?.onAction;
    if (typeof onAction !== "function") return false;
    window.dzmm.save.onAction(handle);
    registered = true;
    return true;
  }

  register();
})();
