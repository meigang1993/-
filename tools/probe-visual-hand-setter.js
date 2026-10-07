// 诊断：谁把 visualHandCount 写成了 undefined
//
// 用属性访问器拦截 allies[0].visualHandCount 的 setter，
// 记录每次写入的值与调用栈，定位把其置为 undefined 的代码位置。
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
  window.__vhSets = [];
  let inner = a.visualHandCount;
  Object.defineProperty(a, "visualHandCount", {
    configurable: true,
    get() { return inner; },
    set(v) {
      window.__vhSets.push({
        v: typeof v === "number" ? v : String(v),
        stack: (new Error().stack || "").split(String.fromCharCode(10))
          .slice(1, 5).map(x => x.trim()).join(" | "),
      });
      inner = v;
    },
  });
  window.render();
  return { uid: a.uid, before: inner };
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
  console.log("初始:", JSON.stringify(await page.evaluate(setupTpl)));
  await page.evaluate(playTpl);
  await page.waitForTimeout(6000);
  const sets = await page.evaluate(`(() => {
    const b = window.state.battle;
    const a = b.allies[0];
    return { sets: window.__vhSets, final: a.visualHandCount,
      type: typeof a.visualHandCount, hand: (a.hand || []).length };
  })()`);
  console.log("最终值:", sets.final, "类型:", sets.type, "手牌:", sets.hand);
  console.log("写入记录:");
  sets.sets.forEach((s, i) => {
    console.log(`  #${i} v=${s.v}`);
    console.log(`     ${s.stack}`);
  });
  console.log("页面错误:", errors.length ? errors.join(" | ") : "无");
  await browser.close();
})().catch(e => { console.error("FATAL", e); process.exit(1); });
