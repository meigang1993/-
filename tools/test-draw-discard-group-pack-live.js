// 专项：多角色摸牌 / 弃牌的「成组并行」引擎接口
//
// 背景：多角色各摸 N 张时，draw() 给每人各推一条 drawBatch，动画层逐条串行
// 播放——4 人 ×2 张要连播 4 段飞牌，整手补给拖得很长。BattleDrawPacker
// 把队尾一批「不同角色」的 drawBatch 收成一条 drawGroup（弃牌同理收成
// discardGroup），由动画层并行播放。
//
// 本用例只验引擎接口本身（技能侧的调用点不在本用例范围内）：
//  · 不同角色 → 成组；单一角色 → 不成组（否则语义变、且白搭一次合并）
//  · 只合并**队尾连续**的同类型事件，不把之前的无关事件卷进来
//  · 成组后动画真能播（队列被 drain 消费、飞行元素数 == 总张数）
//
// 防假通过：
//  1) 断言队列在 drain 后确实清空，防止"事件进了队但没人消费"被算通过；
//  2) 断言飞行元素**创建数**，而不是某一瞬间的 DOM 快照；
//  3) 单人场景反向断言"不成组"，否则 pack 恒返回真值也能蒙混过关。
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

const CARD = "杀（普攻）";

// 在页面里装飞行元素计数器：back = 摸牌/移牌（背面），front = 弃牌（正面）
async function installCounter(page) {
  await page.evaluate(`(() => {
    window.__fly = { back: 0, front: 0 };
    const dom = window.BattleEffectCardDOM;
    if (!dom || dom.__hooked) return;
    const ob = dom.back, of = dom.front;
    dom.back = function (...a) { window.__fly.back += 1; return ob.apply(this, a); };
    dom.front = function (...a) { window.__fly.front += 1; return of.apply(this, a); };
    dom.__hooked = true;
  })()`);
}

async function resetFly(page) {
  await page.evaluate(`(() => { window.__fly = { back: 0, front: 0 }; })()`);
}

// 等到队列被消费干净（最多 6s）
async function drain(page) {
  return page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    window.BattleEffects && window.BattleEffects.recover(st);
    window.render && window.render();
    // 只踢一次：drain 是异步的，飞行途中反复 render() 会 bump 动画 version，
    // active() 随之变假，后续牌直接 return —— 表现就是"每个批次只飞了 1 张"
    // （实测 6 张只飞 3 张）。改判据为"飞行元素消失且持续一段时间"。
    let idle = 0;
    const t0 = Date.now();
    while (Date.now() - t0 < 6000) {
      await new Promise(r => setTimeout(r, 60));
      if (!document.querySelector(".card-flight")) idle += 60; else idle = 0;
      if (idle >= 300 && !(b.animQueue && b.animQueue.length)) break;
    }
    return { queue: (b.animQueue || []).map(e => e.type), fly: window.__fly };
  })()`);
}

// 摸牌成组：n 名角色各 count 张
async function drawPack(page, n, count) {
  return page.evaluate(`(() => {
    const b = window.state.battle;
    b.animQueue = []; b.locked = false;
    const mk = uid => ({
      type: "drawBatch", uid, side: "ally", count: ${count},
      cards: Array.from({ length: ${count} }, () =>
        window.CardUtils.fromEntity("${CARD}", { virtual: false })),
    });
    for (let i = 0; i < ${n}; i += 1) b.animQueue.push(mk("a" + i));
    const before = b.animQueue.length;
    const packed = window.BattleDrawPacker.packDrawGroup(b);
    const q = b.animQueue || [];
    return {
      before, packed, after: q.length,
      types: q.map(e => e.type),
      batches: (q[0] && q[0].batches ? q[0].batches : []).map(x => x.uid),
      cards: q[0] ? (q[0].cards || []).length : 0,
      exists: typeof window.BattleDrawPacker?.packDrawGroup === "function",
    };
  })()`);
}

// 弃牌成组
async function discardPack(page, n, count) {
  return page.evaluate(`(() => {
    const b = window.state.battle;
    b.animQueue = []; b.locked = false;
    const mk = uid => ({
      type: "discardBatch", uid, side: "ally", count: ${count}, toPublic: false,
      cards: Array.from({ length: ${count} }, () =>
        window.CardUtils.fromEntity("${CARD}", { virtual: false })),
    });
    for (let i = 0; i < ${n}; i += 1) b.animQueue.push(mk("a" + i));
    const packed = window.BattleCards.packDiscardGroup(b);
    const q = b.animQueue || [];
    return {
      packed, after: q.length, types: q.map(e => e.type),
      batches: (q[0] && q[0].batches ? q[0].batches : []).map(x => x.uid),
      exists: typeof window.BattleCards?.packDiscardGroup === "function",
    };
  })()`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);
  await installCounter(page);

  // 队伍补到 3 人，保证 uid a0/a1/a2 都存在
  const uids = await page.evaluate(`(() => {
    const b = window.state.battle, base = b.allies[0];
    let i = b.allies.length;
    while (b.allies.length < 3) {
      const c = JSON.parse(JSON.stringify(base));
      c.uid = "a" + i; i += 1; c.name = "友方" + c.uid;
      c.hand = []; c.pileStats = { deck: [], discard: [], consumed: [] };
      b.allies.push(c);
    }
    window.render && window.render();
    return b.allies.map(a => a.uid);
  })()`);
  check("前置：队伍 3 人", uids.length === 3, uids.join(","));

  // —— 摸牌 ——
  await resetFly(page);
  const d3 = await drawPack(page, 3, 2);
  check("接口存在：BattleDrawPacker.packDrawGroup", d3.exists);
  check("3 名角色各摸 2 张 → 合并为 1 条 drawGroup",
    d3.after === 1 && d3.types[0] === "drawGroup",
    `after=${d3.after} types=${JSON.stringify(d3.types)}`);
  check("drawGroup 含 3 个批次且 uid 齐全",
    d3.batches.length === 3 && d3.batches.join(",") === "a0,a1,a2",
    JSON.stringify(d3.batches));
  check("drawGroup 保留全部牌（6 张）", d3.cards === 6, `${d3.cards}`);
  check("packDrawGroup 返回被合并的批次数", d3.packed === 3, `${d3.packed}`);
  const dr = await drain(page);
  check("成组后动画真能播：队列被消费干净",
    dr.queue.length === 0, JSON.stringify(dr.queue));
  check("成组后飞行元素数 == 6（3 人 ×2 张）",
    dr.fly.back === 6, `实际 ${dr.fly.back}`);

  // 单一角色：3 条同 uid 的 drawBatch 不该成组
  const d1 = await page.evaluate(`(() => {
    const b = window.state.battle;
    b.animQueue = [];
    for (let i = 0; i < 3; i += 1) b.animQueue.push({
      type: "drawBatch", uid: "a0", side: "ally", count: 1,
      cards: [window.CardUtils.fromEntity("${CARD}", { virtual: false })],
    });
    const packed = window.BattleDrawPacker.packDrawGroup(b);
    return { packed, after: b.animQueue.length, types: b.animQueue.map(e => e.type) };
  })()`);
  check("同一角色不成组（仍是 3 条 drawBatch）",
    d1.packed === 0 && d1.after === 3 && d1.types.every(t => t === "drawBatch"),
    `packed=${d1.packed} after=${d1.after} ${JSON.stringify(d1.types)}`);

  // 只合并队尾：先成组一条，再追加一条，第二次 pack 不该把旧的卷进来
  const dTail = await page.evaluate(`(() => {
    const b = window.state.battle;
    b.animQueue = [];
    const mk = uid => ({
      type: "drawBatch", uid, side: "ally", count: 1,
      cards: [window.CardUtils.fromEntity("${CARD}", { virtual: false })],
    });
    b.animQueue.push(mk("a0")); b.animQueue.push(mk("a1"));
    window.BattleDrawPacker.packDrawGroup(b);
    b.animQueue.push({ type: "damage", id: "x1", uid: "a0" });
    b.animQueue.push(mk("a2"));
    const packed = window.BattleDrawPacker.packDrawGroup(b);
    return { packed, types: b.animQueue.map(e => e.type) };
  })()`);
  check("只合并队尾连续事件（中间隔着 damage 时不成组）",
    dTail.packed === 0 && dTail.types.join(",") === "drawGroup,damage,drawBatch",
    `packed=${dTail.packed} ${JSON.stringify(dTail.types)}`);

  // —— 弃牌 ——
  await resetFly(page);
  const s2 = await discardPack(page, 2, 2);
  check("接口存在：BattleCards.packDiscardGroup", s2.exists);
  check("2 名角色各弃 2 张 → 合并为 1 条 discardGroup",
    s2.after === 1 && s2.types[0] === "discardGroup",
    `after=${s2.after} types=${JSON.stringify(s2.types)}`);
  check("discardGroup 含 2 个批次", s2.batches.length === 2,
    JSON.stringify(s2.batches));
  const sr = await drain(page);
  check("弃牌成组后队列被消费干净",
    sr.queue.length === 0, JSON.stringify(sr.queue));
  check("弃牌成组后飞行元素数 == 4（2 人 ×2 张）",
    sr.fly.front === 4, `实际 ${sr.fly.front}`);

  check("无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
