// 云端严格检查：写入侧与删除侧的一致性。
//
// 关注三类会导致「玩家进度丢失 / 幽灵存档」的场景：
//   A. 云端写入失败时，本地是否仍然落盘（putRawDetailed 的策略是云端成功才写本地）
//   B. 云端删除失败时，本地是否已被删（delRaw 先删云端再删本地，失败仍抛）
//   C. SDK 只有 get/put 没有 delete 时，本地是否已被删
// 测试环境本身没有云端 SDK，故在页面加载完成后注入内存版 dzmm.kv 模拟各类故障。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const { openGame } = require("../tests/helpers/preview-game.js");

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await openGame(page);

  // 探测可用的存档快照来源
  const probe = await page.evaluate(() => {
    const keys = Object.keys(window.GameStore || {});
    const state = window.GameStore?.freshState?.() || null;
    let ok;
    try { ok = !!window.GameStoreSaveLimits.validateRaw(state); } catch (e) { ok = false; }
    return { keys: keys.slice(0, 40), hasState: !!state, validateOk: ok };
  });
  console.log("探测:", JSON.stringify(probe), "\n");
  T("能取到合法存档快照作为测试数据", probe.validateOk === true, probe);
  if (!probe.validateOk) { await browser.close(); console.log(`\n通过 ${pass}/${total}`); process.exit(1); }

  const SLOT = "succubus-kill-slot-1-v1";

  // A1: 云端写入成功 → 本地与云端都应存在
  const a1 = await page.evaluate(async SLOT => {
    const store = {};
    window.dzmm = { kv: {
      get: async k => ({ value: store[k] ?? null }),
      put: async (k, v) => { store[k] = v; },
      delete: async k => { delete store[k]; },
    } };
    localStorage.removeItem(SLOT);
    const data = window.GameStore.freshState();
    const r = await window.GameStoreIO.putRawDetailed(SLOT, data, { flush: true });
    return {
      local: r.local, cloud: r.cloud,
      localThere: !!localStorage.getItem(SLOT),
      cloudThere: !!store[SLOT],
    };
  }, SLOT);
  console.log("A1 云端写入成功:", JSON.stringify(a1));
  T("A1 云端写入成功 → 云端有数据", a1.cloudThere === true, a1);
  T("A1 云端写入成功 → 本地也有数据", a1.localThere === true, a1);

  // A2: 云端写入失败 → 本地是否仍落盘？（putRawDetailed: localAttempted = !cloudAvailable || savedCloud）
  const a2 = await page.evaluate(async SLOT => {
    window.dzmm = { kv: {
      get: async () => null,
      put: async () => { throw new Error("kv put down"); },
      delete: async () => {},
    } };
    localStorage.removeItem(SLOT);
    const data = window.GameStore.freshState();
    const r = await window.GameStoreIO.putRawDetailed(SLOT, data, { flush: true });
    return {
      local: r.local, cloud: r.cloud,
      localThere: !!localStorage.getItem(SLOT),
    };
  }, SLOT);
  console.log("A2 云端写入失败:", JSON.stringify(a2));
  T("A2 云端写入失败 → 云端确认失败", a2.cloud.ok === false, a2);
  T("A2 云端写入失败 → 本地仍落盘（不应丢进度）", a2.localThere === true, a2);

  // B: 云端删除失败 → 本地是否已被删
  const b = await page.evaluate(async SLOT => {
    const store = {};
    window.dzmm = { kv: {
      get: async k => ({ value: store[k] ?? null }),
      put: async (k, v) => { store[k] = v; },
      delete: async () => { throw new Error("kv delete down"); },
    } };
    const data = window.GameStore.freshState();
    await window.GameStoreIO.putRawDetailed(SLOT, data, { flush: true });
    const beforeLocal = !!localStorage.getItem(SLOT);
    const beforeCloud = !!store[SLOT];
    let error = null;
    try { await window.GameStoreIO.delRaw(SLOT); }
    catch (e) { error = e.code || e.message; }
    return {
      beforeLocal, beforeCloud, error,
      afterLocal: !!localStorage.getItem(SLOT),
      afterCloud: !!store[SLOT],
    };
  }, SLOT);
  console.log("B 云端删除失败:", JSON.stringify(b));
  T("B 删除前两边都有数据", b.beforeLocal === true && b.beforeCloud === true, b);
  T("B 云端删除失败 → 抛错（调用方可知情）", !!b.error, b);
  T("B 云端删除失败 → 本地不应被删（否则本地没了云端还在）", b.afterLocal === true, b);

  // C: SDK 有 get/put 但无 delete → 本地是否已被删
  const c = await page.evaluate(async SLOT => {
    const store = {};
    window.dzmm = { kv: {
      get: async k => ({ value: store[k] ?? null }),
      put: async (k, v) => { store[k] = v; },
      // 没有 delete
    } };
    const data = window.GameStore.freshState();
    await window.GameStoreIO.putRawDetailed(SLOT, data, { flush: true });
    const beforeLocal = !!localStorage.getItem(SLOT);
    let error = null;
    try { await window.GameStoreIO.delRaw(SLOT); }
    catch (e) { error = e.code || e.message; }
    return {
      beforeLocal, error,
      afterLocal: !!localStorage.getItem(SLOT),
      afterCloud: !!store[SLOT],
    };
  }, SLOT);
  console.log("C 云端无 delete 能力:", JSON.stringify(c));
  T("C 无 delete 能力 → 报错 CLOUD_DELETE_UNAVAILABLE", c.error === "CLOUD_DELETE_UNAVAILABLE", c);
  T("C 无 delete 能力 → 本地不应被删", c.afterLocal === true, c);

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error("崩溃:", err.message); process.exit(1); });
