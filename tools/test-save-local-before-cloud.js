/* 丢档窗口专项：云端 put 挂起时，本地副本必须在云端结束前就已落盘。
   判据是"挂起期间本地是否已有数据"，不是总耗时——总耗时在两种实现下
   都一样（都要等云端超时），只有本地落盘时机能区分出丢档窗口。 */
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
let hangRelease = null;
let hangMs = 400;

function installKv() {
  window.dzmm = {
    kv: {
      async put(key, value) {
        if (mode.put === "fail") throw new Error("cloud put blocked");
        if (mode.put === "hang") {
          await new Promise(resolve => setTimeout(resolve, hangMs));
          store.set(key, value);
          return;
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
  hangRelease = null;
  mode = { put: "ok", get: "ok", del: "ok", noPut: false, noGet: false, noDel: false };
  global.localStorage.data.clear();
  global.localWritable = true;
  installKv();
}
const data = v => ({
  _saveVersion: v, updatedAt: 1000 + v, log: [], party: [], chars: [],
  deck: [], shopCards: [], settings: {}, resources: {},
});
const localHas = () => global.localStorage.data.has(KEY);
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // ── A 组：putRawDetailed 挂起期间的本地落盘时机 ──
  reset();
  mode.put = "hang";
  {
    const pending = IO.putRawDetailed(KEY, data(1), { flush: true });
    await sleep(50);                       // 云端仍在挂起（hangMs=400）
    const during = localHas();
    const r = await pending;
    record("A1 云端挂起期间本地已落盘", during === true,
      JSON.stringify({ localDuringHang: during, localOk: r.local.ok, cloudOk: r.cloud.ok }));
    record("A2 云端最终写入成功", r.cloud.ok && store.has(KEY) && localHas(),
      JSON.stringify({ cloudOk: r.cloud.ok }));
  }

  // ── B 组：挂起 + 云端最终失败（网络不通的典型形态）──
  reset();
  {
    // 先挂起 400ms 再判定失败：模拟"不报错、只是超时"
    window.dzmm.kv.put = async () => {
      await sleep(hangMs);
      throw new Error("cloud put blocked");
    };
    const pending = IO.putRawDetailed(KEY, data(2), { flush: true });
    await sleep(50);
    const during = localHas();
    const r = await pending;
    record("B1 云端最终失败时，本地已在挂起期间落盘", during === true,
      JSON.stringify({ localDuringHang: during, localOk: r.local.ok, cloudOk: r.cloud.ok }));
    record("B2 返回结构仍标记云端失败（供上层提示）",
      r.cloud.ok === false && r.local.ok === true,
      JSON.stringify({ cloud: r.cloud, local: r.local }));
  }

  // ── C 组：putRaw 语义不变（部分成功抛 SAVE_PARTIAL）──
  reset();
  {
    window.dzmm.kv.put = async () => { await sleep(50); throw new Error("cloud put blocked"); };
    let code = null;
    const pending = IO.putRaw(KEY, data(3), { flush: true }).catch(e => { code = e.code; });
    await sleep(20);
    const localDuring = localHas();
    await pending;
    record("C1 putRaw 仍抛 SAVE_PARTIAL（未被改动破坏）", code === "SAVE_PARTIAL",
      JSON.stringify({ code, localDuringHang: localDuring }));
  }

  // ── D 组：无云端能力时本地照常写 ──
  reset();
  mode.noPut = true;
  installKv();
  {
    const r = await IO.putRawDetailed(KEY, data(4), { flush: true });
    record("D1 无云端写入能力：本地仍已落盘", r.local.ok && localHas() && r.cloud.ok === null,
      JSON.stringify({ local: r.local, cloud: r.cloud }));
  }

  // ── E 组：先写本地不得让"本地旧档"顶掉云端较新进度 ──
  // 这是"先本地后云端"最需要防的副作用：本地先落了一份较旧的数据，
  // 而云端写入失败、仍保有较新版本时，读取侧必须取云端的那份。
  reset();
  {
    store.set(KEY, data(9));                 // 云端已有较新进度
    window.dzmm.kv.put = async () => { throw new Error("cloud put blocked"); };
    await IO.putRawDetailed(KEY, data(5), { flush: true }).catch(() => {});
    const read = await IO.getRawDetails(KEY, { strictCloud: true });
    const version = Number(read?.selected?._saveVersion);
    record("E1 本地先落旧档 + 云端写入失败：读取仍取云端较新的一份",
      version === 9 && localHas(),
      JSON.stringify({ selectedVersion: version, source: read?.source, localHas: localHas() }));
  }

  // ── F 组：云端写入成功时两边一致 ──
  reset();
  {
    store.set(KEY, data(9));
    await IO.putRawDetailed(KEY, data(5), { flush: true });
    const read = await IO.getRawDetails(KEY, { strictCloud: true });
    record("F1 云端写入成功：两边同版本", Number(read?.selected?._saveVersion) === 5 && localHas(),
      JSON.stringify({ selectedVersion: read?.selected?._saveVersion }));
  }

  // ── G 组：主存档 writer（saveMainSnapshot）──
  // 该路径不经过 putRawDetailed，是独立的写入实现，需单独验证。
  reset();
  mode.put = "hang";
  {
    const save = window.GameStoreMainSave({
      freshState: window.GameStoreMigrations.freshState,
      migrate: v => v,
    });
    const st = window.GameStoreMigrations.freshState();
    st.resources.gold = 42;
    const pending = save.save(st, { flush: true }).catch(e => ({ err: e.code || e.message }));
    await sleep(60);                       // 云端仍在挂起
    const during = global.localStorage.data.has(IO.key);
    const r = await pending;
    record("G1 主存档：云端挂起期间本地已落盘", during === true,
      JSON.stringify({ localDuringHang: during, localOk: r?.local?.ok, cloudOk: r?.cloud?.ok }));
  }

  // ── H 组：设置 writer 原本就先写本地，锁定该行为防回归 ──
  reset();
  mode.put = "hang";
  {
    const pending = window.GameStoreSettings
      .save({ sfxVolume: 55, musicVolume: 55, battleSpeed: 1, manualResponse: false })
      .then(() => null, e => e.code || e.message);
    await sleep(60);
    const during = global.localStorage.data.has(IO.settingsKey);
    await pending;
    record("H1 设置：云端挂起期间本地已落盘", during === true,
      JSON.stringify({ localDuringHang: during, key: IO.settingsKey }));
  }

  const failed = results.filter(r => !r.ok);
  console.log(`\n通过 ${results.length - failed.length}/${results.length}`);
  if (failed.length) {
    console.log("失败项：");
    failed.forEach(f => console.log(`  - ${f.name}  ${f.detail}`));
  }
  process.exit(failed.length ? 1 : 0);
})();
