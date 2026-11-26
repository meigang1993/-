// 拆分后真实浏览器「零副作用」探针：完整加载 publish/index.html，
// 验证 3 个子模块已装配、主模块导出未缺失、无页面/控制台错误、真实开局可用。
const path = require("path");
const { chromium } = require("playwright");
const { openGame, collectErrors, relevantErrors, startFreshGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const results = [];
const check = (n, ok, d = "") => {
  results.push({ n, ok: !!ok, d });
  console.log(`${ok ? "OK  " : "FAIL"} ${n}${d ? " — " + JSON.stringify(d) : ""}`);
};

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const errors = collectErrors(page);
  await openGame(page);

  const probe = await page.evaluate(() => {
    const subs = ["RuinsDragonTailGun", "LocalCoreDungeonSettlement", "RuinsElitePrepareSkills"];
    const mains = {
      RuinsDragonSkills: ["prepare", "afterDamage", "endTurn", "beforeCardPlayed", "allyTurnStart", "aiMove", "recordedSuits"],
      LocalCoreDungeonOps: ["startDungeon", "settleDungeon", "bankRun", "settleDefeat"],
      RuinsEliteSkills: ["prepare", "backstabEndPhase", "useBackstab", "stealthOn", "blocksKillTarget",
        "helicopterMove", "afterDodged", "modifyDamage", "immuneIncoming", "beforeHeal", "carrierRamMove", "endTurn"],
    };
    const subDetail = {}, mainDetail = {};
    subs.forEach(k => {
      const v = window[k];
      subDetail[k] = { exists: !!v, type: typeof v,
        keys: v && typeof v === "object" ? Object.keys(v).sort() : [] };
    });
    Object.entries(mains).forEach(([k, keys]) => {
      const v = window[k];
      mainDetail[k] = { exists: !!v,
        missing: keys.filter(x => typeof v?.[x] !== "function"),
        extra: v ? Object.keys(v).filter(x => !keys.includes(x)).sort() : [] };
    });
    return { subDetail, mainDetail, state: !!window.state,
      render: typeof window.render, bundleCount: document.querySelectorAll('script[src*="bundles/"]').length };
  });

  console.log("=== 真实页面装配状态 ===");
  console.log(JSON.stringify(probe, null, 2));
  check("X1 三个子模块全局均已挂载且是对象",
    Object.values(probe.subDetail).every(x => x.exists && x.type === "object"));
  check("X2 子模块导出与拆分预期一致（集合比对，不受键顺序影响）",
    probe.subDetail.RuinsDragonTailGun.keys.join() === "fireTailGun"
    && probe.subDetail.LocalCoreDungeonSettlement.keys.join() === "settleDungeon"
    && probe.subDetail.RuinsElitePrepareSkills.keys.join() === "reinforce,shadowDance");
  check("X3 三个主模块导出的每个 API 都是函数（与拆分前逐一比对）",
    Object.values(probe.mainDetail).every(x => x.exists && x.missing.length === 0),
    probe.mainDetail);
  check("X4 主模块未多出意外导出",
    Object.values(probe.mainDetail).every(x => x.extra.length === 0),
    Object.fromEntries(Object.entries(probe.mainDetail).map(([k, v]) => [k, v.extra])));
  // index.html 静态只引 3 个启动包，战斗包由运行时按需插入；此处只要求启动链已加载。
  check("X5 页面基础运行时完好（state / render / 启动包已加载）",
    probe.state && probe.render === "function" && probe.bundleCount >= 3,
    { state: probe.state, render: probe.render, bundlesLoaded: probe.bundleCount });

  // 真实开局：走一遍启动流程，确认拆分没有打断 UI 初始化链
  try {
    await startFreshGame(page);
    const ok = await page.evaluate(() => !!window.state && !!document.querySelector("#app, #game, body"));
    check("X6 真实开局流程可完成", ok);
  } catch (e) {
    check("X6 真实开局流程可完成", false, String(e.message).slice(0, 200));
  }

  const rel = relevantErrors(errors);
  check("X7 无 pageerror / console error", rel.length === 0, rel.slice(0, 6));

  await browser.close();
  const bad = results.filter(r => !r.ok);
  console.log(`RESULT ${results.length - bad.length}/${results.length}`);
  if (bad.length) process.exit(1);
})().catch(e => { console.error("PROBE_CRASH", e); process.exit(1); });
