window.ServerCore = (() => {
  const methods = new Set(["newGame", "unlockChar", "shopRefresh", "shopBuy", "shopDelete", "smeltRelic", "startDungeon", "settleDungeon", "bankRun", "claimBounty", "settleDefeat", "unlockEvent", "buySkin", "equipSkin"]);
  const offlineOnly = () => true;
  const apply = (state, core, context) => window.ServerCoreApply.apply(state, core, context);
  let queue = Promise.resolve();
  async function call(method, args, state) {
    const isCurrent = window.AppRuntimeErrors?.guard?.(null) || (() => true);
    const invoke = () => isCurrent()
      ? callNow(method, args, state)
      : { ok: false, changed: false, stale: true, result: null, offline: true };
    const run = queue.then(invoke, invoke);
    queue = run.catch(() => {});
    return run;
  }
  async function callNow(method, args, state) {
    if (!methods.has(method) && method !== "sync") throw new Error(`未知本地方法：${method}`);
    return localCall(method, args || {}, state);
  }
  async function sync(state) { return call("sync", {}, state); }
  function localCall(method, args, state) {
    try {
      const result = window.LocalCore?.handle?.(method, args, state);
      if (!result) throw new Error("本地核心未返回结果");
      if (result.error) {
        return { ok: false, changed: false, error: result.error, message: result.error.message, result, offline: true };
      }
      if (method === "shopRefresh" || method === "newGame") {
        assertConfirmedShopRefresh(state, result);
      }
      if (result.core && (result.apply || method === "sync" || method === "newGame")) apply(state, result.core, { method, args });
      delete state._serverCoreMissing;
      delete state._needsSaveAfterServerSync;
      return { ok: true, changed: !!result.changed, error: null, result, offline: true };
    } catch (err) {
      console.error("local core failed:", err.message, err.stack);
      state.log?.unshift?.(err.message || "本地结算失败");
      if (err.code === "INVENTORY_CAPACITY_EXCEEDED") {
        window.dzmm?.toast?.error?.(err.message);
      }
      return { ok: false, changed: false, error: err, message: err.message || "本地结算失败", offline: true };
    }
  }
  function assertConfirmedShopRefresh(state, result) {
    const core = result?.core;
    const before = Math.max(0, Number(state?.shopAuthorityVersion) || 0);
    const after = Number(core?.shopAuthorityVersion);
    const max = window.GameStoreSaveLimits?.limits?.counter || 1_000_000_000_000;
    const validCards = window.GameStoreSaveSchema?.validShopStock?.(
      core, { requireUnsold: true },
    ) === true;
    if (result?.apply !== true || !Number.isSafeInteger(after)
      || after <= before || after > max || !validCards) {
      const error = new Error("商店刷新未获得新的完整核心确认");
      error.code = "SHOP_REFRESH_UNCONFIRMED";
      throw error;
    }
  }
  return { call, sync, apply, offlineOnly };
})();
