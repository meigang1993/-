window.GameStoreMainSaveTimer = ({
  canSchedule, canRun, run, delay = 900,
}) => {
  let timer = null;

  function clear() {
    clearTimeout(timer);
    timer = null;
  }

  function schedule() {
    if (!canSchedule()) return;
    clear();
    timer = setTimeout(() => {
      timer = null;
      if (canRun()) run();
    }, delay);
  }

  function runNow() {
    clear();
    if (canRun()) run();
  }

  return { clear, schedule, runNow };
};
