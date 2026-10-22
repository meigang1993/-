// 飞行牌美术就绪：ready() 真的会等，且等不到也不卡死
//
// 修复背景：battle-effect-card-dom.js 的 bindArt() 为每张飞行牌建了
// cardArtReady Promise 并导出 ready(shell, timeout)，但全库没有任何一处
// await 它——projectile() 一建出元素就立刻 runAnim，飞完立即 remove()。
// 战斗中才拿到、美术尚未缓存的牌（偷/摸/转化来的非初始牌）往往在图还没
// 解码完时就被删掉，玩家看到的就是「牌飞过去了但是空的」。
//
// 修复：敌方（battle-effect-played-card-flight.js 的 flyPlay / flyPlayAoe）
// 与玩家（battle-effect-play.js）两条出牌飞行路径，起飞前都先
// await BattleEffectCardDOM.ready(fly, 320)，等不到就照旧起飞。
//
// 本测试不依赖战斗调度器（开局摸牌动画/敌方自动响应会污染计数），改为
// 直接验证这个等待本身的三个性质，再静态确认两条飞行路径都真的调用了它：
//   1. 美术延迟到达时，ready() 会等到图就绪才返回（返回 true）
//   2. 等待有硬上限：图永远不到时，ready() 在预算内返回，绝不挂住
//   3. 美术本来就缓存好时，ready() 立即返回，不引入额外停顿
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { openGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const ART_DELAY_MS = 120;   // 模拟未缓存美术的到达时间
const BUDGET_MS = 320;      // 与源码里 ART_READY_BUDGET_MS 一致

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

// case: "delayed" 延迟到达 / "never" 永不到达 / "cached" 已缓存
// mode: "waits" 图 120ms 后到 / "never" 图永远不到 / "cached" 图已就绪
// 直接接管 bindArt 真实产出的那个 cardArtReady Promise：
// file:// 下 Playwright 的 route 拦不住资源请求，改用控制 Promise 最确定。
const PROBE = mode => `(() => {
  const MODE = ${JSON.stringify(mode)};
  const dom = window.BattleEffectCardDOM;
  if (!dom?.front || !dom?.ready) return { unsupported: true };
  const shell = dom.front({ name: "探针牌", type: "slash", suit: "♠" }, true);
  if (MODE === "waits") {
    shell.cardArtReady = new Promise(r => setTimeout(() => r(true), ${ART_DELAY_MS}));
  } else if (MODE === "never") {
    shell.cardArtReady = new Promise(() => {});
  } else {
    shell.cardArtReady = Promise.resolve(true);
  }
  const t0 = performance.now();
  return dom.ready(shell, ${BUDGET_MS}).then(ok => {
    const took = Math.round(performance.now() - t0);
    shell.remove();
    return { ok, took };
  });
})()`;

async function runCase(browser, kind) {
  // 必须独立 context：同一 browser 下 newPage() 共用 HTTP 缓存，
  // 图会秒回，延迟/拦截根本不会生效。
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  try {
    // file:// 下 route 拦截无效，延迟改由 cardArtReady 直接控制
    await openGame(page);
    return { ...(await page.evaluate(PROBE(kind))), errors: errors.slice(0, 2) };
  } catch (e) {
    return { err: String(e).slice(0, 200) };
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  const out = {};
  for (const kind of ["waits", "never", "cached"]) out[kind] = await runCase(browser, kind);
  await browser.close();

  console.log("\n===== 飞行牌美术就绪 ready() =====");
  const LABEL = { waits: "A 美术延迟到达(120ms)", never: "B 美术永不到达", cached: "C 美术已缓存" };
  for (const kind of ["waits", "never", "cached"]) {
    const r = out[kind];
    console.log(`\n-- ${LABEL[kind]} --`);
    if (r.err || r.unsupported) {
      console.log(`   ❌ ${r.err || "模块未装配"}`);
      T(`${LABEL[kind]} 可运行`, false, r);
      continue;
    }
    console.log(`   ok=${r.ok} 耗时=${r.took}ms`);
    if (kind === "waits") {
      T(`${LABEL[kind]} 等到图就绪才返回(true)`, r.ok === true, r);
      T(`${LABEL[kind]} 确实等了(${ART_DELAY_MS}ms 量级)`, r.took >= ART_DELAY_MS, r);
    } else if (kind === "never") {
      T(`${LABEL[kind]} 不挂死(预算 ${BUDGET_MS}ms 内返回)`, r.took <= BUDGET_MS + 200, r);
    } else {
      T(`${LABEL[kind]} 立即返回(<${ART_DELAY_MS}ms)`, r.took < ART_DELAY_MS, r);
    }
    if (r.errors?.length) console.log(`   页面错误=${r.errors.join(";")}`);
  }

  // 静态契约：两条飞行路径都必须真的调用 ready()
  console.log("\n-- D 静态契约：飞行路径已接入 ready() --");
  const root = path.join(__dirname, "..", "src", "original");
  const enemyFlight = fs.readFileSync(
    path.join(root, "battle-effect-played-card-flight.js"), "utf8");
  const playerPlay = fs.readFileSync(path.join(root, "battle-effect-play.js"), "utf8");
  const enemyCalls = (enemyFlight.match(/BattleEffectCardDOM\?\.ready/g) || []).length;
  const playerCalls = (playerPlay.match(/BattleEffectCardDOM\?\.ready/g) || []).length;
  console.log(`   敌方飞行路径调用 ${enemyCalls} 处（flyPlay + flyPlayAoe），玩家路径 ${playerCalls} 处`);
  T("敌方 flyPlay/flyPlayAoe 两处都等美术", enemyCalls === 2, { enemyCalls });
  T("玩家出牌飞行也等美术", playerCalls >= 1, { playerCalls });

  console.log(`\n汇总：${pass} 通过 / ${total - pass} 失败`);
  process.exit(pass === total ? 0 : 1);
})();
