// 标记徽章：多个标记同时出现时不得互相重叠，且不得被拉伸成大面积色块。
// 历史 BUG：每个徽章各自 absolute 定位到固定角落，绿帽/粮食同位、炮弹/死亡音波同位、
// 偶像/巨蛋/蓄力同位 → 完全重叠；死亡音波还因 left+right+top+bottom 四向同时生效
// 被撑成 78×100 的巨大蓝色椭圆。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0;
function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

// 同时挂上多个标记：绿帽 / 粮食 / 狂战 / 炮弹 / 死亡音波 / 偶像 / 巨蛋 / 使命 / 脆弱
const SETUP = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[0];
  e.ai = "ruins_dragon";
  e.ruinsDeathWaveSuits = ["♥", "♦", "♠"];
  e.greenHat = 2; e.food = 3; e.rageMarks = 4; e.tankShell = true;
  e.missionCount = 7; e.idolSuit = "♥"; e.domeSuits = ["♦"]; e.vulnerable = true;
  window.render();
  return 1;
})()`;

const MEASURE = `(() => {
  const wrap = document.querySelector(".mark-badges");
  const badges = [...(wrap ? wrap.querySelectorAll(".green-hat-badge") : [])];
  const rects = badges.map(el => {
    const r = el.getBoundingClientRect();
    return { txt: (el.textContent || "").trim(), x: r.left, y: r.top, w: r.width, h: r.height };
  });
  return { hasWrap: !!wrap, rects };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  await page.evaluate(SETUP);
  await page.waitForTimeout(900);
  const m = await page.evaluate(MEASURE);
  await page.close();
  await browser.close();

  console.log("=== 标记徽章堆叠 ===");
  pass += check("1.1 徽章装入堆叠容器", m.hasWrap, m);
  pass += check("1.2 渲染出多个标记", m.rects.length >= 4,
    { count: m.rects.length });

  // 两两不得相交
  const overlaps = [];
  for (let i = 0; i < m.rects.length; i += 1) {
    for (let j = i + 1; j < m.rects.length; j += 1) {
      const a = m.rects[i], c = m.rects[j];
      const hit = a.x < c.x + c.w && c.x < a.x + a.w
        && a.y < c.y + c.h && c.y < a.y + a.h;
      if (hit) overlaps.push([a.txt, c.txt]);
    }
  }
  pass += check("1.3 任意两枚徽章不重叠", overlaps.length === 0, overlaps);

  // 不得被拉伸成大面积色块（高度应接近单行文本高度）
  const tall = m.rects.filter(r => r.h > 30);
  pass += check("1.4 无徽章被拉伸（高度 >30）", tall.length === 0, tall);

  const dw = m.rects.find(r => /音波/.test(r.txt));
  pass += check("1.5 死亡音波徽章存在", !!dw, m.rects.map(r => r.txt));
  if (dw) {
    pass += check("1.6 死亡音波徽章尺寸正常（<=60 高）", dw.h <= 60, dw);
    pass += check("1.7 死亡音波徽章显示记录花色", /[♥♦♠♣]/.test(dw.txt), dw.txt);
  }
  pass += check("1.8 无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n=== ${pass}/8 通过 ===`);
  process.exit(pass === 8 ? 0 : 1);
})();
