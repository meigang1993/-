// 敌方打出「非初始牌」时的飞行牌动画：端到端复现「牌飞过去了但是空的」
//
// 复现背景：玩家反馈「敌方角色使用非初始牌有时候卡顿、动画卡没了」。
// 此前三版探针都失败，原因是环境固有噪声污染计数——开局摸牌动画本身就在
// 产生大量飞行体，敌方还会自动响应【闪】，飞行体数量根本分不清。
// 本测试按「作弊把闪去掉」的思路消噪：清空全场 response 手牌，敌方出牌就
// 只会产生它自己那一枚飞行体，计数干净可判定。
//
// 根因：battle-effect-card-dom.js 的 bindArt() 为每张飞行牌建了 cardArtReady
// Promise 并导出 ready(shell, timeout)，但此前没有任何一处 await 它——
// projectile() 一建出元素就立刻起飞，飞完立即 remove()。战斗中才拿到、美术
// 尚未缓存的牌（偷/摸/转化来的非初始牌）往往在图还没解码完时就被删掉，
// 玩家看到的就是「牌飞过去了但是空的」。
// 修复：flyPlay / flyPlayAoe 起飞前 await ready(fly, 320)，等不到照旧起飞。
//
// 判定指标不是 everReady（飞行总时长 500ms+，图哪怕 200ms 到最终也会补上），
// 而是「起飞瞬间牌面是否已就绪」+「有牌面的帧占飞行全程的比例」——
// 这正是玩家眼中「飞过去是空的」与「飞过去有牌面」的区别。
//
// file:// 下 Playwright 的 route 拦不住资源请求，无法可靠制造慢图，故「未缓存」
// 由接管 window.BattleEffectCardDOM.front 后替换 cardArtReady 来精确模拟：
// 它正是 bindArt 真实产出的那个 Promise，替换语义等价于「图 N ms 后才解码完」。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SLOW_MS = 120;      // 模拟未缓存美术的到达时间（加载+解码须落在 320ms 预算内）
const BUDGET_MS = 320;    // 与源码 ART_READY_BUDGET_MS 一致
const FLIGHT_MS = 540;    // flyPlay 单体：280 + 90 停顿 + 170

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

// 装飞行体采样器：MutationObserver 抓「起飞瞬间」，rAF 抓整个飞行过程
const INSTALL_PROBE = `(() => {
  window.__fx = { list: [], nextId: 1 };
  const seen = new WeakMap();
  // 起飞判据不能用「元素插入」：flyPlay/flyPlayAoe 里 fly.style.left 是在
  // await ready() 之后才设置的，插入那一刻还在等美术，用它当起飞点必然误判。
  // style.left 非空 == 起飞，这才是玩家眼中「牌飞过去」的那一段。
  const launched = el => !!el.style.left;
  const mo = new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (!(n instanceof HTMLElement)) continue;
      if (!n.classList.contains("flying-card")) continue;
      const rec = {
        id: window.__fx.nextId++, born: performance.now(), frames: 0,
        readyFrames: 0, everReady: false, startedFrames: 0, startedEmpty: 0,
        launchedAt: 0, readyAt: 0, hasImg: !!n.querySelector(".card-art img"),
        name: n.querySelector(".card-title b")?.textContent || "",
      };
      seen.set(n, rec);
      window.__fx.list.push(rec);
    }
  });
  mo.observe(document.body, { childList: true, subtree: true });
  const tick = () => {
    const now = performance.now();
    document.querySelectorAll(".flying-card").forEach(el => {
      const rec = seen.get(el);
      if (!rec) return;
      const img = el.querySelector(".card-art img");
      const ready = !!(img && img.complete && img.naturalWidth > 0);
      rec.frames++;
      if (ready) { rec.readyFrames++; rec.everReady = true; }
      if (launched(el)) {
        if (!rec.launchedAt) rec.launchedAt = now;
        rec.startedFrames++;
        // 起飞了却还是空的 —— 正是玩家反馈的「牌飞过去了但是空的」
        if (!ready) rec.startedEmpty++;
        else if (!rec.readyAt) rec.readyAt = now;
      }
      rec.last = now;
    });
    window.__fx.raf = requestAnimationFrame(tick);
  };
  window.__fx.raf = requestAnimationFrame(tick);
  window.__fx.stop = () => { mo.disconnect(); cancelAnimationFrame(window.__fx.raf); };
})()`;

// mode: "real" 真实(美术已缓存) / "slow" 图 200ms 才到 / "never" 图永不到
// shape: "single" 单体(flyPlay) / "aoe" 群体(flyPlayAoe)
const SETUP = mode => `(() => {
  const b = window.state.battle;
  // —— 作弊：去掉全场【闪】——没有它，敌方出牌后友方自动响应会再产生飞行体，
  // 计数被污染，根本无法判定「非初始牌那一张」到底有没有牌面。
  b.allies.concat(b.enemies).forEach(u => {
    u.hand = u.hand.filter(c => c.type !== "response");
  });
  window.__fxResponsesLeft = b.allies.concat(b.enemies)
    .reduce((n, u) => n + u.hand.filter(c => c.type === "response").length, 0);
  if (${JSON.stringify(mode)} !== "real") {
    // 「未缓存」必须作用在真实 img 上：只换 cardArtReady Promise 的话，
    // 真实 img 仍会照常几毫秒加载完，采样器看到的永远是「有牌面」，测不出差异。
    // 这里把真实 src 扣下、延迟 ${SLOW_MS}ms 再挂回去，等价于「图 ${SLOW_MS}ms 才到」。
    const dom = window.BattleEffectCardDOM;
    const orig = dom.front.bind(dom);
    dom.front = (card, enemy, cls) => {
      const shell = orig(card, enemy, cls);
      const img = shell.querySelector(".card-art img");
      const realSrc = img && img.getAttribute("src");
      if (!realSrc) return shell;
      img.removeAttribute("src");
      shell.cardArtReady = new Promise(resolve => {
        if (${JSON.stringify(mode)} !== "slow") return;   // "never"：永不加载
        setTimeout(() => {
          img.addEventListener("load", () => resolve(true), { once: true });
          img.addEventListener("error", () => resolve(false), { once: true });
          img.src = realSrc;
        }, ${SLOW_MS});
      });
      return shell;
    };
  }
  window.render();
})()`;

// shape: "single" 勒杀(1124号分裂体解锁牌，战斗中才拿到) / "aoe" 机枪扫杀
const PLAY = shape => `(() => {
  const b = window.state.battle;
  const foe = b.enemies[0];
  const me = b.allies[0];
  const card = ${shape === "aoe"
    ? `{ name: "机枪扫杀", type: "slash", power: 2, scale: "attack", suit: "♠",
         allTargets: true, text: "非初始牌探针" }`
    : `{ name: "勒杀", type: "slash", power: 1, scale: "attack", suit: "♠",
         text: "非初始牌探针" }`};
  foe.hand.push(card);
  b.animQueue.push({
    id: \`probe${"${Date.now()}"}\`, type: "enemyPlay", uid: foe.uid, side: "enemy",
    targetUid: me.uid, card, slashText: true, commit: () => {},
  });
  window.__fx.t0 = performance.now();
})()`;

async function runCase(browser, mode, shape) {
  // 必须独立 context：同一 browser 下 newPage() 共用 HTTP 缓存，
  // 美术会秒回，「未缓存」这个前提根本不成立。
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e).slice(0, 200)));
  try {
    await startRegressionBattle(page);
    await page.evaluate(INSTALL_PROBE);
    await page.evaluate(SETUP(mode));
    await page.evaluate(PLAY(shape));
    await page.waitForTimeout(mode === "never" ? 3000 : 2200);
    const out = await page.evaluate(() => ({
      list: window.__fx.list.map(r => ({
        id: r.id, name: r.name, frames: r.frames, readyFrames: r.readyFrames,
        everReady: r.everReady, hasImg: r.hasImg,
        startedFrames: r.startedFrames, startedEmpty: r.startedEmpty,
        launchDelay: Math.round((r.launchedAt || 0) - r.born),
        readyDelay: Math.round((r.readyAt || 0) - r.born),
        life: Math.round((r.last || r.born) - r.born),
      })),
      responsesLeft: window.__fxResponsesLeft,
      elapsed: Math.round(performance.now() - window.__fx.t0),
    }));
    return { ...out, errors: errors.slice(0, 2) };
  } catch (e) {
    return { err: String(e).slice(0, 300) };
  } finally {
    await context.close();
  }
}

(async () => {
  const browser = await chromium.launch();
  const cases = {
    "A 单体·美术已缓存": await runCase(browser, "real", "single"),
    ["B 单体·未缓存(" + SLOW_MS + "ms)"]: await runCase(browser, "slow", "single"),
    ["C 群体·未缓存(" + SLOW_MS + "ms)"]: await runCase(browser, "slow", "aoe"),
    "D 单体·美术永不到": await runCase(browser, "never", "single"),
  };
  await browser.close();

  console.log("\n===== 敌方打出非初始牌的飞行动画 =====");
  for (const [label, r] of Object.entries(cases)) {
    console.log(`\n-- ${label} --`);
    if (r.err) {
      console.log(`   ❌ ${r.err}`);
      T(`${label} 可运行`, false, r);
      continue;
    }
    console.log(`   飞行体=${r.list.length} 用时=${r.elapsed}ms 剩余响应牌=${r.responsesLeft}`);
    r.list.forEach(f => console.log(
      `     ${f.name}: 存活${f.life}ms 起飞延迟=${f.launchDelay}ms 图到位=${f.readyDelay}ms`
      + ` 起飞后帧=${f.startedFrames} 其中空牌帧=${f.startedEmpty}`));

    // 消噪前提必须成立，否则后面的计数全是噪声
    T(`${label} 已去掉全部【闪】(计数的前提)`, r.responsesLeft === 0, r);
    T(`${label} 敌方出牌只产生 1 枚飞行体`, r.list.length === 1, r);

    const fly = r.list[0];
    if (!fly) continue;
    if (label.startsWith("A")) {
      T("A 牌名是打出的那张非初始牌", fly.name === "勒杀", fly);
      T("A 飞行体带牌面图元素", fly.hasImg === true, fly);
      T("A 起飞后没有空牌帧", fly.startedFrames > 0 && fly.startedEmpty === 0, fly);
    } else if (label.startsWith("B") || label.startsWith("C")) {
      // 核心：修复前是「先起飞、图半路才补上」，修复后是「等图到位再起飞」
      T(`${label[0]} 起飞发生在图到位之后`, fly.launchDelay >= fly.readyDelay, fly);
      T(`${label[0]} 起飞后没有空牌帧`, fly.startedFrames > 0 && fly.startedEmpty === 0, fly);
      T(`${label[0]} 等待未拖长飞行(预算 ${BUDGET_MS}ms)`,
        fly.life <= FLIGHT_MS + BUDGET_MS + 250, fly);
    } else {
      // 图永远不到时不能卡死：等满预算就照旧起飞
      T("D 图永不到也不卡死(预算内起飞)", fly.life <= FLIGHT_MS + BUDGET_MS + 400, fly);
      T("D 飞行仍然完整发生", fly.startedFrames > 0, fly);
    }
    if (r.errors?.length) T(`${label[0]} 无页面错误`, false, r.errors);
  }

  // 静态契约：两条飞行路径都必须真的调用 ready()
  console.log("\n-- E 静态契约：飞行路径已接入 ready() --");
  const root = path.join(__dirname, "..", "src", "original");
  const enemyFlight = fs.readFileSync(
    path.join(root, "battle-effect-played-card-flight.js"), "utf8");
  const playerPlay = fs.readFileSync(path.join(root, "battle-effect-play.js"), "utf8");
  const enemyCalls = (enemyFlight.match(/BattleEffectCardDOM\?\.ready/g) || []).length;
  const playerCalls = (playerPlay.match(/BattleEffectCardDOM\?\.ready/g) || []).length;
  console.log(`   敌方飞行路径 ${enemyCalls} 处（flyPlay + flyPlayAoe），玩家路径 ${playerCalls} 处`);
  T("敌方 flyPlay/flyPlayAoe 两处都等美术", enemyCalls === 2, { enemyCalls });
  T("玩家出牌飞行也等美术", playerCalls >= 1, { playerCalls });

  console.log(`\n汇总：${pass} 通过 / ${total - pass} 失败`);
  process.exit(pass === total ? 0 : 1);
})();
