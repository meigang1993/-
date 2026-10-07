// 诊断：摸牌合并后 visualHandCount 是否会追平手牌数
//
// 背景：推进器测试在合并改动后有一项失败——采样里 v（visualHandCount）
// 最终为 undefined，且全程未追平 handAfter。需要确认：
//   · 是 visualHandCount 真的没同步（真 BUG），还是
//   · 采样持有的是过期 unit 引用（战斗重开导致对象被替换）
// 判据：动画结束后直接重新按 uid 查找 unit，读其 visualHandCount 与 hand.length。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

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
  const q = b.animQueue || (b.animQueue = []);
  const origPush = q.push.bind(q);
  q.push = function (...items) {
    items.forEach(it => {
      if (it && it.type === "drawBatch") {
        window.__drawEvents.push({ uid: it.uid, count: it.count,
          cards: (it.cards || []).length });
      }
    });
    return origPush(...items);
  };
  window.__samples = [];
  window.__allyUid = a.uid;
  window.__sampleTimer = setInterval(() => {
    const cur = b.allies.find(x => x.uid === window.__allyUid);
    window.__samples.push({ t: Date.now() % 100000,
      v: cur ? cur.visualHandCount : "NO_UNIT",
      h: cur ? (cur.hand || []).length : -1,
      sameRef: cur === a });
  }, 40);
  window.render();
  return { handBefore: a.hand.length, visualBefore: a.visualHandCount, uid: a.uid };
})()`;

const playTpl = `(() => {
  const st = window.state, b = st.battle;
  const ok = window.BattleSystem.playActiveCard(st, 0, b.enemies[0].uid);
  return { ok };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  const before = await page.evaluate(setupTpl);
  console.log("初始:", JSON.stringify(before));
  await page.evaluate(playTpl);
  await page.waitForTimeout(6000);
  const r = await page.evaluate(`(() => {
    clearInterval(window.__sampleTimer);
    const st = window.state, b = st.battle;
    const cur = b.allies.find(x => x.uid === window.__allyUid);
    return {
      uid: window.__allyUid,
      found: !!cur,
      visualNow: cur ? cur.visualHandCount : null,
      handNow: cur ? (cur.hand || []).length : null,
      alliesCount: (b.allies || []).length,
      drawEvents: window.__drawEvents,
      samples: window.__samples,
      pending: cur ? (cur.hand || []).filter(c => c && c._pendingDraw).length : null,
    };
  })()`);
  console.log("drawBatch 事件:", JSON.stringify(r.drawEvents));
  console.log("最终:", JSON.stringify({
    found: r.found, visualNow: r.visualNow, handNow: r.handNow, pending: r.pending,
  }));
  console.log("采样（去重后）:", JSON.stringify(
    r.samples.filter((s, i, arr) => i === 0
      || s.v !== arr[i - 1].v || s.h !== arr[i - 1].h)));
  console.log("是否始终同一引用:", r.samples.every(s => s.sameRef !== false));
  console.log("页面错误:", errors.length ? errors.join(" | ") : "无");
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
