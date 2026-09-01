window.GameAssets = (() => {
  const cache = new Map();
  const failedUrls = new Set();
  const cardBack = "./assets/generated/succubus-card-back.cca22db5.webp";
  const battlePolicy = {
    normal: { limit: 2, timeout: 5000, deadline: 14000 },
    slow: { limit: 1, timeout: 9000, deadline: 24000 },
  };
  let hallSignature = "";
  const isSlowNetwork = () => ["slow-2g", "2g", "3g"].includes(navigator.connection?.effectiveType || "") || !!navigator.connection?.saveData;
  function collectFrom(units, set = new Set()) {
    (units || []).forEach(u => {
      if (u.art) set.add(u.art);
      if (u.avatar) set.add(u.avatar);
      if (u.skinDamagedArt) set.add(u.skinDamagedArt);
      if (u.skinVictoryArt) set.add(u.skinVictoryArt);
    });
    return set;
  }
  function criticalUrls() { return ["./assets/generated/besta-villa-new.webp", cardBack]; }
  function reportFailure(url, expected) {
    if (!url) return;
    failedUrls.add(url);
    if (expected === undefined || cache.get(url) === expected) cache.delete(url);
  }
  function waitWithin(promise, timeout) {
    if (!Number.isFinite(timeout)) return promise;
    return new Promise(resolve => {
      let done = false;
      const finish = value => {
        if (done) return;
        done = true; clearTimeout(timer); resolve(value);
      };
      const timer = setTimeout(() => finish(null), Math.max(0, timeout));
      promise.then(finish, () => finish(null));
    });
  }
  function load(url, timeout = 4500) {
    if (!url || cache.has(url)) return cache.get(url);
    const img = new Image(); let done = false, timer, resolveLoad;
    let resolved = url;
    try { resolved = new URL(url, document.baseURI).href; } catch (_) {}
    const p = new Promise(resolve => { resolveLoad = resolve; });
    cache.set(url, p);
    const finish = value => {
      if (done) return;
      done = true; clearTimeout(timer);
      if (value) failedUrls.delete(url);
      else reportFailure(url, p);
      resolveLoad(value);
    };
    timer = setTimeout(() => finish(null), timeout);
    img.decoding = "async"; img.loading = "eager";
    img.onload = () => finish(img);
    img.onerror = () => finish(null); img.src = resolved;
    return p;
  }
  async function preload(list, onProgress, opts = {}) {
    const unique = [...new Set((list || []).filter(Boolean))]; let done = 0, index = 0, failed = [];
    onProgress?.(0, unique.length);
    if (!unique.length) return failed;
    const limit = Math.min(unique.length, Math.max(1, opts.limit || 4));
    const timeout = opts.timeout || 4500;
    const deadlineAt = opts.deadline ? Date.now() + opts.deadline : Infinity;
    await Promise.all(Array.from({ length: limit }, async () => {
      while (index < unique.length) {
        const remaining = deadlineAt - Date.now();
        if (remaining <= 0) break;
        const url = unique[index++];
        const pending = load(url, Math.min(timeout, remaining));
        const img = await waitWithin(pending, remaining);
        if (!img) {
          reportFailure(url, pending);
          failed.push(url);
        }
        done += 1; onProgress?.(done, unique.length);
      }
    }));
    while (index < unique.length) {
      const url = unique[index++];
      reportFailure(url, null); failed.push(url);
      done += 1; onProgress?.(done, unique.length);
    }
    const failedSet = new Set(failed);
    return unique.filter(url => failedSet.has(url));
  }
  async function preloadCritical(onProgress) {
    const timeout = isSlowNetwork() ? 12000 : 8000;
    let failed = await preload(criticalUrls(), onProgress, { limit: isSlowNetwork() ? 1 : 2, timeout, eager: true });
    if (!failed.length) return failed;
    await new Promise(resolve => setTimeout(resolve, 350));
    failed = await preload(failed, onProgress, { limit: 1, timeout: 12000, eager: true });
    return failed;
  }
  function warmHall(state, onProgress) {
    if (isSlowNetwork()) return;
    const ids = new Set(state?.party || []);
    const current = (state?.chars || []).filter(c => ids.has(c.id));
    const urls = [...collectFrom(current)], signature = urls.join("|");
    if (signature === hallSignature) return;
    hallSignature = signature;
    const retry = () => { if (hallSignature === signature) hallSignature = ""; };
    const run = () => preload(urls, onProgress, { limit: 1, timeout: 2200 })
      .then(failed => { if (failed.length) retry(); })
      .catch(e => { retry(); console.warn("hall asset warm failed:", e.message, e.stack); });
    if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 1800 });
    else setTimeout(run, 1200);
  }
  async function preloadBattle(missionId, allies = [], enemies = null, onProgress) {
    const foes = enemies || window.GameData?.enemies?.[missionId];
    const set = collectFrom(allies);
    collectFrom(foes, set);
    const policy = isSlowNetwork() ? battlePolicy.slow : battlePolicy.normal;
    return preload([...set], onProgress, { ...policy, eager: true });
  }
  function retryBattle(list, onProgress) {
    const slow = isSlowNetwork();
    return preload(list, onProgress, {
      limit: slow ? 1 : 2,
      timeout: slow ? 12000 : 8000,
      deadline: slow ? 30000 : 20000,
      eager: true,
    });
  }
  const failed = url => !!url && failedUrls.has(url);
  return {
    cardBack, faceDownCardBack: cardBack, criticalUrls, preloadCritical,
    warmHall, preloadBattle, retryBattle, failed, reportFailure,
  };
})();
