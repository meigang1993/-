window.GameStoreMainSaveScheduler = ({
  key, putLocalRaw, isStale, noteSaveMeta, markDirty, clearDirtyThrough,
  onSaved, onError, invalidSnapshot, staleResult, saveFailure,
  saveMainSnapshot, pendingJobs,
}) => {
  let saveRunning = false;
  let syncing = false;
  let activeJob = null;
  let paused = false;
  const pauseWaiters = [];

  function setSyncing(value) {
    if (syncing === value) return;
    syncing = value;
    onError?.();
  }

  const timer = window.GameStoreMainSaveTimer({
    canSchedule: () => !saveRunning && !paused,
    canRun: () => !paused,
    run: () => runMainSaveQueue(),
  });

  async function runMainSaveQueue() {
    if (saveRunning || paused) return;
    saveRunning = true;
    setSyncing(true);
    try {
      while (pendingJobs.length && !paused) {
        const job = pendingJobs.shift();
        activeJob = job;
        try {
          const {
            data, flush, localSaved, deferLocalUntilCloud, validated, waiters,
          } = job;
          if (isStale(data)) {
            waiters.forEach(waiter => waiter.resolve(staleResult()));
            continue;
          }
          try {
            const results = await saveMainSnapshot(data, {
              flush, localSaved, deferLocalUntilCloud, validated,
            });
            waiters.forEach(waiter => waiter.resolve(results));
          } catch (error) {
            markDirty(data, error);
            onError?.(error);
            waiters.forEach(waiter => waiter.reject(error));
          }
        } finally {
          activeJob = null;
        }
      }
    } finally {
      saveRunning = false;
      if (pendingJobs.length && !paused) {
        if (pendingJobs[0].flush) timer.runNow();
        else timer.schedule();
      } else setSyncing(false);
      pauseWaiters.splice(0).forEach(resolve => resolve());
    }
  }

  function queueMainSave(snapshot, opts = {}) {
    if (!window.GameStoreSaveLimits.validateRaw(snapshot)) {
      return Promise.reject(invalidSnapshot());
    }
    if (isStale(snapshot)) return Promise.resolve(staleResult());
    noteSaveMeta(snapshot, { isolated: opts.isolated === true });
    const cloudAvailable = !!window.dzmm?.kv?.put;
    const deferLocalUntilCloud = cloudAvailable && !!opts.deferLocalUntilCloud;
    const localDeferred = paused || deferLocalUntilCloud;
    const localSaved = localDeferred
      ? false : putLocalRaw(key, snapshot, { validated: opts.validated === true });
    const localResults = {
      key,
      local: { attempted: !localDeferred, ok: localDeferred ? null : localSaved },
      cloud: { attempted: false, ok: null },
    };
    if (!localSaved && !cloudAvailable && !paused) {
      const error = saveFailure("local", localResults);
      const marked = markDirty(snapshot, error) || error;
      onError?.(marked);
      return Promise.reject(marked);
    }
    setSyncing(true);
    if (!cloudAvailable && !paused) {
      const dirtyCleared = clearDirtyThrough(snapshot);
      onSaved(dirtyCleared);
      setSyncing(false);
      return Promise.resolve(localResults);
    }
    let waiter;
    const promise = new Promise((resolve, reject) => {
      waiter = { resolve, reject };
    });
    const job = {
      data: snapshot,
      flush: !!opts.flush,
      localSaved,
      deferLocalUntilCloud,
      validated: opts.validated === true,
      atomic: localDeferred,
      waiters: [waiter],
    };
    const previous = pendingJobs[pendingJobs.length - 1];
    if (previous && !previous.atomic && !job.atomic) {
      previous.data = job.data;
      if (job.flush) previous.flush = true;
      previous.localSaved = job.localSaved;
      previous.validated = previous.validated && job.validated;
      previous.waiters.push(waiter);
    } else pendingJobs.push(job);
    if (!opts.flush) {
      timer.schedule();
      return promise;
    }
    timer.runNow();
    return promise;
  }

  function flushPending() {
    const replayActive = activeJob && !activeJob.flush && !pendingJobs.length;
    pendingJobs.forEach(job => { job.flush = true; });
    if (replayActive) pendingJobs.push({ ...activeJob, flush: true, waiters: [] });
    if (!pendingJobs.length) return false;
    if (!paused) timer.runNow();
    return true;
  }

  function pause() {
    paused = true;
    timer.clear();
    if (!saveRunning) {
      setSyncing(false);
      return Promise.resolve();
    }
    return new Promise(resolve => pauseWaiters.push(resolve));
  }

  function resume() {
    if (!paused) return;
    paused = false;
    if (!pendingJobs.length) return;
    if (pendingJobs[0].flush) timer.runNow();
    else timer.schedule();
  }

  const isSyncing = () => syncing || !!pendingJobs.length || saveRunning;
  return {
    queueMainSave, flushPending, isSyncing,
    pause, resume,
  };
};
