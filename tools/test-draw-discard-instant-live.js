// 专项：战斗中摸牌 / 弃牌动画改为「一次性」
//
// 旧行为有两层拖慢：
//  1) 批次内逐张错峰起飞（每张 +100ms stagger），摸 8 张要 1090ms；
//  2) 逐张 put() 每张推一条 discardBatch，队列串行播放，弃 8 张要连播
//     8 段（实测 4565ms，随张数线性变长）。
// 新行为：
//  1) 摸牌 / 弃牌统一 stagger:0，整批同时起飞、一次落位；
//  2) 紧邻的、同一角色、同一去向的弃牌合并进队尾事件；
//     紧邻的、同一角色的摸牌同样合并。
//
// 判据（可证伪）：
//  · 摸 N 张 → 1 条 drawBatch，count == N，动画耗时不随 N 增长
//  · 逐张弃 N 张 → 1 条 discardBatch（不再 N 条），count == N
//  · 弃牌确实落到弃牌堆（合并动画不能吞掉实际弃牌）
//  · 摸牌确实进手（合并动画不能吞掉实际摸牌）
//
// 防假通过：
//  1) 先断言牌堆/手牌构造成功，否则"摸 0 张"也会算通过；
//  2) 用两个张数（4、8）对比耗时，单一张数无法证明"不再随张数增长"；
//  3) 弃牌后核对弃牌堆增量 == 张数，防止"动画合并了但牌没真弃"。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass += 1; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

// 摸牌：返回事件结构与实际耗时
async function drawCase(page, n) {
  return page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    b.animQueue = []; b.locked = false;
    const u = b.allies[0];
    u.pileStats = u.pileStats || {};
    u.pileStats.deck = u.pileStats.deck || [];
    while (u.pileStats.deck.length < 40) {
      u.pileStats.deck.push(window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
    }
    u.hand = [];
    const deckBefore = u.pileStats.deck.length;
    const t0 = performance.now();
    window.BattleSystem.draw(u, ${n}, b);
    // 快照必须在 render() 之前取：render() 会触发 drain，drain 可能同步
    // 把队列消费干净，晚读就会得到 batchCount=0（动画其实已经播了）。
    const q = b.animQueue || [];
    const batches = q.filter(e => e && e.type === "drawBatch");
    // 必须显式驱动：推事件只是入队，队列由 render() 触发 drain 才消费。
    // 不调 render 的话队列永远不动，_pendingDraw 不会清，等待循环会跑满
    // deadline——表现为"摸 N 张永远落不了位"的假失败。
    window.render && window.render();
    // 等到"牌确实落位"为止：仅看队列空会过早退出——存档快照会用
    // battle.animQueue = [] 整体换新数组，队列看着是空的但动画其实没播，
    // _pendingDraw 也就不会被 transfer 的 clearPending 清掉。
    const deadline = t0 + 30000;
    while (performance.now() < deadline) {
      const pend = (u.hand || []).filter(c => c && c._pendingDraw).length;
      if (!pend && !(b.animQueue || []).length && !b.locked) break;
      await new Promise(r => setTimeout(r, 50));
    }
    return {
      deckBefore,
      handAfter: (u.hand || []).length,
      pending: (u.hand || []).filter(c => c && c._pendingDraw).length,
      batchCount: batches.length,
      counts: batches.map(e => e.count),
      ms: Math.round(performance.now() - t0),
    };
  })()`);
}

// 弃牌：逐张 put（旧行为会产生 N 条事件）
async function discardEachCase(page, n) {
  return page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    b.animQueue = []; b.locked = false;
    const u = b.allies[0];
    u.pileStats = u.pileStats || {};
    u.pileStats.discard = u.pileStats.discard || [];
    const discardBefore = u.pileStats.discard.length;
    u.hand = [];
    while (u.hand.length < ${n}) {
      u.hand.push(window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
    }
    const cards = u.hand.splice(0, ${n});
    const t0 = performance.now();
    cards.forEach(c => window.BattleCards.put(b, u, c, "discard"));
    // 同摸牌：快照先取（render() 会同步消费队列），再 render() 驱动。
    const q = b.animQueue || [];
    const batches = q.filter(e => e && e.type === "discardBatch");
    window.render && window.render();
    // 让动画元素先创建，否则一开始查不到 .flying-card 会立刻退出，
    // 测到的 ms 是"队列清空"而非"动画播完"，无法反映真实时长。
    await new Promise(r => setTimeout(r, 250));
    const deadline = t0 + 60000;
    while (performance.now() < deadline) {
      const flying = document.querySelectorAll(".flying-card").length;
      if (!(b.animQueue || []).length && !b.locked && flying === 0) break;
      await new Promise(r => setTimeout(r, 50));
    }
    return {
      discardBefore,
      discardAfter: (u.pileStats.discard || []).length,
      handAfter: (u.hand || []).length,
      batchCount: batches.length,
      counts: batches.map(e => e.count),
      ms: Math.round(performance.now() - t0),
    };
  })()`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  // ---- A. 摸牌 ----
  const drawRuns = [];
  for (const n of [4, 8]) {
    const d = await drawCase(page, n);
    drawRuns.push({ n, ms: d.ms });
    console.log(`[摸 ${n}] ${JSON.stringify(d)}`);
    check(`A 摸 ${n} 张：牌堆充足`, d.deckBefore >= n, { deckBefore: d.deckBefore });
    check(`A 摸 ${n} 张：合并为 1 条 drawBatch`, d.batchCount === 1,
      { batchCount: d.batchCount });
    check(`A 摸 ${n} 张：事件 count == ${n}`, d.counts[0] === n, { counts: d.counts });
    check(`A 摸 ${n} 张：手牌确实 +${n}`, d.handAfter === n, { handAfter: d.handAfter });
    check(`A 摸 ${n} 张：动画结束后无未落位牌`, d.pending === 0, { pending: d.pending });
  }
  // 核心判据：耗时不随张数增长。仅断言 batchCount==1 不够——撤掉 stagger:0
  // 后仍是 1 条事件，只有耗时才暴露逐张错峰。实测有 stagger:0 时 8 张比
  // 4 张只多 ~40ms；撤掉后多 ~470ms，故阈值取 250ms。
  const ms4 = drawRuns.find(r => r.n === 4)?.ms ?? 0;
  const ms8 = drawRuns.find(r => r.n === 8)?.ms ?? 0;
  check("A 摸 8 张耗时不显著高于摸 4 张（一次性起飞）",
    ms4 > 0 && ms8 > 0 && ms8 - ms4 < 250,
    { ms4, ms8, delta: ms8 - ms4 });

  // ---- B. 弃牌（逐张 put）----
  const discardRuns = [];
  for (const n of [4, 8]) {
    const r = await discardEachCase(page, n);
    discardRuns.push({ n, ms: r.ms });
    console.log(`[逐张弃 ${n}] ${JSON.stringify(r)}`);
    check(`B 逐张弃 ${n} 张：合并为 1 条 discardBatch（旧行为 ${n} 条）`,
      r.batchCount === 1, { batchCount: r.batchCount });
    check(`B 逐张弃 ${n} 张：事件 count == ${n}`, r.counts[0] === n, { counts: r.counts });
    check(`B 逐张弃 ${n} 张：牌确实进了弃牌堆`,
      r.discardAfter - r.discardBefore === n,
      { delta: r.discardAfter - r.discardBefore });
    check(`B 逐张弃 ${n} 张：手牌已清空`, r.handAfter === 0, { handAfter: r.handAfter });
  }

  // 同摸牌：撤掉 stagger:0 后仍是 1 条事件，只有耗时会暴露逐张错峰。
  // 实测有 stagger:0 时 8 张比 4 张只多 ~75ms；撤掉后多 ~330ms，阈值取 200ms。
  const d4 = discardRuns.find(r => r.n === 4)?.ms ?? 0;
  const d8 = discardRuns.find(r => r.n === 8)?.ms ?? 0;
  check("B 弃 8 张耗时不显著高于弃 4 张（一次性起飞）",
    d4 > 0 && d8 > 0 && d8 - d4 < 200,
    { d4, d8, delta: d8 - d4 });

  check("Z 无页面错误", errors.length === 0, { errors });
  console.log(`\n总计：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
