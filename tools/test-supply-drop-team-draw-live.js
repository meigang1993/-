// 专项：【物资补给】全体摸牌动画合并检查
//
// 物资补给（消耗牌，drawTeam:2）：所有友方角色各摸2张牌。
//
// 旧行为：draw() 给每个角色各推一条 drawBatch，动画逐条串行播放——
//   4 名友方 × 2 张 = 连播 4 段飞牌动画，整手补给拖得很长。
// 新行为：各角色的批次收进同一个 drawGroup 事件，一次性并行播放。
//
// 判据（可证伪）：
//   · 动画队列里只有 1 条 drawGroup，且 batches 数 == 存活友方数
//   · 队列里不应残留逐人的 drawBatch
//   · 每个存活友方最终都确实摸到 2 张（防"动画合并了但牌没发"）
//
// 防假通过：
//  1) 先断言友方人数 ≥ 2，否则"1 条事件"没有区分度；
//  2) 逐人断言手牌增量，而不是只看总数——总数对了也可能发错人。
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

// 让每名友方牌堆充足，清空手牌，然后打出物资补给
async function drive(page) {
  return page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    b.locked = false; b.animQueue = []; b.reactionQueue = [];
    window.BattleLog.clear(state);
    const actor = b.allies[0];
    actor.hp = 999; actor.maxHp = 999;
    // 每个存活友方都补足牌堆，避免有人因牌堆空而少摸，干扰"每人 2 张"判定
    b.allies.forEach(a => {
      if (a.hp <= 0) return;
      a.pileStats = a.pileStats || {};
      a.pileStats.deck = a.pileStats.deck || [];
      while (a.pileStats.deck.length < 10) {
        a.pileStats.deck.push(
          window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
      }
      a.hand = [];
    });
    const before = b.allies.filter(a => a.hp > 0).map(a => a.uid);
    const card = window.CardUtils.fromEntity("物资补给", { virtual: false });
    window.BattleSystem.useCard(state, actor, null, card);
    const b2 = window.state.battle;
    const q = b2.animQueue || [];
    return {
      aliveCount: before.length,
      animTypes: q.map(e => (e && e.type) || "?"),
      drawGroups: q.filter(e => e && e.type === "drawGroup"),
      strayDrawBatch: q.filter(e => e && e.type === "drawBatch").length,
      handsNow: b2.allies.filter(a => a.hp > 0).map(a => (a.hand || []).length),
    };
  })()`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  const r = await drive(page);
  console.log("--- 物资补给 ---");
  console.log(`  存活友方 ${r.aliveCount} 人，动画队列 ${JSON.stringify(r.animTypes)}`);
  console.log(`  drawGroup ${r.drawGroups.length} 条，`
    + `batches=${JSON.stringify(r.drawGroups.map(g => (g.batches || []).length))}`);
  console.log(`  驱动返回时各人手牌 ${JSON.stringify(r.handsNow)}`);

  check("1 区分度前置：存活友方 ≥ 2（否则'1 条事件'无意义）",
    r.aliveCount >= 2, `${r.aliveCount} 人`);
  check("2 只产生 1 条并行动画事件 drawGroup",
    r.drawGroups.length === 1, `实际 ${r.drawGroups.length} 条`);
  check("3 没有残留逐人 drawBatch 动画",
    r.strayDrawBatch === 0, `实际 ${r.strayDrawBatch} 条`);
  check("4 drawGroup 的批次数 == 存活友方数",
    r.drawGroups.length === 1
    && (r.drawGroups[0].batches || []).length === r.aliveCount,
    `batches=${r.drawGroups[0] ? (r.drawGroups[0].batches || []).length : "n/a"}`
    + ` 友方=${r.aliveCount}`);
  check("5 牌已发出：每人手牌均为 2（逐人断言，防发错人）",
    r.handsNow.length === r.aliveCount && r.handsNow.every(n => n === 2),
    JSON.stringify(r.handsNow));

  await settle(page);
  const after = await page.evaluate(`(() => {
    const b = window.state.battle;
    return { anim: (b.animQueue || []).length, locked: !!b.locked,
      hands: b.allies.filter(a => a.hp > 0).map(a => (a.hand || []).length) };
  })()`);
  const logs = await page.evaluate(`(() => (window.state.log || [])
    .map(l => String(l.text || l)).filter(t => /物资补给/.test(t)))()`);
  logs.forEach(t => console.log("  " + t));

  check("6 动画播完后队列清空、未卡锁定",
    after.anim === 0 && after.locked === false,
    `anim=${after.anim} locked=${after.locked}`);
  check("7 播完后手牌仍为每人 2 张（合并动画没有丢牌）",
    after.hands.length === r.aliveCount && after.hands.every(n => n === 2),
    JSON.stringify(after.hands));
  check("8 战报记录了全体摸牌",
    logs.length > 0, logs[0] || "无");

  check("Z 无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));

  console.log(`\n总计：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
