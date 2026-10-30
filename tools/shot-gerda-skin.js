// 截图：验证「格尔达」10 级特殊立绘接入后的实机渲染效果。
// 目的：确认新立绘在「我方行 unit-main」与「当前行动角色大立绘 active-portrait-shell」
// 两个容器里都能真实加载（naturalWidth > 0）、不变形（正方形图 + 正方形框），并出图供人工核对。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  // 让 10 级特殊立绘处于「已解锁」状态：角色未锁定 + 等级 >= 10
  const ch = (st.chars || []).find(c => c.id === "gerda" || c.ref === "gerda" || c.name === "格尔达");
  if (ch) { ch.locked = false; ch.unlocked = true; ch.level = 10; }
  st.equippedSkins = st.equippedSkins || {};
  st.equippedSkins.gerda = "gerda_level_10_special";

  b.animQueue = []; b.locked = false; b.phase = 4;
  const mk = (u, ref, name, extra) => {
    u.name = name; u.ref = ref; u.id = ref; u.gender = "female";
    u.hp = u.maxHp = 60; u.block = 0; u.intent = 1;
    u.stats = { attack: 3, magic: 3, speed: 3, maxHp: 60, bloodlust: 1, handLimit: 6 };
    u.skills = []; u.hand = [];
    Object.assign(u, extra || {});
    return u;
  };
  mk(b.allies[0], "gerda", "格尔达");
  mk(b.allies[1], "abe_karuna", "安倍卡露娜");
  b.enemies.forEach(e => { e.hp = e.maxHp = 200; e.hand = []; e.noResponse = true; });
  b.activeUid = b.allies[0].uid;
  st.log = []; st.battleLog = [];
  window.render();
  return { char: !!ch, equipped: st.equippedSkins.gerda, active: b.activeUid };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errList = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);
  const setup = await page.evaluate(setupTpl);
  console.log("=== 装配 ===", JSON.stringify(setup));
  await page.waitForTimeout(900);

  const m = await page.evaluate(`(() => {
    const r = el => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    };
    const imgs = [];
    const scan = (root, where) => {
      (root ? root.querySelectorAll("img") : []).forEach && null;
    };
    document.querySelectorAll("img").forEach(el => {
      const src = el.getAttribute("src") || "";
      if (!/gerda/i.test(src)) return;
      const host = el.closest(".active-portrait-shell") || el.closest(".unit-main") || el.closest(".unit-frame");
      imgs.push({
        src,
        where: el.closest(".active-portrait-shell") ? "active-portrait-shell" : (el.closest(".unit-main") ? "unit-main" : "other"),
        natural: { w: el.naturalWidth, h: el.naturalHeight },
        box: r(el),
        hostBox: r(host),
        objectFit: getComputedStyle(el).objectFit,
      });
    });
    const units = Array.from(document.querySelectorAll(".unit-frame .unit-main.ally-main")).map(el => {
      const img = el.querySelector("img");
      return { box: r(el), src: img ? img.getAttribute("src") : null, natural: img ? img.naturalWidth : 0 };
    });
    return { imgs, units, shell: r(document.querySelector(".active-portrait-shell")) };
  })()`);

  console.log("=== 格尔达立绘实测 ===");
  m.imgs.forEach(i => {
    console.log(`[${i.where}] ${i.src}`);
    console.log(`   natural ${i.natural.w}x${i.natural.h}  box ${JSON.stringify(i.box)}  objectFit ${i.objectFit}`);
    if (i.hostBox) console.log(`   host ${JSON.stringify(i.hostBox)}`);
  });
  console.log("=== 我方行头像 ===");
  m.units.forEach((u, k) => console.log(`  unit${k} src=${u.src} natural=${u.natural} ${JSON.stringify(u.box)}`));
  console.log("=== 大立绘 ===", JSON.stringify(m.shell));

  await page.screenshot({ path: "/data/workspace/gerda_skin_full.png" });
  const shell = await page.$(".active-portrait-shell");
  if (shell) await shell.screenshot({ path: "/data/workspace/gerda_skin_shell.png" });
  const u0 = (await page.$$(".unit-frame .unit-main.ally-main"))[0];
  if (u0) await u0.screenshot({ path: "/data/workspace/gerda_skin_unit0.png" });

  const errs = relevantErrors(errList);
  console.log("页面错误:", errs.length);
  errs.slice(0, 5).forEach(e => console.log("  ", String(e).slice(0, 160)));
  await browser.close();
})().catch(e => { console.error("FAIL", e && e.message); process.exit(1); });
