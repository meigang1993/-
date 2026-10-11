// 端到端确认：真实 getRawDetails 在云端读取抛错时的返回字段，以及真实 purge 是否删除
// 修复依赖 cloudAvailable=true && cloudReadFailed=true；若实际不是这个值则修复失效。
// 注意：测试环境本身没有云端 SDK（openGame 断言 dzmm 为 undefined），
// 故在页面加载完成后再注入会抛错的 kv.get，模拟「有云端但本次读失败」。
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

  const out = await page.evaluate(async () => {
    window.dzmm = { kv: { get: async () => { throw new Error("network down"); } } };
    const KEY = "succubus-kill-save-v1";
    localStorage.setItem(KEY, JSON.stringify({ gold: 777 })); // 旧档：无 saveEpoch
    const d = await window.GameStoreIO.getRawDetails(KEY, {
      strictCloud: true, allowLocalOnCloudFailure: true,
    });
    return {
      cloudAvailable: d.cloudAvailable,
      cloudReadFailed: d.cloudReadFailed,
      cloudExists: d.cloudExists,
      localExists: d.localExists,
      code: d.cloudError?.code || null,
    };
  });

  console.log("真实 getRawDetails 返回：", JSON.stringify(out), "\n");
  T("cloudAvailable=true（有云端 SDK）", out.cloudAvailable === true, out);
  T("cloudReadFailed=true（本次读失败）", out.cloudReadFailed === true, out);
  T("cloudExists=false（读不到即视为不存在）", out.cloudExists === false, out);
  T("localExists=true（本地旧档在）", out.localExists === true, out);

  const res = await page.evaluate(async () => {
    const r = await window.GameStore.purgeLegacySaves();
    return {
      purged: r.purged, kept: r.kept,
      stillThere: !!localStorage.getItem("succubus-kill-save-v1"),
    };
  });
  console.log("\n真实 purge 结果：", JSON.stringify(res));
  T("旧档未被删除（云端不可确认 → 保守保留）", res.stillThere === true, res);
  T("计入 kept 而非 purged", (res.purged || []).length === 0, res);

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error("崩溃:", err.message); process.exit(1); });
