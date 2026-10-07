// 诊断探针：摸牌 / 弃牌动画的队列结构与真实耗时
//
// 目的（不改动任何玩法逻辑，只观测）：
//  1) 摸 N 张 → 队列里几条 drawBatch？每条 count 多少？stagger 多少？
//  2) 逐张弃 N 张 → 队列里几条 discardBatch？（put 每张推一条）
//  3) 批量弃 N 张 → 几条？（putMany 推一条）
//  4) 真实驱动 drain 后的墙钟耗时（牌越多越慢的直接证据）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const N = Number(process.argv[2] || 8);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  // ---- 摸牌 ----
  const draw = await page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    b.animQueue = [];
    const u = b.allies[0];
    u.pileStats = u.pileStats || {};
    while ((u.pileStats.deck || []).length < 40) {
      u.pileStats.deck.push(window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
    }
    const t0 = performance.now();
    window.BattleSystem.draw(u, ${N}, b);
    const q = b.animQueue || [];
    return {
      types: q.map(e => e && e.type),
      batches: q.filter(e => e && e.type === "drawBatch")
        .map(e => ({ count: e.count, stagger: e.stagger, cards: (e.cards || []).length })),
      ms: Math.round(performance.now() - t0),
    };
  })()`);
  console.log(`[摸牌 ${N} 张] 队列=${JSON.stringify(draw.types)}`);
  console.log(`[摸牌 ${N} 张] 批次=${JSON.stringify(draw.batches)} 推队耗时=${draw.ms}ms`);

  // ---- 逐张弃（put 循环）----
  const each = await page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    b.animQueue = [];
    const u = b.allies[0];
    u.hand = u.hand || [];
    while (u.hand.length < ${N}) {
      u.hand.push(window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
    }
    const cards = u.hand.splice(0, ${N});
    cards.forEach(c => window.BattleCards.put(b, u, c, "discard"));
    const q = b.animQueue || [];
    return {
      count: q.length,
      types: q.map(e => e && e.type),
      batches: q.filter(e => e && e.type === "discardBatch")
        .map(e => ({ count: e.count, stagger: e.stagger, cards: (e.cards || []).length })),
    };
  })()`);
  console.log(`[逐张弃 ${N} 张] 事件总数=${each.count} 类型=${JSON.stringify(each.types)}`);
  console.log(`[逐张弃 ${N} 张] 批次=${JSON.stringify(each.batches)}`);

  // ---- 批量弃（putMany）----
  const many = await page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    b.animQueue = [];
    const u = b.allies[0];
    u.hand = u.hand || [];
    while (u.hand.length < ${N}) {
      u.hand.push(window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
    }
    const cards = u.hand.splice(0, ${N});
    window.BattleCards.putMany(b, u, cards, "discard");
    const q = b.animQueue || [];
    return {
      count: q.length,
      types: q.map(e => e && e.type),
      batches: q.filter(e => e && e.type === "discardBatch")
        .map(e => ({ count: e.count, stagger: e.stagger, cards: (e.cards || []).length })),
    };
  })()`);
  console.log(`[批量弃 ${N} 张] 事件总数=${many.count} 类型=${JSON.stringify(many.types)}`);
  console.log(`[批量弃 ${N} 张] 批次=${JSON.stringify(many.batches)}`);

  // ---- 真实耗时：逐张弃后 drain 的墙钟时间 ----
  for (const mode of ["each", "many"]) {
    const ms = await page.evaluate(`(async () => {
      const state = window.state, b = state.battle;
      b.animQueue = []; b.locked = false;
      const u = b.allies[0];
      u.hand = u.hand || [];
      while (u.hand.length < ${N}) {
        u.hand.push(window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
      }
      const cards = u.hand.splice(0, ${N});
      if ("${mode}" === "each") cards.forEach(c => window.BattleCards.put(b, u, c, "discard"));
      else window.BattleCards.putMany(b, u, cards, "discard");
      const t0 = performance.now();
      const deadline = t0 + 60000;
      while (performance.now() < deadline) {
        if (!(b.animQueue || []).length && !b.locked) break;
        await new Promise(r => setTimeout(r, 50));
      }
      return Math.round(performance.now() - t0);
    })()`);
    console.log(`[真实耗时 ${mode} 弃 ${N} 张] ${ms}ms`);
  }

  // ---- 真实耗时：摸牌 drain ----
  const drawMs = await page.evaluate(`(async () => {
    const state = window.state, b = state.battle;
    b.animQueue = []; b.locked = false;
    const u = b.allies[0];
    u.pileStats = u.pileStats || {};
    while ((u.pileStats.deck || []).length < 40) {
      u.pileStats.deck.push(window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
    }
    window.BattleSystem.draw(u, ${N}, b);
    const t0 = performance.now();
    const deadline = t0 + 60000;
    while (performance.now() < deadline) {
      if (!(b.animQueue || []).length && !b.locked) break;
      await new Promise(r => setTimeout(r, 50));
    }
    return Math.round(performance.now() - t0);
  })()`);
  console.log(`[真实耗时 摸 ${N} 张] ${drawMs}ms`);

  console.log(`[页面错误] ${errors.length ? errors.join(" | ") : "无"}`);
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
