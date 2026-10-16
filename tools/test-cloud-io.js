/* 云端存档（KV）专项探针：逐个构造云端故障/竞态场景，实测真实代码路径。 */
require("./store-test-env.js");

const IO = window.GameStoreIO;
const KEY = IO.slotKey(1);
const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
}

let store = new Map();
let mode = { put: "ok", get: "ok", del: "ok", noPut: false, noGet: false, noDel: false };
let putCalls = [];
let hangGate = null;

function installKv() {
  window.dzmm = {
    kv: {
      async put(key, value, options) {
        putCalls.push({ key, value, options });
        if (mode.put === "fail") throw new Error("cloud put blocked");
        if (mode.put === "hang") {
          return new Promise(resolve => { hangGate = () => { store.set(key, value); resolve(); }; });
        }
        store.set(key, value);
      },
      async get(key) {
        if (mode.get === "fail") throw new Error("cloud get blocked");
        return { value: store.has(key) ? store.get(key) : null };
      },
      async delete(key) {
        if (mode.del === "fail") throw new Error("cloud del blocked");
        store.delete(key);
      },
    },
    save: { onAction() {} },
  };
  if (mode.noPut) delete window.dzmm.kv.put;
  if (mode.noGet) delete window.dzmm.kv.get;
  if (mode.noDel) delete window.dzmm.kv.delete;
}
function reset() {
  store = new Map();
  putCalls = [];
  hangGate = null;
  mode = { put: "ok", get: "ok", del: "ok", noPut: false, noGet: false, noDel: false };
  global.localStorage.data.clear();
  global.localWritable = true;
  installKv();
}
const data = v => ({ _saveVersion: v, updatedAt: 1000 + v, log: [], party: [], chars: [], deck: [], shopCards: [], settings: {}, resources: {} });

(async () => {
  // A 组：云端写入
  reset();
  {
    const r = await IO.putRawDetailed(KEY, data(1), { flush: true });
    record("A1 云端可写：两副本都成功", r.local.ok && r.cloud.ok && store.has(KEY),
      JSON.stringify({ local: r.local, cloud: r.cloud, flush: putCalls[0]?.options?.flush }));
  }
  reset(); mode.put = "fail";
  {
    const r = await IO.putRawDetailed(KEY, data(1), { flush: true });
    const localHas = !!global.localStorage.getItem(KEY);
    record("A2 云端写失败：本地仍落盘", !r.cloud.ok && r.local.ok && localHas && !store.has(KEY),
      JSON.stringify({ cloud: r.cloud, local: r.local, localHas, cloudHas: store.has(KEY) }));
  }
  reset(); mode.noPut = true; installKv();
  {
    const r = await IO.putRawDetailed(KEY, data(1), { flush: true });
    record("A3 无 kv.put：云端标记未尝试", r.cloud.attempted === false && r.local.ok,
      JSON.stringify({ cloud: r.cloud, local: r.local }));
  }
  reset(); mode.put = "hang";
  {
    const r = await IO.putRawDetailed(KEY, data(1), { flush: true, timeoutMs: 150 });
    record("A4 云端挂起超时：判失败且本地已写", r.cloud.ok === false && r.local.ok,
      JSON.stringify({ cloud: r.cloud, local: r.local }));
    if (hangGate) hangGate();
    await new Promise(r2 => setTimeout(r2, 50));
    record("A4b 挂起的云端最终仍会写入（乱序风险）", store.has(KEY), JSON.stringify({ cloudHas: store.has(KEY) }));
  }

  // D 组：一致性 / 竞态
  reset();
  {
    // 第一次挂起（旧数据），第二次立即成功（新数据）
    mode.put = "hang";
    const first = IO.putRawDetailed(KEY, data(1), { flush: true, timeoutMs: 120 });
    await new Promise(r2 => setTimeout(r2, 10));
    mode.put = "ok";
    const second = IO.putRawDetailed(KEY, data(2), { flush: true });
    await Promise.all([first.catch(() => {}), second]);
    if (hangGate) hangGate();
    await new Promise(r2 => setTimeout(r2, 80));
    const v = store.get(KEY)?._saveVersion;
    record("D1 乱序：云端最终值应为较新那份(2)", v === 2, JSON.stringify({ cloudVersion: v }));
  }
  reset();
  {
    global.localWritable = false;
    const r = await IO.putRawDetailed(KEY, data(1), { flush: true });
    record("D2 本地写失败+云端成功：仍判成功", r.cloud.ok && r.local.ok === false,
      JSON.stringify({ local: r.local, cloud: r.cloud }));
    global.localWritable = true;
  }
  reset(); mode.noGet = true; installKv();
  {
    const r = await IO.putRawDetailed(KEY, data(1), { flush: true });
    const d = await IO.getRawDetails(KEY);
    record("D3 有put无get：云端写了却读不回", r.cloud.ok && d.source === "local" && d.cloudAvailable === false,
      JSON.stringify({ cloud: r.cloud, source: d.source, cloudAvailable: d.cloudAvailable }));
  }

  // B 组：云端读取
  reset();
  {
    global.localStorage.setItem(KEY, JSON.stringify(data(1)));
    store.set(KEY, data(5));
    const d = await IO.getRawDetails(KEY);
    record("B1 云端更新：选云端", d.source === "cloud" && d.selected._saveVersion === 5,
      JSON.stringify({ source: d.source, v: d.selected?._saveVersion }));
  }
  reset();
  {
    global.localStorage.setItem(KEY, JSON.stringify(data(9)));
    store.set(KEY, data(2));
    const d = await IO.getRawDetails(KEY);
    record("B2 本地更新：选本地", d.source === "local" && d.selected._saveVersion === 9,
      JSON.stringify({ source: d.source, v: d.selected?._saveVersion }));
  }
  reset(); mode.get = "fail"; installKv();
  {
    global.localStorage.setItem(KEY, JSON.stringify(data(1)));
    // 与全部真实调用方一致：strictCloud + allowLocalOnCloudFailure
    const d = await IO.getRawDetails(KEY, { strictCloud: true, allowLocalOnCloudFailure: true });
    record("B3 云端读失败：回落本地且标记失败", d.source === "local" && d.cloudReadFailed === true,
      JSON.stringify({ source: d.source, failed: d.cloudReadFailed }));
  }
  reset(); mode.get = "fail"; installKv();
  {
    global.localStorage.setItem(KEY, JSON.stringify(data(1)));
    let code = null;
    try { await IO.getRawDetails(KEY, { strictCloud: true }); } catch (e) { code = e.code; }
    record("B4 云端读失败+strictCloud：抛错", code === "CLOUD_LOAD_FAILED", JSON.stringify({ code }));
  }
  reset();
  {
    global.localStorage.setItem(KEY, JSON.stringify(data(3)));
    store.set(KEY, { deck: "不是数组" });
    const d = await IO.getRawDetails(KEY, { strictCloud: true, allowLocalOnCloudFailure: true });
    record("B5 云端结构非法：判损坏并回落本地", d.cloudCorrupt && d.source === "local",
      JSON.stringify({ cloudCorrupt: d.cloudCorrupt, source: d.source, conflict: d.conflict }));
  }
  reset();
  {
    global.localStorage.setItem(KEY, "{ 坏档");
    store.set(KEY, data(4));
    const d = await IO.getRawDetails(KEY);
    record("B6 本地损坏+云端正常：选云端", d.localCorrupt && d.source === "cloud",
      JSON.stringify({ localCorrupt: d.localCorrupt, source: d.source }));
  }

  // C 组：云端删除
  reset(); mode.del = "fail"; installKv();
  {
    global.localStorage.setItem(KEY, JSON.stringify(data(1)));
    store.set(KEY, data(1));
    let code = null;
    try { await IO.delRaw(KEY); } catch (e) { code = e.code; }
    const localStill = !!global.localStorage.getItem(KEY);
    record("C1 云端删失败：本地不得删除", code === "CLOUD_DELETE_FAILED" && localStill,
      JSON.stringify({ code, localStill }));
  }
  reset();
  {
    global.localStorage.setItem(KEY, JSON.stringify(data(1)));
    store.set(KEY, data(1));
    let code = null;
    try { await IO.delRaw(KEY); } catch (e) { code = e.code; }
    record("C2 云端删成功：两边都清", !code && !global.localStorage.getItem(KEY) && !store.has(KEY),
      JSON.stringify({ code, local: !!global.localStorage.getItem(KEY), cloud: store.has(KEY) }));
  }
  reset(); mode.noDel = true; installKv();
  {
    global.localStorage.setItem(KEY, JSON.stringify(data(1)));
    let code = null;
    try { await IO.delRaw(KEY); } catch (e) { code = e.code; }
    record("C3 无 delete：拒绝删本地", code === "CLOUD_DELETE_UNAVAILABLE" && !!global.localStorage.getItem(KEY),
      JSON.stringify({ code }));
  }

  // E 组：重试补写云端
  reset(); mode.put = "fail"; installKv();
  {
    const state = window.GameStore.freshState();
    state._saveVersion = 7; state.updatedAt = 7000;
    let err = null;
    try { await window.GameStore.saveSlot(1, state); } catch (e) { err = e; }
    const pending = window.GameStore.status().slotPending;
    record("E1 首次云端失败：部分保存且挂起", err?.code === "SAVE_PARTIAL" && pending.pending,
      JSON.stringify({ code: err?.code, pending: pending.pending }));
    mode.put = "ok"; installKv();
    let err2 = null;
    try { await window.GameStore.retrySlotSave(state); } catch (e) { err2 = e; }
    const after = window.GameStore.status().slotPending;
    record("E2 云端恢复后重试：补写云端并清挂起", !err2 && store.has(KEY) && !after.pending,
      JSON.stringify({ err: err2?.code, cloudHas: store.has(KEY), pending: after.pending }));
  }

  // F 组：旧档清理时的云端保护（不可逆操作，误删=丢档）
  require("../src/original/store-legacy-purge.js");
  const purge = window.GameStoreLegacyPurge({
    key: IO.key, slotKey: IO.slotKey, slotIds: IO.slotIds,
    getRawDetails: IO.getRawDetails, getLocalDetails: IO.getLocalDetails,
    delRaw: IO.delRaw, isLegacy: v => !v || v._epoch !== 2,
  });
  reset(); mode.get = "fail"; installKv();
  {
    global.localStorage.setItem(IO.key, JSON.stringify(data(1))); // 本地旧档
    const r = await purge.purgeOne(IO.key);
    record("F1 本地旧档+云端读失败：保守保留", !r.purged && r.cloudUnknown === true,
      JSON.stringify({ purged: r.purged, cloudUnknown: r.cloudUnknown, legacy: r.legacy }));
    record("F1b 本地副本未被删除", !!global.localStorage.getItem(IO.key), JSON.stringify({}));
  }
  reset();
  {
    global.localStorage.setItem(IO.key, JSON.stringify(data(1)));
    const r = await purge.purgeOne(IO.key); // 云端确实无数据
    record("F2 本地旧档+云端无数据：正常清理", r.purged && !global.localStorage.getItem(IO.key),
      JSON.stringify({ purged: r.purged, legacy: r.legacy }));
  }
  reset();
  {
    global.localStorage.setItem(IO.key, JSON.stringify(data(1)));
    store.set(IO.key, { ...data(2), _epoch: 2 }); // 云端已是新档
    const r = await purge.purgeOne(IO.key);
    record("F3 本地旧档+云端新档：绝不清理", !r.purged && !!global.localStorage.getItem(IO.key),
      JSON.stringify({ purged: r.purged, legacy: r.legacy }));
  }

  const fail = results.filter(r => !r.ok);
  console.log(`\n通过 ${results.length - fail.length}/${results.length}`);
  if (fail.length) console.log("失败项: " + fail.map(f => f.name).join(" | "));
  process.exit(fail.length ? 1 : 0);
})();
