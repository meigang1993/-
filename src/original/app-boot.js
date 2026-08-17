const BootLoading = (() => {
  const loading = () => window.dzmm?.loading;
  function progress(payload) {
    try { loading()?.progress?.(payload); }
    catch (err) { console.warn("loading progress failed:", err.message); }
  }
  function ready() {
    try { loading()?.ready?.(); }
    catch (err) { console.warn("loading ready failed:", err.message); }
  }
  function error(code, message) {
    try { loading()?.error?.(code, message); }
    catch (err) { console.warn("loading error failed:", err.message); }
  }
  return { progress, ready, error };
})();

let bootReadyReported = false;
let bootAttempt = 0;
let bootInProgress = false;

function isActiveBoot(attempt) {
  return bootInProgress && attempt === bootAttempt && !bootReadyReported;
}

function reportBootReady(attempt) {
  if (!isActiveBoot(attempt)) return;
  bootReadyReported = true;
  bootInProgress = false;
  setRenderBlocked(false);
  $("settings-toggle").disabled = false;
  BootLoading.ready();
}

function showBootError(message) {
  const root = $("view") || document.body;
  document.onkeydown = null; document.oncontextmenu = null; const settings = $("settings-toggle"); if (settings) settings.onclick = null;
  root.innerHTML = `<div class="boot-card boot-error"><b>游戏启动失败</b><span>${UICommon.esc(message)}</span><button data-boot-retry="1">重试加载</button></div>`;
  root.querySelector("[data-boot-retry]")?.addEventListener("click", () => void boot());
}

function failBoot(error, attempt, playerMessage = "游戏启动时发生异常，请重试加载。") {
  if (!isActiveBoot(attempt)) return;
  bootInProgress = false;
  setRenderBlocked(true);
  const message = error?.message || (typeof error === "string" ? error : "Game failed to start");
  console.error("boot failed:", message, error?.stack);
  BootLoading.error("BOOT_FAILED", message);
  showBootError(playerMessage);
}

function warnSettingsLoad(store) {
  const status = store?.status?.().settings;
  if (status?.state !== "error") return;
  const message = status.localAvailable
    ? "云端设置读取失败，当前使用本地副本；修改已暂停，可在设置中重试。"
    : "设置读取失败，当前仅使用默认值；修改已暂停，可在设置中重试。";
  window.dzmm?.toast?.warning?.(message);
}

async function initializeFreshState(store) {
  try {
    BootLoading.progress({
      phase: "runtime_initializing",
      message: "Initializing new game",
    });
    if (!store?.freshState) throw new Error("GameStore unavailable");
    state = store.freshState();
    try { state.settings = await store.loadSettings(); }
    catch (error) {
      console.warn("settings load failed:", error.message, error.stack);
    }
    warnSettingsLoad(store);
    return true;
  } catch (e) {
    console.error("fresh state failed:", e.message, e.stack);
    try {
      state = store?.freshState?.() || window.GameStoreMigrations?.freshState?.();
    } catch (fallbackErr) {
      console.error("fallback state failed:", fallbackErr.message, fallbackErr.stack);
      fallbackErr.bootMessage = "存档模块加载异常，请重试加载。";
      throw fallbackErr;
    }
  }
  return true;
}

function waitForFirstFrame(attempt) {
  return new Promise((resolve, reject) => {
    function completeBootFrame() {
      if (!isActiveBoot(attempt)) {
        resolve(false);
        return;
      }
      try {
        reportBootReady(attempt);
        resolve(true);
      } catch (error) {
        reject(error);
      }
    }
    try { requestAnimationFrame(completeBootFrame); }
    catch (error) { reject(error); }
  });
}

async function finishBoot(store, attempt) {
  await initializeFreshState(store);
  if (!isActiveBoot(attempt)) return;
  try {
    if (!window.GameAssets?.preloadCritical) throw new Error("GameAssets unavailable");
    const failed = await window.GameAssets.preloadCritical((loaded, total) => {
      BootLoading.progress({ phase: "resource_loading", loadedResources: loaded, totalResources: total, message: "Loading first screen assets" });
    });
    if (failed?.length) {
      console.warn(`关键资源预加载未完成，降级启动：${failed.join("、")}`);
      BootLoading.progress({ phase: "resource_loading", message: "Starting with asset fallback" });
    }
  } catch (e) {
    console.warn("critical preload failed:", e.message, e.stack);
    BootLoading.progress({ phase: "resource_loading", message: "Starting with asset fallback" });
  }
  if (!isActiveBoot(attempt)) return;
  BootLoading.progress({ phase: "first_frame", message: "Starting game" });
  render();
  await waitForFirstFrame(attempt);
}

async function boot() {
  const attempt = ++bootAttempt;
  bootReadyReported = false;
  bootInProgress = true;
  setRenderBlocked(true);
  BootLoading.progress({ phase: "start", message: "Preparing game" });
  try {
    sessionOnly = false;
    showBoot();
    await finishBoot(window.GameStore, attempt);
  } catch (error) {
    failBoot(error, attempt, error?.bootMessage);
  }
}

window.addEventListener("resize", scheduleRender);
void boot();
