// 专项：【计算下注】弃牌动画一次性（整批同时起飞）回归
//
// 背景：计算下注弃置 N 张手牌后再摸等量牌。摸牌侧已带 stagger:0（一次性）。
// 弃牌侧此前走默认逐张错峰（每张 +100ms），弃得越多拖得越久——弃 8 张要
// 连飞 8 段。现与摸牌同口径：整批同时起飞、一次落位。
//
// 为什么不用"队列里恰有 1 条 discardBatch"作判据：
//   useCard 返回时 drain 已经把队首的 discardBatch **出队**了（出队是同步的，
//   处理才是异步），此时读 animQueue 只剩 drawBatch——实测 discardBatch 为 0。
//   因此队列快照对弃牌不可靠，必须看**屏幕上真实的起飞时刻**。
//
// 判据（可证伪）：
//   · discard-card-fly 元素数 == 弃牌张数（防"动画合并了但牌没弃"）
//   · 起飞时刻首末间隔 < 30ms（一次性）；逐张错峰时约为 (n-1)*100ms
//   · 弃牌张数确实进了弃牌堆
//   · 摸牌侧 stagger 仍为 0（本改动不影响摸牌）
//
// 防假通过：
//  1) 用 2 张与 8 张两档对比：若只是"碰巧同时"，张数变化会暴露错峰；
//  2) hook 只包一层（__origFront 缓存），否则每次驱动都叠一层，元素被记 n 遍；
//  3) 驱动后必须 recover + render，否则 drain 不跑、元素压根不创建。
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

async function dismissPrompts(page) {
  return page.evaluate(`(() => {
    const el = document.querySelector(
      "[data-kaiichi-share-skip], [data-dimension-transfer-skip]");
    if (!el) return false;
    el.click();
    return true;
  })()`);
}

async function settle(page, maxMs = 20000) {
  const deadline = Date.now() + maxMs;
  let lastLen = -1, stable = 0;
  while (Date.now() < deadline) {
    await dismissPrompts(page);
    const s = await page.evaluate(`(() => {
      const b = window.state.battle || {};
      return { locked: !!b.locked, anim: (b.animQueue || []).length,
        queue: (b.reactionQueue || b.pendingActions || []).length,
        len: (window.state.log || []).length };
    })()`);
    const quiet = !s.locked && !s.anim && !s.queue;
    if (quiet && s.len === lastLen) { stable += 1; if (stable >= 3) break; }
    else stable = 0;
    lastLen = s.len;
    await page.waitForTimeout(300);
  }
  await dismissPrompts(page);
  await page.waitForTimeout(400);
}

async function drive(page, handCount, discardCount) {
  return page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    b.locked = false; b.animQueue = []; b.reactionQueue = [];
    window.BattleLog.clear(state);
    const actor = b.allies[0];
    actor.hp = 999; actor.maxHp = 999; actor.intent = 0; actor.intentMax = 5;
    actor.usedAilengBet = false;
    actor.skills = (actor.skills || []).filter(s => s.name !== "计算下注").concat([{
      name: "计算下注", type: "active", icon: "⚔️",
      text: "出牌阶段限一次，你可以弃置至少1张手牌，然后摸等量牌。",
      card: { name: "计算下注", type: "tactic", targetless: true,
        ailengBet: true, elranaBag: true, icon: "⚔️", text: "弃置手牌并摸等量牌" },
    }]);
    b.phase = 4; b.activeUid = actor.uid;
    actor.pileStats = actor.pileStats || {};
    actor.pileStats.deck = actor.pileStats.deck || [];
    actor.pileStats.discard = actor.pileStats.discard || [];
    while (actor.pileStats.deck.length < 30) {
      actor.pileStats.deck.push(
        window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
    }
    actor.hand = [];
    for (let i = 0; i < ${handCount}; i += 1) {
      actor.hand.push(window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
    }
    const discardBefore = (actor.pileStats.discard || []).length;
    const handBefore = actor.hand.length;
    // hook：只基于最初实现包一层，避免多次驱动叠加
    window.__fly = [];
    const D = window.BattleEffectCardDOM;
    window.__origFront = window.__origFront || D.front;
    window.__origBack = window.__origBack || D.back;
    const origFront = window.__origFront, origBack = window.__origBack;
    D.front = function (data, enemy, cls) {
      const el = origFront.call(this, data, enemy, cls);
      window.__fly.push({ cls, t: performance.now() });
      return el;
    };
    D.back = function (data, enemy, cls) {
      const el = origBack.call(this, data, enemy, cls);
      window.__fly.push({ cls, t: performance.now() });
      return el;
    };
    const t0 = performance.now();
    const card = { name: "计算下注", type: "tactic", targetless: true,
      ailengBet: true, elranaBag: true, icon: "⚔️",
      text: "弃置至少1张手牌并摸等量牌",
      _bagIndexes: Array.from({ length: ${discardCount} }, (_, i) => i) };
    window.BattleSystem.useCard(state, actor, actor, card);
    // 队列快照必须在 recover/render 之前取：它们会触发 drain 把批次出队，
    // 之后再读就是空数组（弃 2 张时 drawBatch 已被消费，实测读到 []）。
    const q = window.state.battle.animQueue || [];
    try { window.BattleEffects.recover(window.state); } catch (e) {}
    try { window.render?.(); } catch (e) {}
    return {
      t0: Math.round(t0), discardBefore, handBefore,
      draws: q.filter(e => e && e.type === "drawBatch")
        .map(e => ({ count: e.count, stagger: e.stagger })),
    };
  })()`);
}

// 最大相邻起飞间隔，**跳过首间隔**：首张牌创建后浏览器常有一次同步布局
// （实测 first-gap 可达 69ms），它属于渲染开销而非错峰，会把一次性误判成错峰。
// 真正的错峰会在**每一对相邻牌**之间都留下约 100ms，故取 index>=1 的间隔。
function maxGap(rel) {
  let gap = -1;
  for (let i = 1; i < rel.length - 1; i += 1) gap = Math.max(gap, rel[i + 1] - rel[i]);
  return gap;
}

async function collect(page) {
  return page.evaluate(`(() => (window.__fly || []).map(f => ({
    cls: f.cls, t: Math.round(f.t),
  })))()`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  for (const [hand, n] of [[3, 3], [8, 8]]) {
    console.log(`--- 场景：手牌 ${hand} 张，全部弃置（弃 ${n} 张） ---`);
    const r = await drive(page, hand, n);
    await page.waitForTimeout(3000);
    const fly = await collect(page);
    const disc = fly.filter(f => String(f.cls).includes("discard-card-fly"));
    const rel = disc.map(f => f.t - r.t0);
    const span = rel.length ? rel[rel.length - 1] - rel[0] : -1;
    const after = await page.evaluate(`(() => {
      const a = window.state.battle.allies[0];
      return { discard: (a.pileStats?.discard || []).length,
        hand: (a.hand || []).length };
    })()`);
    console.log(`  弃牌飞行元素 ${disc.length}（期望 ${n}）· 起飞首末间隔 ${span}ms`);
    console.log(`  相对时刻 ${JSON.stringify(rel)}`);
    console.log(`  弃牌堆 ${r.discardBefore} → ${after.discard} · 手牌 ${r.handBefore} → ${after.hand}`);
    check(`弃${n}：discard-card-fly 元素数 == 弃牌张数`, disc.length === n,
      `实际 ${disc.length}`);
    const gap = maxGap(rel);
    check(`弃${n}：整批同时起飞（相邻间隔 < 30ms，一次性）`,
      rel.length >= 3 && gap >= 0 && gap < 30, `实际 ${gap}ms`);
    // 逐张错峰时每个相邻间隔约 100ms（撤掉 stagger:0 实测弃 8 张 = 702ms）
    check(`弃${n}：远小于逐张错峰的 100ms/张（反证未错峰）`,
      rel.length >= 3 && gap < 50, `实际 ${gap}ms，错峰时应约 100ms`);
    check(`弃${n}：牌确实进了弃牌堆（动画合并没有吞牌）`,
      after.discard - r.discardBefore === n,
      `新增 ${after.discard - r.discardBefore}`);
    // 摸牌侧：队列快照在 useCard 内就可能被 drain 出队（弃 2 张时实测为 []），
    // 因此同样用 DOM 起飞时刻判定，而不是读队列。
    const drawFly = fly.filter(f => String(f.cls).includes("draw-card-fly")
      && !String(f.cls).includes("discard"));
    const drawRel = drawFly.map(f => f.t - r.t0);
    const drawSpan = drawRel.length ? drawRel[drawRel.length - 1] - drawRel[0] : -1;
    const drawGap = maxGap(drawRel);
    check(`弃${n}：摸牌侧同样一次性（相邻间隔 < 30ms）`,
      drawRel.length >= 3 && drawGap >= 0 && drawGap < 30,
      `${drawRel.length} 张，间隔 ${drawGap}ms`);
    await settle(page);
  }

  check("Z 无页面错误", errors.length === 0,
    errors.length ? JSON.stringify(errors.slice(0, 2)) : "");
  console.log(`\n总计：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
