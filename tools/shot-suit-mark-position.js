// 截图：对比【偶像之星】（星野依）与【同频歌姬】（卡露娜）花色徽标的实际显示位置。
// 目的：量出两者在「我方行 unit-main」与「当前行动角色大立绘 active-portrait-shell」
// 两个容器里的真实坐标，判断卡露娜的徽标是否被顶出头像框。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  const mk = (u, ref, name, skills, extra) => {
    u.name = name; u.ref = ref; u.id = ref; u.gender = "female";
    u.hp = u.maxHp = 60; u.block = 0; u.intent = 1;
    u.stats = { attack: 3, magic: 3, speed: 3, maxHp: 60, bloodlust: 1, handLimit: 6 };
    u.skills = skills; u.hand = [];
    Object.assign(u, extra || {});
    return u;
  };
  mk(b.allies[0], "abe_karuna", "安倍卡露娜", [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }],
    { karunaLastSuit: "♦", karunaLastColor: "red" });
  mk(b.allies[1], "hoshino_yi", "星野依", [{ name: "偶像之星" }, { name: "巨蛋演出" }, { name: "梦想真理" }],
    { hoshinoLastSuit: "♥", hoshinoLastColor: "red", hoshinoMissionCards: 5, hoshinoMissionResult: null });
  b.enemies.forEach(e => { e.hp = e.maxHp = 200; e.hand = []; e.noResponse = true; });
  b.activeUid = b.allies[0].uid;
  st.log = []; st.battleLog = [];
  window.render();
  return { active: b.activeUid };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);
  await page.evaluate(setupTpl);
  await page.waitForTimeout(700);

  const m = await page.evaluate(`(() => {
    const r = el => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom) };
    };
    const out = { badges: [] };
    document.querySelectorAll(".idol-suit-badge").forEach(el => {
      const host = el.closest(".active-portrait-shell") || el.closest(".unit-main");
      const stack = el.closest(".mark-badges");
      const box = r(el), hostBox = r(host), stackBox = r(stack);
      out.badges.push({
        text: (el.textContent || "").trim(),
        where: el.closest(".active-portrait-shell") ? "active-portrait-shell" : "unit-main",
        badge: box, host: hostBox, stack: stackBox,
        aboveHostTop: box && hostBox ? box.y - hostBox.y : null,
        rightOfHost: box && hostBox ? (box.x + box.w) - (hostBox.x + hostBox.w) : null,
      });
    });
    out.allies = Array.from(document.querySelectorAll(".unit-frame .unit-main.ally-main")).map(el => r(el));
    out.shell = r(document.querySelector(".active-portrait-shell"));
    return out;
  })()`);

  console.log("=== 徽标实测 ===");
  m.badges.forEach(b => {
    console.log(`[${b.where}] ${b.text}`);
    console.log(`   徽标 box ${JSON.stringify(b.badge)}`);
    console.log(`   宿主 box ${JSON.stringify(b.host)}`);
    console.log(`   相对宿主顶部 ${b.aboveHostTop}px，右侧超出 ${b.rightOfHost}px`);
  });
  console.log("大立绘 shell:", JSON.stringify(m.shell));

  await page.screenshot({ path: "/data/workspace/suit_mark_full.png" });
  if (m.shell) {
    await page.screenshot({
      path: "/data/workspace/suit_mark_shell.png",
      clip: { x: Math.max(0, m.shell.x - 20), y: Math.max(0, m.shell.y - 20), width: m.shell.w + 40, height: Math.min(1000 - Math.max(0, m.shell.y - 20), m.shell.h + 40) },
    });
  }
  // 我方行（两个头像并排，含两种徽标）
  const rows = m.allies.filter(Boolean);
  if (rows.length) {
    const x0 = Math.min(...rows.map(b => b.x)), x1 = Math.max(...rows.map(b => b.x + b.w));
    const y0 = Math.min(...rows.map(b => b.y)), y1 = Math.max(...rows.map(b => b.bottom));
    await page.screenshot({
      path: "/data/workspace/suit_mark_row.png",
      clip: { x: Math.max(0, x0 - 30), y: Math.max(0, y0 - 30), width: Math.min(1600 - Math.max(0, x0 - 30), x1 - x0 + 60), height: Math.min(1000 - Math.max(0, y0 - 30), y1 - y0 + 60) },
    });
  }

  const errs = relevantErrors(page);
  console.log("页面错误:", errs.length, JSON.stringify(errs.slice(0, 3)));
  await browser.close();
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
