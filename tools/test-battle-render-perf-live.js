// 战斗界面渲染性能专项（可复现）。
//
// 背景：玩家反馈「战斗有时候卡顿」。实测定位到两处强制同步布局（layout thrash）：
//   ① fitBattleSpeechBubbles —— 按气泡逐个「写 → 读 → 写」，N 个气泡触发 N 次重排；
//   ② 手牌滚动条初始化 —— 在 setHTML 刚整块替换完 DOM 时读 scrollWidth/clientWidth，
//      每次 render 都补一次完整重排；滚动事件一帧内多次触发同样重复重排。
// 现分别改为「批量写 → 批量读 → 批量写」与「初始化延到下一帧 + 滚动用 rAF 合并」。
//
// 本测试分三类断言：
//   A. 布局抖动计数（确定性）：统计单次 render 同步块内「被强制触发的重排次数」，
//      用「无气泡 → 有 N 个气泡」的增量衡量 —— 旧实现增量约等于气泡数，新实现约为 1。
//   B. 耗时（软性）：render 自身耗时的中位数与长帧比例。
//   C. 行为等价（确定性）：优化不得改变可见结果 —— 气泡仍在战斗画面内、手牌滚动按钮状态正确。
//
// ⚠️ 耗时断言受机器负载影响，请勿与其它浏览器测试并行运行。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, startRegressionBattle, dismissOpeningStory, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 构造重场景：4 名我方 + 全体敌方都带台词气泡，行动角色手牌 10 张（触发手牌横向滚动）
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.enemies.forEach(e => { e.hp = e.maxHp = 200; });
  b.allies.forEach(a => { a.hp = a.maxHp = 200; });
  // 只给当前行动角色 14 张手牌：足以让手牌区横向滚动，又不至于把 render 成本整体抬高
  const lead = b.allies[0];
  lead.hand = [];
  for (let k = 0; k < 14; k++) lead.hand.push({ name: "杀（普攻）", type: "slash", suit: "♠", uid: "h0_" + k });
  window.render();
  return { allies: b.allies.length, foes: b.enemies.length };
})()`;

// 统计单次 render 同步块内被强制触发的重排次数。
// 判据：同步块内不会发生自然布局，故「上一次读取之后又发生过样式写入」的读取即为强制重排。
const forcedLayoutTpl = `(() => {
  const protoSet = CSSStyleDeclaration.prototype.setProperty;
  const protoRect = Element.prototype.getBoundingClientRect;
  let writes = 0, forced = 0, seen = -1;
  CSSStyleDeclaration.prototype.setProperty = function (...a) { writes++; return protoSet.apply(this, a); };
  Element.prototype.getBoundingClientRect = function (...a) {
    if (writes !== seen) { forced++; seen = writes; }
    return protoRect.apply(this, a);
  };
  const measure = () => { forced = 0; seen = writes; window.render(); return forced; };
  // 基线：无台词气泡
  window.state.battle.speech = null;
  measure();                       // 预热一次，排除首帧冷启动
  const base = measure();
  // 对照：全体单位都带气泡（直接写入与 showMany 等价的 speech.lines，避免定时器干扰）
  const units = window.state.battle.allies.concat(window.state.battle.enemies);
  window.state.battle.speech = {
    id: "perf",
    uid: units[0].uid,
    lines: units.map(u => ({ uid: u.uid, name: u.name, text: "性能测试用台词，长度足以撑满一行气泡。" })),
  };
  measure();                       // 预热
  const withBubbles = measure();
  CSSStyleDeclaration.prototype.setProperty = protoSet;
  Element.prototype.getBoundingClientRect = protoRect;
  const bubbles = document.querySelectorAll(".unit-speech-bubble").length;
  return { base, withBubbles, delta: withBubbles - base, bubbles, units: units.length };
})()`;

// 耗时采样：连续多次 render，记录自身耗时，并用 longtask 观察器统计长帧
const timingTpl = `(() => new Promise(resolve => {
  const longFrames = [];
  let observer = null;
  try {
    observer = new PerformanceObserver(list => list.getEntries().forEach(e => longFrames.push(e.duration)));
    observer.observe({ entryTypes: ["longtask"] });
  } catch (err) { /* 环境不支持 longtask 时只采耗时 */ }
  const samples = [];
  const total = 30;
  for (let i = 0; i < 5; i++) window.render();          // 预热
  const t0 = performance.now();
  const step = () => {
    const a = performance.now();
    window.render();
    samples.push(performance.now() - a);
    if (samples.length < total) return requestAnimationFrame(step);
    const spent = performance.now() - t0;
    if (observer) { observer.disconnect(); }
    const sorted = samples.slice().sort((x, y) => x - y);
    const at = q => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))];
    resolve({
      median: Math.round(at(0.5) * 100) / 100,
      p95: Math.round(at(0.95) * 100) / 100,
      max: Math.round(sorted[sorted.length - 1] * 100) / 100,
      longFrames: longFrames.length,
      frames: total,
      spent: Math.round(spent),
    });
  };
  requestAnimationFrame(step);
}))()`;

// 行为等价：气泡必须完整落在战斗画面内（左右各留 8px）
const bubbleFitTpl = `(() => {
  const screen = document.querySelector(".battle-screen")?.getBoundingClientRect();
  if (!screen) return { ok: false, reason: "no .battle-screen" };
  const leftEdge = screen.left + 8, rightEdge = screen.right - 8;
  const nodes = Array.from(document.querySelectorAll(".unit-speech-bubble"));
  const bad = nodes.map(node => {
    const rect = node.getBoundingClientRect();
    const shift = node.style.getPropertyValue("--speech-shift-x");
    return { shift, left: Math.round(rect.left), right: Math.round(rect.right),
      inside: rect.left >= leftEdge - 1 && rect.right <= rightEdge + 1 };
  }).filter(item => !item.inside);
  return { ok: true, count: nodes.length, bad, leftEdge: Math.round(leftEdge), rightEdge: Math.round(rightEdge) };
})()`;

const scrollInitTpl = `(() => {
  const wrap = document.querySelector(".hand-scroll-wrap");
  const hand = wrap?.querySelector(".hand");
  if (!hand) return { ok: false, reason: "no .hand-scroll-wrap" };
  return { ok: true, scrollable: hand.scrollWidth > hand.clientWidth + 2,
    scrollWidth: hand.scrollWidth, clientWidth: hand.clientWidth };
})()`;

// 页内自洽：设置滚动位置 → 等两帧（rAF 合并后必已执行）→ 读按钮状态。
// 渲染后有一段滚动位置恢复（rAF + setTimeout），故先静置再操作，避免与其互相覆盖。
const scrollProbeTpl = target => `(() => new Promise(resolve => {
  const hand = document.querySelector(".hand-scroll-wrap .hand");
  if (!hand) return resolve({ ok: false, reason: "no .hand-scroll-wrap" });
  setTimeout(() => {
    if ("KEEP" !== ${JSON.stringify(target)}) {
      hand.scrollLeft = ${target};
      hand.dispatchEvent(new Event("scroll"));
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const wrap = hand.closest(".hand-scroll-wrap");
      const left = wrap.querySelector(".left"), right = wrap.querySelector(".right");
      resolve({ ok: true, scrollLeft: Math.round(hand.scrollLeft),
        scrollWidth: hand.scrollWidth, clientWidth: hand.clientWidth,
        max: hand.scrollWidth - hand.clientWidth,
        leftDisabled: !!left?.hasAttribute("disabled"), rightDisabled: !!right?.hasAttribute("disabled") });
    }));
  }, 400);
}))()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await startRegressionBattle(page);

  const scene = await page.evaluate(setupTpl);
  console.log(`场景：我方 ${scene.allies} 名 / 敌方 ${scene.foes} 名`);

  // A. 布局抖动计数（确定性）
  const thrash = await page.evaluate(forcedLayoutTpl);
  console.log(`布局抖动：基线 ${thrash.base} → 带气泡 ${thrash.withBubbles}（增量 ${thrash.delta}，气泡 ${thrash.bubbles} 个）`);
  T("A1 台词气泡已全部渲染", thrash.bubbles === thrash.units && thrash.bubbles >= 4, thrash);
  T("A2 气泡不再逐个触发强制重排（增量 ≤ 2）", thrash.delta <= 2, thrash);
  // 手牌滚动条的 scrollWidth/clientWidth 读取已移到 rAF，render 同步块内不应再有强制重排
  T("A3 render 同步块内无强制重排（基线为 0）", thrash.base === 0, thrash);

  // C. 行为等价（先于耗时，确保测的是「优化后仍正确」的界面）
  const fit = await page.evaluate(bubbleFitTpl);
  T("C1 优化后气泡仍完整落在战斗画面内", fit.ok && fit.bad.length === 0, fit);

  const scrollable = await page.evaluate(scrollInitTpl);
  T("C2 手牌区处于可横向滚动状态（滚动条逻辑被真实驱动）", scrollable.ok && scrollable.scrollable === true, scrollable);

  // 说明：render 之后有一段滚动位置恢复逻辑（与焦点保持同源），直接脚本写 scrollLeft 会与之互相覆盖，
  // 故这里用真实点击右箭头滚到末尾 —— 这是玩家的实际操作路径，也避开与恢复逻辑抢写。
  // 右箭头滚到末尾后会自行禁用，此时停止点击（禁用本身就是更新生效的证明）
  for (let i = 0; i < 10; i++) {
    const disabled = await page.evaluate(`!!document.querySelector('.hand-scroll-wrap .right')?.hasAttribute('disabled')`);
    if (disabled) break;
    try { await page.locator("[data-hand-scroll=\"1\"]").first().click({ timeout: 3000 }); }
    catch (err) { break; }
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(300);
  const atEnd = await page.evaluate(scrollProbeTpl("KEEP"));
  const consistent = atEnd.ok && atEnd.max > 0
    && atEnd.leftDisabled === (atEnd.scrollLeft <= 2)
    && atEnd.rightDisabled === (atEnd.scrollLeft >= atEnd.max - 2);
  T("C3 滚动条按钮状态与实际滚动位置一致（rAF 合并未丢更新）", consistent, atEnd);
  T("C4 滚到末尾后右侧按钮禁用、左侧可用",
    atEnd.ok && atEnd.rightDisabled === true && atEnd.leftDisabled === false, atEnd);

  // B. 耗时（软性，须单跑）
  const timing = await page.evaluate(timingTpl);
  // 说明：两处优化的收益是「去掉同步块内的强制重排」，量级约几毫秒，相对 render 总成本
  // 占比不大，因此耗时断言只作为「没有整体劣化」的粗护栏，真正的判据是上面的 A2 / A3。
  console.log(`耗时：中位 ${timing.median}ms · P95 ${timing.p95}ms · 最长 ${timing.max}ms · 长帧 ${timing.longFrames}/${timing.frames}`);
  T("B1 render 耗时中位数 ≤ 45ms（粗护栏）", timing.median <= 45, timing);
  T("B2 render 耗时 P95 ≤ 90ms（粗护栏）", timing.p95 <= 90, timing);

  const bad = relevantErrors(errors);
  T("页面无 JS 错误", bad.length === 0, bad.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error("FATAL", err); process.exit(1); });
