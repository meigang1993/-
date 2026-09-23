window.AppActionGuard = (() => {
  let generation = 0;
  let sequence = 0;
  const active = new Map();
  const controls = new Set();

  function unlock(control, lockToken) {
    if (!control || control.dataset.appLockToken !== lockToken) return;
    controls.delete(control);
    delete control.dataset.appLockToken;
    if (control.dataset.locked !== "1") return;
    delete control.dataset.locked;
    delete control.dataset.busyText;
    control.style.pointerEvents = "";
    if (control.tagName === "BUTTON") control.disabled = false;
  }

  function report(label, err, actionState, isCurrent) {
    console.error(`${label}:`, err?.code, err?.message || err, err?.stack || "");
    if (!isCurrent()) return;
    const detail = err?.message && !/^Script error/i.test(err.message) ? `：${err.message}` : "";
    const message = `${label}${detail}。已恢复操作，请重试。`;
    actionState.log?.unshift?.(message);
    window.dzmm?.toast?.error?.(message);
    window.render?.();
  }

  async function run(label, task, options = {}) {
    const control = options.control || null;
    const actionKey = options.key || control || label;
    if (active.has(actionKey)) {
      if (control && control.dataset.locked !== "1") {
        window.dzmm?.toast?.info?.("该操作正在处理中，请稍候。");
      }
      return false;
    }
    const actionState = options.state || window.state;
    const actionRun = options.captureRun === false ? null : actionState?.explore || null;
    const runGeneration = generation;
    if (control && !lockControl(control, options.busyText)) return false;
    const lockToken = `${runGeneration}:${++sequence}`;
    if (control) {
      control.dataset.appLockToken = lockToken;
      controls.add(control);
    }
    const isCurrent = () => runGeneration === generation
      && window.state === actionState
      && (options.captureRun === false || actionState?.explore === actionRun
        || options.allowRunExit === true && !actionState?.explore);
    active.set(actionKey, lockToken);
    try {
      return await task({ state: actionState, run: actionRun, isCurrent });
    } catch (err) {
      report(label, err, actionState, isCurrent);
      return false;
    } finally {
      if (active.get(actionKey) === lockToken) active.delete(actionKey);
      unlock(control, lockToken);
    }
  }

  function reset() {
    generation += 1;
    active.clear();
    const lockedControls = [...controls];
    controls.clear();
    lockedControls.forEach(control => {
      try { unlock(control, control.dataset.appLockToken); }
      catch (err) {
        console.warn("app action control unlock failed:", err.message, err.stack);
      }
    });
  }

  const isActive = key => active.has(key);

  return { run, reset, isActive };
})();
