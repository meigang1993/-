// 响应牌「使用/打出」口径一致性：看破 / 无谋冲拳 / 佯攻
// 本项目已定口径（三国杀）：响应单体【杀】＝使用；响应 AOE／决斗＝打出。
// 卡面描述即判据：
//   看破    「你可以使用此牌」   → 使用
//   无谋冲拳「你可以打出此牌」   → 打出
//   佯攻    「你打出此牌」       → 打出
// 出牌区（battle-effect-handlers.js responseAction）与战报日志必须同为同一动词。
// 驱动方式：作弊给对应单位塞牌 → 直接调真实结算入口（不依赖敌方 AI 行动）。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const KIND = process.argv[2] || "all";
const SUITS = ["♠", "♥", "♣", "♦"];

// ---------- 场景构造 ----------
const setupCounter = `(() => {
  const st = window.state, b = st.battle;
  st.settings = st.settings || {};
  st.settings.manualResponse = false; // 自动响应，避免手动窗口阻塞
  const findCard = n => {
    const src = [window.GameDataCards?.eliteCards, window.GameData?.cardCodex,
      window.GameDataCards?.cards, window.GameData?.cards];
    for (const l of src) if (Array.isArray(l)) {
      const c = l.find(x => x?.name === n);
      if (c) return JSON.parse(JSON.stringify(c));
    }
    return null;
  };
  // 找一张可被看破无效的战术牌（type==="tactic" 且非 ignoreResponse）
  const all = [].concat(window.GameDataCards?.eliteCards || [],
    window.GameData?.cardCodex || [], window.GameDataCards?.cards || [],
    window.GameData?.cards || []);
  const tactic = all.find(c => c?.type === "tactic" && !c.ignoreResponse
    && (!c._skill || c.virtual || c.convertedFrom));
  const kanpo = findCard("看破");
  if (!tactic || !kanpo) return { missing: true, hasTactic: !!tactic, hasKanpo: !!kanpo };
  const a0 = b.allies[0], e0 = b.enemies[0];
  a0.hand = [kanpo]; a0.hp = 120; a0.maxHp = 120; a0.noResponse = false;
  e0.hand = [tactic]; e0.hp = 200; e0.maxHp = 200;
  b.played = []; b.animQueue = []; b.locked = false; b.manualDodge = null;
  st.log = [];
  window.__respEvents = [];
  const origQR = window.BattleCards?.queueResponse;
  if (origQR) {
    window.BattleCards.queueResponse = (bb, holder, evt, vb, va) => {
      try { window.__respEvents.push({ type: evt?.type,
        name: evt?.card?.name, action: evt?.action }); } catch (e) { /* noop */ }
      return origQR.call(window.BattleCards, bb, holder, evt, vb, va);
    };
  }
  // 动画队列只有 render() 才会驱动消费，出牌区写入发生在动画处理时。
  // 不持续渲染则事件永远留在队列里，出牌区读不到条目（会误判为「未记录」）。
  if (window.__renderTimer) clearInterval(window.__renderTimer);
  window.__renderTimer = setInterval(() => {
    try { window.render && window.render(); } catch (e) { /* noop */ }
  }, 30);
  window.__snapshots = [];
  if (window.__snapTimer) clearInterval(window.__snapTimer);
  window.__snapTimer = setInterval(() => {
    try {
      const cur = (window.state.battle.played || [])
        .map(e => ({ name: e?.name, action: e?._playedAction }));
      if (cur.length) window.__snapshots.push(cur);
    } catch (e) { /* noop */ }
  }, 40);
  window.__kind = "counter";
  window.__wantName = "看破";
  // 不 await：出牌流程内部会等待，直接 await 可能死锁
  window.BattleSystem.useCard(st, e0, a0, tactic);
  window.render && window.render();
  return { ok: true, tactic: tactic.name };
})()`;

const setupReckless = `(() => {
  const st = window.state, b = st.battle;
  const findCard = n => {
    const src = [window.GameDataCards?.eliteCards, window.GameData?.cardCodex,
      window.GameDataCards?.cards, window.GameData?.cards];
    for (const l of src) if (Array.isArray(l)) {
      const c = l.find(x => x?.name === n);
      if (c) return JSON.parse(JSON.stringify(c));
    }
    return null;
  };
  const wu = findCard("无谋冲拳");
  if (!wu) return { missing: true };
  const a0 = b.allies[0], e0 = b.enemies[0];
  a0.hand = [wu]; a0.hp = 120; a0.maxHp = 120; a0.noResponse = false;
  a0.recklessPromptDone = false;
  e0.hp = 200; e0.maxHp = 200;
  b.played = []; b.animQueue = []; b.locked = false; b.manualDodge = null;
  b.recklessPrompt = null;
  st.log = [];
  window.__respEvents = [];
  const origQR = window.BattleCards?.queueResponse;
  if (origQR) {
    window.BattleCards.queueResponse = (bb, holder, evt, vb, va) => {
      try { window.__respEvents.push({ type: evt?.type,
        name: evt?.card?.name, action: evt?.action }); } catch (e) { /* noop */ }
      return origQR.call(window.BattleCards, bb, holder, evt, vb, va);
    };
  }
  // 动画队列只有 render() 才会驱动消费，出牌区写入发生在动画处理时。
  // 不持续渲染则事件永远留在队列里，出牌区读不到条目（会误判为「未记录」）。
  if (window.__renderTimer) clearInterval(window.__renderTimer);
  window.__renderTimer = setInterval(() => {
    try { window.render && window.render(); } catch (e) { /* noop */ }
  }, 30);
  window.__snapshots = [];
  if (window.__snapTimer) clearInterval(window.__snapTimer);
  window.__snapTimer = setInterval(() => {
    try {
      const cur = (window.state.battle.played || [])
        .map(e => ({ name: e?.name, action: e?._playedAction }));
      if (cur.length) window.__snapshots.push(cur);
    } catch (e) { /* noop */ }
  }, 40);
  window.__kind = "reckless";
  window.__wantName = "无谋冲拳";
  // window.BattlePreparePrompts 是工厂不是实例，实例挂在 BattleSystem.resolveReckless。
  // 提示窗口由回合开始流程入队（battle-turn-start.js），这里按同样结构直接建立。
  b.recklessPrompt = { uid: a0.uid, selectedIndex: 0 };
  b.locked = true;
  window.render && window.render();
  return { ok: true, prompt: !!b.recklessPrompt };
})()`;

// 无谋冲拳：确认打出（必须传 window.render，否则动画队列无人消费导致挂起）
const stepReckless = `(async () => {
  const st = window.state, b = st.battle;
  if (!b.recklessPrompt) return { noPrompt: true };
  await window.BattleSystem.resolveReckless(st, true, 0, window.render);
  await new Promise(r => setTimeout(r, 80));
  window.render && window.render();
  return { done: true };
})()`;

const setupFeint = `(() => {
  const st = window.state, b = st.battle;
  st.settings = st.settings || {};
  st.settings.manualResponse = false;
  const findCard = n => {
    const src = [window.GameDataCards?.eliteCards, window.GameData?.cardCodex,
      window.GameDataCards?.cards, window.GameData?.cards];
    for (const l of src) if (Array.isArray(l)) {
      const c = l.find(x => x?.name === n);
      if (c) return JSON.parse(JSON.stringify(c));
    }
    return null;
  };
  const slash = findCard("杀（普攻）"), yang = findCard("佯攻");
  if (!slash || !yang) return { missing: true, hasSlash: !!slash, hasYang: !!yang };
  const a0 = b.allies[0], a1 = b.allies[1], e0 = b.enemies[0];
  if (!a1) return { noAlly: true };
  a0.hand = [slash]; a0.hp = 120; a0.maxHp = 120; a0.noResponse = false;
  a1.hand = [yang]; a1.hp = 120; a1.maxHp = 120; a1.noResponse = false;
  // 佯攻需要目标有手牌可弃
  e0.hand = [findCard("闪") || slash]; e0.hp = 200; e0.maxHp = 200;
  b.played = []; b.animQueue = []; b.locked = false; b.manualDodge = null;
  st.log = [];
  window.__respEvents = [];
  const origQR = window.BattleCards?.queueResponse;
  if (origQR) {
    window.BattleCards.queueResponse = (bb, holder, evt, vb, va) => {
      try { window.__respEvents.push({ type: evt?.type,
        name: evt?.card?.name, action: evt?.action }); } catch (e) { /* noop */ }
      return origQR.call(window.BattleCards, bb, holder, evt, vb, va);
    };
  }
  // 动画队列只有 render() 才会驱动消费，出牌区写入发生在动画处理时。
  // 不持续渲染则事件永远留在队列里，出牌区读不到条目（会误判为「未记录」）。
  if (window.__renderTimer) clearInterval(window.__renderTimer);
  window.__renderTimer = setInterval(() => {
    try { window.render && window.render(); } catch (e) { /* noop */ }
  }, 30);
  window.__snapshots = [];
  if (window.__snapTimer) clearInterval(window.__snapTimer);
  window.__snapTimer = setInterval(() => {
    try {
      const cur = (window.state.battle.played || [])
        .map(e => ({ name: e?.name, action: e?._playedAction }));
      if (cur.length) window.__snapshots.push(cur);
    } catch (e) { /* noop */ }
  }, 40);
  window.__kind = "feint";
  window.__wantName = "佯攻";
  // 友方 A 对敌方打出单体杀 → 触发友方 B 的佯攻
  window.BattleSystem.useCard(st, a0, e0, slash);
  window.render && window.render();
  return { ok: true };
})()`;

// ---------- 结果读取 ----------
const readResult = `(() => {
  const st = window.state, b = st.battle;
  const all = (b.played || []).map(e => ({ name: e?.name, action: e?._playedAction }));
  const want = window.__wantName;
  // 出牌区会在回合切换时清空，取历史最长快照还原写入瞬间
  const best = (window.__snapshots || []).reduce(
    (acc, s) => (s.length > (acc?.length || 0) ? s : acc), []);
  const merged = all.length >= best.length ? all : best;
  const played = merged.filter(e => e.name === want);
  const queued = (b.animQueue || []).filter(e => e?.type === "response")
    .map(e => ({ name: e?.card?.name, action: e?.action }));
  const logs = (st.log || []).map(String);
  const hit = logs.filter(l => l.includes(want));
  return {
    kind: window.__kind,
    want,
    respEvents: window.__respEvents || [],
    played,
    queued,
    allNames: merged.map(e => e.name),
    logs: hit.slice(-4),
    allLogCount: logs.length,
  };
})()`;

async function runScenario(page, name, expectAction, setupSrc, stepSrc) {
  console.log(`\n--- ${name} ---`);
  const setup = await page.evaluate(setupSrc);
  if (setup.missing || setup.noAlly) {
    console.log(`❌ ${name}: 构造失败 ${JSON.stringify(setup)}`);
    return false;
  }
  if (stepSrc) {
    const step = await page.evaluate(stepSrc);
    if (step.noPrompt) {
      console.log(`❌ ${name}: 无提示窗口 ${JSON.stringify(step)}`);
      return false;
    }
  }
  // 出牌区写入依赖动画队列消费，需轮询等待（实测约 1s 才落盘）
  let r = null;
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(500);
    r = await page.evaluate(readResult);
    if (r.played.length) break;
  }
  const ok1 = r.played.length > 0;
  const gotAction = r.played[0]?.action || null;
  const ok2 = gotAction === expectAction;
  // 战报侧：日志里出现该牌名，且动词与期望一致
  const logText = r.logs.join(" | ");
  const ok3 = r.logs.length > 0;
  const ok4 = logText.includes(expectAction.replace("了", ""));
  const queuedAction = r.queued.find(q => q.name === r.want)?.action || null;
  const ok5 = queuedAction === null || queuedAction === expectAction;
  const pass = ok1 && ok2 && ok3 && ok4 && ok5;
  console.log(`  期望动词=${expectAction}`);
  console.log(`  出牌区: ${JSON.stringify(r.played)}`);
  console.log(`  动画队列: ${JSON.stringify(r.queued)}`);
  console.log(`  响应事件: ${JSON.stringify(r.respEvents)}`);
  console.log(`  战报: ${logText || "(空)"}`);
  console.log(`  断言: 有条目=${ok1} 动词=${ok2}(${gotAction}) 有日志=${ok3} 日志动词=${ok4} 队列一致=${ok5}`);
  console.log(pass ? `✅ ${name}` : `❌ ${name}`);
  return pass;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);
  await page.waitForTimeout(300);

  const results = [];
  if (KIND === "all" || KIND === "counter") {
    results.push(["看破→使用", await runScenario(
      page, "看破→使用", "使用了", setupCounter, null)]);
  }
  if (KIND === "all" || KIND === "reckless") {
    results.push(["无谋冲拳→打出", await runScenario(
      page, "无谋冲拳→打出", "打出了", setupReckless, stepReckless)]);
  }
  if (KIND === "all" || KIND === "feint") {
    results.push(["佯攻→打出", await runScenario(
      page, "佯攻→打出", "打出了", setupFeint, null)]);
  }

  console.log(`\n页面错误: ${errors.length}${errors.length ? " " + errors[0] : ""}`);
  if (errors.length) {
    console.log("❌ 页面错误");
    results.push(["页面错误", false]);
  }
  const pass = results.filter(([, v]) => v).length;
  const total = results.length;
  console.log(`\n汇总: ${pass}/${total}${pass === total ? " 全部通过" : " 有失败"}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(e => {
  console.error("FATAL", e);
  process.exit(1);
});
