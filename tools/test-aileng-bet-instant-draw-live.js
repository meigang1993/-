// 专项：【计算下注】一次性摸等量牌检查
//
// 计算下注（艾伦格主动技）：弃置至少 1 张手牌，然后摸等量牌；若弃置
// 全部手牌，额外摸 1 张并重置杀意。
//
// 旧行为：摸牌动画逐张错峰起飞（每张间隔 100ms 错峰 + 360ms 飞行），
//   弃 10 张就要连飞 10 段，弃得越多拖得越久。
// 新行为：整批收进同一条 drawBatch 并带 stagger:0，所有牌同时起飞、
//   一次落位，时长与摸 1 张相当。
//
// 判据（可证伪）：
//   · 动画队列里恰好 1 条 drawBatch，且 stagger === 0
//   · 该批次的 count / cards 数 == 应摸张数（弃 N 摸 N；全弃摸 N+1）
//   · 手牌张数确实等于应摸张数（防"动画合并了但牌没发"）
//
// 防假通过：
//  1) 先断言牌堆充足、手牌构造成功，否则"摸 0 张"也会被算通过；
//  2) 用两张不同弃牌数（部分弃 / 全弃）分别验证，覆盖 +1 分支；
//  3) 对照组断言普通摸牌不带 stagger:0——证明这不是全局改动，
//     只作用于计算下注。
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

// 构造：手牌 handCount 张、牌堆充足，然后走真实出牌入口发动计算下注
// 弃 discardCount 张；若弃光全部手牌则触发 +1 与重置杀意分支。
// 走 useCard 全链路（含 CharacterSkillAccess 的角色/阶段/目标/成本校验），
// 因此在驱动前补齐技能归属、出牌阶段、当前回合与自选牌索引。
async function drive(page, handCount, discardCount, { control = false } = {}) {
  return page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    b.locked = false; b.animQueue = []; b.reactionQueue = [];
    window.BattleLog.clear(state);
    const actor = b.allies[0];
    actor.hp = 999; actor.maxHp = 999; actor.intent = 0; actor.intentMax = 5;
    actor.usedAilengBet = false;
    // 技能归属：canResolve 要求该角色确实拥有【计算下注】主动技
    actor.skills = (actor.skills || []).filter(s => s.name !== "计算下注").concat([{
      name: "计算下注", type: "active", icon: "⚔️",
      text: "出牌阶段限一次，你可以弃置至少1张手牌，然后摸等量牌。",
      card: { name: "计算下注", type: "tactic", targetless: true,
        ailengBet: true, elranaBag: true, icon: "⚔️", text: "弃置手牌并摸等量牌" },
    }]);
    b.phase = 4; b.activeUid = actor.uid;
    actor.pileStats = actor.pileStats || {};
    actor.pileStats.deck = actor.pileStats.deck || [];
    while (actor.pileStats.deck.length < 30) {
      actor.pileStats.deck.push(
        window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
    }
    actor.hand = [];
    for (let i = 0; i < ${handCount}; i += 1) {
      actor.hand.push(window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
    }
    const deckBefore = actor.pileStats.deck.length;
    const handBefore = actor.hand.length;
    const visibleBefore = actor.hand.filter(c => !c._pendingDraw).length;
    const all = ${discardCount} === ${handCount};
    const expectDraw = all ? ${discardCount} + 1 : ${discardCount};
    if (${control}) {
      // 对照组：直接调通用摸牌接口，不经过计算下注
      window.BattleSystem.draw(actor, 3, b);
    } else {
      const card = { name: "计算下注", type: "tactic", targetless: true,
        ailengBet: true, elranaBag: true, icon: "⚔️",
        text: "弃置至少1张手牌并摸等量牌",
        _bagIndexes: Array.from({ length: ${discardCount} }, (_, i) => i) };
      window.BattleSystem.useCard(state, actor, actor, card);
    }
    const b2 = window.state.battle;
    const q = b2.animQueue || [];
    const batches = q.filter(e => e && e.type === "drawBatch");
    return {
      deckBefore, handBefore, visibleBefore, expectDraw,
      animTypes: q.map(e => (e && e.type) || "?"),
      batchCount: batches.length,
      batches: batches.map(e => ({ count: e.count, stagger: e.stagger,
        cards: (e.cards || []).length })),
      handNow: (actor.hand || []).length,
      deckNow: (actor.pileStats.deck || []).length,
      intentNow: actor.intent,
    };
  })()`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  // ---- 场景 A：弃部分手牌（3 张中的 3 张全弃会走 +1，故用 5 张弃 3 张）----
  const a = await drive(page, 5, 3);
  console.log("--- 场景 A：手牌 5 张，弃 3 张 ---");
  console.log(`  动画队列 ${JSON.stringify(a.animTypes)}`);
  console.log(`  drawBatch ${JSON.stringify(a.batches)}`);
  console.log(`  手牌 ${a.handBefore} → ${a.handNow}，牌堆 ${a.deckBefore} → ${a.deckNow}`);

  check("A1 前置：牌堆充足且手牌构造成功（否则'摸 0 张'也会通过）",
    a.deckBefore >= 30 && a.visibleBefore === 5, `deck=${a.deckBefore} hand=${a.visibleBefore}`);
  check("A2 恰好产生 1 条 drawBatch（整批合并成一次）",
    a.batchCount === 1, `实际 ${a.batchCount} 条`);
  check("A3 该批次 stagger === 0（一次性起飞，非逐张错峰）",
    a.batchCount === 1 && a.batches[0].stagger === 0,
    JSON.stringify(a.batches));
  check("A4 该批次 count == 应摸张数 3",
    a.batchCount === 1 && a.batches[0].count === 3, JSON.stringify(a.batches));
  // 弃 3 张后手上还剩 2 张，再摸 3 张 → 5 张
  check("A5 实际摸到 3 张（合并动画没有丢牌）：5 - 3 + 3",
    a.handNow === 5, `手牌 ${a.handNow}`);

  await settle(page);

  // ---- 场景 B：弃全部手牌（8 张）→ 摸 9 张 ----
  const b = await drive(page, 8, 8);
  console.log("--- 场景 B：手牌 8 张，全部弃置 ---");
  console.log(`  动画队列 ${JSON.stringify(b.animTypes)}`);
  console.log(`  drawBatch ${JSON.stringify(b.batches)}`);
  console.log(`  手牌 ${b.handBefore} → ${b.handNow}，杀意 ${b.intentNow}`);

  check("B1 前置：手牌 8 张构造成功",
    b.visibleBefore === 8, `hand=${b.visibleBefore}`);
  check("B2 恰好产生 1 条 drawBatch",
    b.batchCount === 1, `实际 ${b.batchCount} 条`);
  check("B3 该批次 stagger === 0",
    b.batchCount === 1 && b.batches[0].stagger === 0, JSON.stringify(b.batches));
  check("B4 该批次 count == 9（弃 8 摸 8，全弃额外 +1）",
    b.batchCount === 1 && b.batches[0].count === 9, JSON.stringify(b.batches));
  check("B5 实际摸到 9 张",
    b.handNow === 9, `手牌 ${b.handNow}`);
  check("B6 全弃时重置杀意（intent > 0）",
    b.intentNow > 0, `intent=${b.intentNow}`);

  await settle(page);

  // ---- 场景 C：对照组——普通摸牌不应带 stagger（改动只作用于计算下注）----
  const c = await drive(page, 5, 3, { control: true });
  console.log("--- 场景 C：对照组（通用摸牌接口）---");
  console.log(`  drawBatch ${JSON.stringify(c.batches)}`);
  check("C1 对照组仍产生 drawBatch（链路可用，排除'根本没摸牌'）",
    c.batchCount >= 1, `实际 ${c.batchCount} 条`);
  check("C2 对照组的批次不带 stagger:0（未波及其他摸牌）",
    c.batchCount >= 1 && c.batches.every(x => x.stagger !== 0),
    JSON.stringify(c.batches));

  await settle(page);
  const after = await page.evaluate(`(() => {
    const b = window.state.battle;
    return { anim: (b.animQueue || []).length, locked: !!b.locked,
      types: (b.animQueue || []).map(e => (e && e.type) || "?") };
  })()`);
  check("D 动画播完后未卡锁定（队列残留类型见上方日志）",
    after.locked === false,
    `anim=${after.anim} types=${JSON.stringify(after.types)} locked=${after.locked}`);

  check("Z 无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));

  console.log(`\n总计：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
