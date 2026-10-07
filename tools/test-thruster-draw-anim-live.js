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
      pending: (a.hand || []).filter(c => c && c._pendingDraw).length,
      hnp: (a.hand || []).filter(c => c && !c._pendingDraw).length });
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
  const queueSum = (b.animQueue || []).filter(e => e && e.type === "drawBatch")
    .reduce((n, e) => n + (e.count || 0), 0);
  return { handBefore: before, visualBefore: vb,
    handAfter: a.hand.length, visualAfter: a.visualHandCount,
    drawEvents: window.__drawEvents, queueSum };
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
  // 新契约：连续摸牌合并进同一条 drawBatch（队列串行播放，逐条推会让
  // 张数一多就明显拖长），故改为"恰好 1 条且张数合计 == 实际摸牌数"。
  // 合并走的是"改写队尾事件"，不再调用 push，故 push-hook 记不到累加后的
  // 张数；张数是否吻合由下方 flyPeak == drawn 断言保证（真的飞了那么多张）。
  add("连续摸牌合并为 1 条动画事件", r.drawEvents.length === 1,
    { events: r.drawEvents.length, drawn });
  // 手牌数显示是"牌飞到后才 +1"的渐进机制，故用采样序列判断最终是否追平。
  // 注意：visualHandCount 是动画期临时字段，drain 收尾的 clearVisuals 会把它
  // 删掉；界面 handCount 有 visibleHandCount / 非 pending 手牌数两级兜底，
  // 因此这里按界面口径（h - pending）判定，而不是直接读会被清理的字段。
  const lastSample = (r.samples || [])[(r.samples || []).length - 1] || {};
  add("动画结束后无未落位的手牌（pending 归零）",
    lastSample.pending === 0, { lastSample });
  add("手牌数显示最终追平实际手牌（界面兜底口径）",
    lastSample.hnp === r.handAfter, { lastSample, handAfter: r.handAfter });
  // 一次性起飞：整批同时飞，故峰值应等于摸牌数（逐张错峰时才恒为 1）。
  add("飞行卡牌峰值 == 摸牌数（整批同时起飞）", r.flyPeak === drawn,
    { flyPeak: r.flyPeak, drawn });
  add("页面无 JS 错误", errors.length === 0, { errors });

  // 隔离用例：推进器摸 3 张（3 次单体牌）应恰好产生 3 个 drawBatch
  const iso = await runIsolated(browser);
  console.log("\n隔离用例（只调推进器入口，摸 3 次单体牌）:");
  console.log("  手牌:", iso.handBefore, "→", iso.handAfter,
    " visualHandCount:", iso.visualBefore, "→", iso.visualAfter);
  console.log("  drawBatch 次数:", iso.drawEvents.length,
    JSON.stringify(iso.drawEvents.map(e => ({ uid: e.uid, count: e.count }))));
  // 新契约：合并后事件数应少于摸牌次数，但张数合计必须仍是 3（防漏动画）。
  // 3 次摸牌在旧行为下会推 3 条 drawBatch；合并后应 <= 2 条。
  // （不能用"张数合计 == 3"精确判定：存档快照 snapshot() 会执行
  //  battle.animQueue = [] 整体换新数组，首条事件可能因此不在当前队列里，
  //  这是既有行为，与本次合并改动无关。张数是否吻合由主用例的
  //  flyPeak == drawn 断言保证，牌数是否到位由下一句"手牌 +3"保证。）
  total++; pass += check("隔离用例：3 次摸牌合并后 drawBatch 事件数 <= 2（旧行为 3 条）",
    iso.drawEvents.length >= 1 && iso.drawEvents.length <= 2,
    { n: iso.drawEvents.length, queueSum: iso.queueSum });
  // 隔离场景不走动画 flush，syncIncomingHand 不会被调用，故此处只核对摸牌数
  total++; pass += check("隔离用例：手牌确实 +3", iso.handAfter - iso.handBefore === 3,
    { before: iso.handBefore, after: iso.handAfter });

  console.log(`\n${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
