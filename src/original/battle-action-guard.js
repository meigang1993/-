window.BattleActionGuard = (() => {
  let running = false;
  let queued = 0;
  let generation = 0;
  let queueGeneration = 0;
  const lockedControls = new Set();
  let idleWaiters = [];
  let runningWaiters = [];
  let queueTail = Promise.resolve();
  function releaseIdleWaiters() {
    if (running || queued) return;
    const waiters = idleWaiters;
    idleWaiters = [];
    waiters.forEach(resolve => resolve());
  }
  function releaseRunningWaiters() {
    const waiters = runningWaiters;
    runningWaiters = [];
    waiters.forEach(resolve => resolve());
  }
  function unlockControl(control, lockGeneration) {
    if (!control || control.dataset.battleLockGeneration !== String(lockGeneration)) return;
    lockedControls.delete(control);
    if (!control.isConnected || control.dataset.locked !== "1") return;
    delete control.dataset.locked;
    delete control.dataset.battleLockGeneration;
    control.style.pointerEvents = "";
    if (control.tagName === "BUTTON") {
      control.disabled = false;
      delete control.dataset.busyText;
    }
  }

  function guard(expectedState = window.state, expectedBattle = expectedState?.battle) {
    const runGeneration = generation;
    return () => runGeneration === generation
      && (expectedState === null || window.state === expectedState)
      && (expectedBattle === null || expectedState?.battle === expectedBattle);
  }

  async function run(label, task, options = {}) {
    const control = options.control || null;
    const runGeneration = generation;
    const actionState = options.state || window.state;
    const actionBattle = options.captureBattle === false ? null : actionState?.battle;
    const isCurrent = () => runGeneration === generation
      && window.state === actionState
      && (options.captureBattle === false || actionState?.battle === actionBattle
        || options.allowBattleExit === true && !actionState?.battle)
      && (!options.isCurrent || options.isCurrent());
    if (running) return false;
    if (control && !lockControl(control, options.busyText)) return false;
    if (control) { control.dataset.battleLockGeneration = String(runGeneration); lockedControls.add(control); }
    running = true;
    try {
      return await task({ state: actionState, battle: actionBattle, isCurrent });
    } catch (err) {
      try { if (runGeneration === generation) battleActionError(label, err); }
      catch (recoveryErr) { console.error("battle action recovery failed:", recoveryErr.message, recoveryErr.stack); }
      return false;
    } finally {
      if (runGeneration === generation) {
        running = false;
        releaseRunningWaiters();
        releaseIdleWaiters();
      }
      unlockControl(control, runGeneration);
    }
  }

  function whenIdle() {
    return running || queued
      ? new Promise(resolve => idleWaiters.push(resolve))
      : Promise.resolve();
  }

  function runWhenIdle(label, task, options = {}) {
    const control = options.control || null;
    const queuedGeneration = queueGeneration;
    queued += 1;
    const execute = async () => {
      if (running) await new Promise(resolve => runningWaiters.push(resolve));
      if (queuedGeneration === queueGeneration) queued = Math.max(0, queued - 1);
      if (queuedGeneration !== queueGeneration
        || (options.isCurrent && !options.isCurrent())) {
        releaseIdleWaiters();
        return false;
      }
      return run(label, task, {
        ...options,
        control: control?.isConnected ? control : null,
      });
    };
    const scheduled = queueTail.then(execute, execute);
    queueTail = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }

  function discardQueued() {
    queueGeneration += 1;
    queued = 0;
    queueTail = Promise.resolve();
    releaseIdleWaiters();
  }

  function reset() {
    const resetGeneration = generation;
    generation += 1;
    running = false;
    discardQueued();
    const controls = [...lockedControls];
    lockedControls.clear();
    controls.forEach(control => {
      try { unlockControl(control, resetGeneration); }
      catch (err) {
        console.warn("battle action control unlock failed:", err.message, err.stack);
      }
    });
    releaseRunningWaiters();
    releaseIdleWaiters();
  }

  return { discardQueued, guard, run, runWhenIdle, reset, whenIdle };
})();
