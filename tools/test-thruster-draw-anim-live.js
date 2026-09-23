// 诊断：推进器（单体杀，摸 1 张）是否存在动画重复 / 手牌数不同步
// 关注点：
//   1) drawBatch 动画事件被 push 了几次（draw() 内部已推一次，推进器若再推就是重复）
//   2) 实际手牌增量 vs visualHandCount 增量
//   3) 飞行中的卡牌 DOM 峰值数量
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

// 记录 animQueue 上所有 drawBatch 事件，并采样飞行 DOM 峰值
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  b.activeUid = a.uid; b.phase = 4; b.locked = false;
  a.intent = 5; a.battleRelics = ["推进器"];
  a.hand = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }];
  a.visualHandCount = 1;
  b.enemies.forEach(e => { e.hand = []; e.block = 0; e.hp = 200; });
  st.log = [];
  window.__drawEvents = [];
  window.__flyPeak = 0;
  const q = b.animQueue || (b.animQueue = []);
  const origPush = q.push.bind(q);
  q.push = function (...items) {
    items.forEach(it => {
      if (it && it.type === "drawBatch") {
        const st = (new Error().stack || "").split(String.fromCharCode(10)).slice(1, 6)
          .map(x => x.trim()).join(" | ");
        window.__drawEvents.push({ uid: it.uid, side: it.side, count: it.count,
          cards: (it.cards || []).length, stack: st });
      }
    });
    return origPush(...items);
  };
  window.__samples = [];
  window.__sampleTimer = setInterval(() => {
    window.__samples.push({ t: Date.now() % 100000,
      v: a.visualHandCount, h: (a.hand || []).length,
      pending: (a.hand || []).filter(c => c && c._pendingDraw).length });
  }, 40);
  window.__flyTimer = setInterval(() => {
    const n = document.querySelectorAll(".draw-card-fly").length;
    if (n > window.__flyPeak) window.__flyPeak = n;
  }, 30);
  window.render();
  return { handBefore: a.hand.length, visualBefore: a.visualHandCount };
})()`;

const playTpl = `(() => {
  const st = window.state, b = st.battle;
  const ok = window.BattleSystem.playActiveCard(st, 0, b.enemies[0].uid);
  return { ok };
})()`;

const peekTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  return {
    handAfter: (a.hand || []).length,
    visualAfter: a.visualHandCount,
    drawEvents: window.__drawEvents || [],
    samples: (window.__samples || []).filter((s, i, arr) =>
      i === 0 || s.v !== arr[i - 1].v || s.h !== arr[i - 1].h),
    flyPeak: window.__flyPeak,
    logs: (st.log || []).slice(0, 100).map(String),
  };
})()`;

// 隔离用例：只调推进器入口，排除出牌流程中其它摸牌来源
const isolatedTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  b.activeUid = a.uid; b.locked = false;
  a.intent = 5; a.battleRelics = ["推进器"];
  a.hand = []; a.visualHandCount = 0;
  b.enemies.forEach(e => { e.hp = 200; });
  window.__drawEvents = [];
  const q = b.animQueue || (b.animQueue = []);
  const origPush = q.push.bind(q);
  q.push = function (...items) {
    items.forEach(it => {
      if (it && it.type === "drawBatch") {
        const stk = (new Error().stack || "").split(String.fromCharCode(10)).slice(1, 6)
          .map(x => x.trim()).join(" | ");
        window.__drawEvents.push({ uid: it.uid, count: it.count, stack: stk });
      }
    });
    return origPush(...items);
  };
  const card = { name: "杀", type: "slash", suit: "\u2660", scale: "attack" };
  const before = a.hand.length, vb = a.visualHandCount;
  for (let n = 1; n <= 3; n++) {
    const c = Object.assign({}, card);
    window.RuinsRelicEffects.afterCardPlayed(st, a, b.enemies[0], c, window.BattleSystem.draw);
  }
  return { handBefore: before, visualBefore: vb,
    handAfter: a.hand.length, visualAfter: a.visualHandCount,
    drawEvents: window.__drawEvents };
})()`;

const runIsolated = async browser => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await openGame(page);
  await startRegressionBattle(page);
  const r = await page.evaluate(isolatedTpl);
  await page.close();
  return r;
};

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  const before = await page.evaluate(setupTpl);
  await page.evaluate(playTpl);
  await page.waitForTimeout(6000);
  const r = await page.evaluate(peekTpl);
  await page.close();

  console.log("摸牌前:", JSON.stringify(before));
  console.log("摸牌后:", JSON.stringify({
    handAfter: r.handAfter, visualAfter: r.visualAfter, flyPeak: r.flyPeak,
  }));
  console.log("drawBatch 次数:", r.drawEvents.length,
    JSON.stringify(r.drawEvents.map(e => ({ uid: e.uid, count: e.count }))));
  const thrusterLogs = r.logs.filter(l => l.includes("推进器"));
  console.log("推进器日志:", JSON.stringify(thrusterLogs));
  console.log("全部日志:", JSON.stringify(r.logs));
  console.log("visualHandCount 变化序列:", JSON.stringify(r.samples));

  let pass = 0, total = 0;
  const add = (n, c, e) => { total++; pass += check(n, c, e); };

  add("推进器确实触发（日志存在）", thrusterLogs.length >= 1, { logs: thrusterLogs });
  add("实际手牌 +1", r.handAfter - before.handBefore === 1,
    { delta: r.handAfter - before.handBefore });
  // 打出 1 张后手牌净变化 = 摸牌数 - 1，故摸牌数 = handAfter - (handBefore - 1)
  const drawn = r.handAfter - (before.handBefore - 1);
  add("动画次数 == 实际摸牌数（不多不少）", r.drawEvents.length === drawn,
    { events: r.drawEvents.length, drawn });
  // 手牌数显示是"牌飞到后才 +1"的渐进机制，故用采样序列判断最终是否追平
  const reached = (r.samples || []).some(s => s.v === r.handAfter);
  add("手牌数显示最终追平实际手牌（动画结束后）", reached,
    { samples: r.samples, handAfter: r.handAfter });
  add("飞行卡牌峰值 <= 1", r.flyPeak <= 1, { flyPeak: r.flyPeak });
  add("页面无 JS 错误", errors.length === 0, { errors });

  // 隔离用例：推进器摸 3 张（3 次单体牌）应恰好产生 3 个 drawBatch
  const iso = await runIsolated(browser);
  console.log("\n隔离用例（只调推进器入口，摸 3 次单体牌）:");
  console.log("  手牌:", iso.handBefore, "→", iso.handAfter,
    " visualHandCount:", iso.visualBefore, "→", iso.visualAfter);
  console.log("  drawBatch 次数:", iso.drawEvents.length,
    JSON.stringify(iso.drawEvents.map(e => ({ uid: e.uid, count: e.count }))));
  total++; pass += check("隔离用例：摸 3 张 → drawBatch 恰好 3 次（1 牌 1 动画）",
    iso.drawEvents.length === 3, { n: iso.drawEvents.length });
  // 隔离场景不走动画 flush，syncIncomingHand 不会被调用，故此处只核对摸牌数
  total++; pass += check("隔离用例：手牌确实 +3", iso.handAfter - iso.handBefore === 3,
    { before: iso.handBefore, after: iso.handAfter });

  console.log(`\n${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
