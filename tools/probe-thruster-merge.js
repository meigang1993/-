// 诊断：推进器连续 3 次摸牌，每次之后的 drawBatch 队列快照
//
// 隔离用例显示 queueSum=2 但手牌 +3，需确认第 3 张牌是否真的漏了动画事件，
// 还是走了别的推送路径（如 witherer-relic-skills 直接 push）。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  const r = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0];
    b.activeUid = a.uid; b.locked = false;
    a.intent = 5; a.battleRelics = ["推进器"];
    a.hand = []; a.visualHandCount = 0;
    b.enemies.forEach(e => { e.hp = 200; });
    const steps = [];
    // 记录每次 push（含调用栈前几帧，判断是谁推的）
    const q = b.animQueue || (b.animQueue = []);
    const origPush = q.push.bind(q);
    let pushLog = [];
    q.push = function (...items) {
      items.forEach(it => {
        if (it && it.type === "drawBatch") {
          pushLog.push({ count: it.count,
            stack: (new Error().stack || "").split(String.fromCharCode(10))
              .slice(1, 4).map(x => x.trim()).join(" | ") });
        }
      });
      return origPush(...items);
    };
    const card = { name: "杀", type: "slash", suit: "\\u2660", scale: "attack" };
    for (let n = 1; n <= 3; n++) {
      pushLog = [];
      const c = Object.assign({}, card);
      const handBefore = a.hand.length;
      window.RuinsRelicEffects.afterCardPlayed(st, a, b.enemies[0], c, window.BattleSystem.draw);
      const draws = (b.animQueue || []).filter(e => e && e.type === "drawBatch");
      steps.push({
        n,
        handDelta: a.hand.length - handBefore,
        handTotal: a.hand.length,
        pushCount: pushLog.length,
        pushDetail: pushLog,
        queueDraws: draws.map(e => ({ count: e.count, cards: (e.cards || []).length })),
        queueSum: draws.reduce((s, e) => s + (e.count || 0), 0),
        allTypes: (b.animQueue || []).map(e => e && e.type),
      });
    }
    return { steps };
  })()`);
  r.steps.forEach(s => {
    console.log(`\n--- 第 ${s.n} 次 ---`);
    console.log(`  手牌 +${s.handDelta}（累计 ${s.handTotal}）`);
    console.log(`  本次 push 次数: ${s.pushCount}`);
    s.pushDetail.forEach(p => console.log(`     count=${p.count} @ ${p.stack}`));
    console.log(`  队列 drawBatch: ${JSON.stringify(s.queueDraws)}  合计=${s.queueSum}`);
    console.log(`  队列全部类型: ${JSON.stringify(s.allTypes)}`);
  });
  console.log("\n页面错误:", errors.length ? errors.join(" | ") : "无");
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
