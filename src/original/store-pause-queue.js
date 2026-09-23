window.GameStorePauseQueue = (runner) => {
  const jobs = [];
  const pauseWaiters = [];
  let paused = false;
  let running = false;

  async function drain() {
    if (running || paused) return;
    running = true;
    try {
      while (jobs.length && !paused) {
        const job = jobs.shift();
        try {
          job.resolve(await runner(job.payload));
        } catch (error) {
          job.reject(error);
        }
      }
    } finally {
      running = false;
      pauseWaiters.splice(0).forEach(resolve => resolve());
      if (jobs.length && !paused) drain();
    }
  }

  function enqueue(payload) {
    const task = new Promise((resolve, reject) => {
      jobs.push({ payload, resolve, reject });
    });
    drain();
    return task;
  }

  function pause() {
    paused = true;
    if (!running) return Promise.resolve();
    return new Promise(resolve => pauseWaiters.push(resolve));
  }

  function resume() {
    if (!paused) return;
    paused = false;
    drain();
  }

  return {
    enqueue,
    pause,
    resume,
    isPaused: () => paused,
  };
};
