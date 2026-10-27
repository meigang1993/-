// 截图：展示星野依三个技能徽章（偶像之星 / 巨蛋演出 / 梦想真理）的实际显示与位置。
// 目的：量出三个徽章在「我方行 unit-main」与「当前行动角色大立绘 active-portrait-shell」
// 两个容器里的真实坐标；同时并排卡露娜的【同频】徽章，验证 A 方案（mark-badges 整体下移）后的对齐效果。
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
  // 星野依：三个徽章全部点亮（使命 7/20、偶像 ♥、巨蛋 ♥♦♠）
  mk(b.allies[0], "hoshino_yi", "星野依",
    [{ name: "偶像之星" }, { name: "巨蛋演出" }, { name: "梦想真理" }],
    { hoshinoLastSuit: "♥", hoshinoLastColor: "red",
      hoshinoSuitSet: ["♥", "♦", "♠"],
      hoshinoMissionCards: 7, hoshinoMissionResult: null });
  // 卡露娜作对照：只有【同频 ♦】一个徽章
  mk(b.allies[1], "abe_karuna", "安倍卡露娜",
    [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }],
    { karunaLastSuit: "♦", karunaLastColor: "red" });
  b.enemies.forEach(e => { e.hp = e.maxHp = 200; e.hand = []; e.noResponse = true; });
  b.activeUid = b.allies[0].uid; // 当前行动大立绘 = 星野依
  st.log = []; st.battleLog = [];
  window.render();
  return { active: b.activeUid };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 2 });
  const errList = collectErrors(page);
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
    const out = { units: [], badges: [] };
    document.querySelectorAll(".unit-frame .unit-main.ally-main").forEach(el => {
      const host = r(el);
      const marks = Array.from(el.querySelectorAll(".green-hat-badge")).map(bd => {
        const bb = r(bd);
        return { text: (bd.textContent || "").trim(), box: bb,
          aboveHostTop: bb.y - host.y, rightOfHost: (bb.x + bb.w) - (host.x + host.w) };
      });
      out.units.push({ name: (el.querySelector(".unit-name") || {}).textContent || "", host, marks });
    });
    const shell = document.querySelector(".active-portrait-shell");
    if (shell) {
      const sb = r(shell);
      out.shell = { box: sb, marks: Array.from(shell.querySelectorAll(".green-hat-badge")).map(bd => {
        const bb = r(bd);
        return { text: (bd.textContent || "").trim(), box: bb,
          aboveHostTop: bb.y - sb.y, rightOfHost: (bb.x + bb.w) - (sb.x + sb.w) };
      }) };
    }
    return out;
  })()`);

  console.log("=== 星野依徽章实测 ===");
  m.units.forEach(u => {
    console.log(`[unit-main] ${u.name}  宿主 ${JSON.stringify(u.host)}`);
    u.marks.forEach(k => console.log(`   ${k.text}  相对顶部 ${k.aboveHostTop}px  右侧超出 ${k.rightOfHost}px  ${JSON.stringify(k.box)}`));
    if (!u.marks.length) console.log("   （无徽章）");
  });
  if (m.shell) {
    console.log(`[active-portrait-shell] ${JSON.stringify(m.shell.box)}`);
    m.shell.marks.forEach(k => console.log(`   ${k.text}  相对顶部 ${k.aboveHostTop}px  右侧超出 ${k.rightOfHost}px`));
    if (!m.shell.marks.length) console.log("   （无徽章）");
  }

  await page.screenshot({ path: "/data/workspace/hoshino_marks_full.png" });
  if (m.shell) {
    const s = m.shell.box;
    await page.screenshot({ path: "/data/workspace/hoshino_marks_shell.png",
      clip: { x: Math.max(0, s.x - 20), y: Math.max(0, s.y - 20),
        width: Math.min(1600 - Math.max(0, s.x - 20), s.w + 40),
        height: Math.min(1000 - Math.max(0, s.y - 20), s.h + 40) } });
  }
  const rows = m.units.filter(u => u.host);
  if (rows.length) {
    const x0 = Math.min(...rows.map(u => u.host.x)), x1 = Math.max(...rows.map(u => u.host.x + u.host.w));
    const y0 = Math.min(...rows.map(u => u.host.y)), y1 = Math.max(...rows.map(u => u.host.bottom));
    await page.screenshot({ path: "/data/workspace/hoshino_marks_row.png",
      clip: { x: Math.max(0, x0 - 30), y: Math.max(0, y0 - 30),
        width: Math.min(1600 - Math.max(0, x0 - 30), x1 - x0 + 60),
        height: Math.min(1000 - Math.max(0, y0 - 30), y1 - y0 + 60) } });
  }
  // 只截星野依头像（放大，便于看清三个徽章）
  const yi = m.units[0]; // allies[0] 即星野依
  if (yi) {
    await page.screenshot({ path: "/data/workspace/hoshino_marks_zoom.png",
      clip: { x: Math.max(0, yi.host.x - 60), y: Math.max(0, yi.host.y - 40),
        width: Math.min(1600 - Math.max(0, yi.host.x - 60), yi.host.w + 120),
        height: Math.min(1000 - Math.max(0, yi.host.y - 40), yi.host.h + 80) } });
  }

  const errs = relevantErrors(errList);
  console.log("页面错误:", errs.length, JSON.stringify(errs.slice(0, 3)));
  await browser.close();
})().catch(e => { console.error("FATAL", e.message); process.exit(1); });
