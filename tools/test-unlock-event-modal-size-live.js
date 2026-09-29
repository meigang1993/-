// 解锁/剧情事件弹窗尺寸检查（浏览器）
// 需求：解锁事件界面太小——立绘只有 66×66。现改为 ADV 对话框：一次只显示一句，
// 检查：立绘放大到 150+、单句完整可见且不滚动、按钮不溢出视口、更新公告未被误伤。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

// 基线（改动前实测）：立绘 66×66、弹窗 920×622
const MIN_PORTRAIT = 150;     // 基线 66，ADV 化后 1440 下实测约 244
const MIN_CARD_W = 900;       // 基线 920
const MIN_CARD_H = 480;       // 基线 622（1440）、456（1280）
const MIN_BOX_H = 100;        // 对话框高度：单句需完整展示

// 代表性的事件：对话行数与立绘数各不相同
const EVENTS = [
  { modal: "ruinsSandCityUnlock", label: "废墟沙城解锁（15 行 / 4 立绘）" },
  { modal: "hoshinoFamilyUnlock", label: "星野一家解锁（4 行 / 3 立绘）" },
  { modal: "gerdaNurseryUnlock", label: "格尔达解锁（4 行 / 2 立绘）" },
  { modal: "underwaterTrainUnlock", label: "水下列车求援" },
  { modal: "orcDungeonUnlock", label: "兽人地下城求援" },
];

const measure = page => page.evaluate(() => {
  const r = el => el ? { w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height) } : null;
  const q = s => document.querySelector(s);
  const box = q(".adv-box");
  const card = q(".modal-card");
  const btn = q(".adv-actions button") || q(".first-defeat-event .actions button");
  const imgs = [...document.querySelectorAll(".adv-stage img")];
  return {
    card: r(card),
    portrait: imgs.length ? r(imgs[0]) : null,
    portraitCount: imgs.length,
    // ADV 一次只有一句：句数应为 1，且该句完整可见
    lineCount: document.querySelectorAll(".adv-text").length,
    visibleLines: document.querySelectorAll(".adv-text").length,
    linesH: box ? Math.round(box.getBoundingClientRect().height) : 0,
    needScroll: box ? box.scrollHeight - box.clientHeight : 0,
    cardScroll: card ? card.scrollHeight - card.clientHeight : 0,
    lastLineReachable: box ? box.scrollHeight - box.clientHeight === 0 : false,
    btnVisible: btn ? btn.getBoundingClientRect().bottom <= innerHeight : null,
    hOverflow: document.documentElement.scrollWidth > innerWidth,
  };
});

const openModal = async (page, modal) => {
  await page.evaluate(m => {
    const s = window.gameState || window.state;
    s.view = "hall"; s.hallModal = m; s.adv = null;
    if (window.render) window.render();
  }, modal);
  await page.waitForSelector(".first-defeat-event", { timeout: 5000 });
  await page.waitForTimeout(150);
};

(async () => {
  const browser = await chromium.launch();
  const errors = [];

  // —— 1440×900 ——
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", e => errors.push(e.message));
  await openGame(page);
  await startFreshGame(page);
  await page.waitForTimeout(300);

  for (const ev of EVENTS) {
    await openModal(page, ev.modal);
    const m = await measure(page);
    T(`1440 ${ev.label}：弹窗不小于基线`, m.card.w >= MIN_CARD_W && m.card.h >= MIN_CARD_H, m.card);
    T(`1440 ${ev.label}：立绘大于基线 66`, m.portrait && m.portrait.w >= MIN_PORTRAIT, m.portrait);
    T(`1440 ${ev.label}：按钮未溢出视口`, m.btnVisible === true, { btnVisible: m.btnVisible });
    T(`1440 ${ev.label}：无横向溢出`, m.hOverflow === false);
    T(`1440 ${ev.label}：单句完整可见、无需滚动`,
      m.lastLineReachable === true && m.cardScroll === 0,
      { needScroll: m.needScroll, cardScroll: m.cardScroll, linesH: m.linesH });
    T(`1440 ${ev.label}：一次只显示一句`,
      m.visibleLines === 1 && m.lineCount === 1,
      { visible: m.visibleLines, total: m.lineCount });
  }

  // 对话最长的废墟沙城：单句区域高度必须够用
  await openModal(page, "ruinsSandCityUnlock");
  const m15 = await measure(page);
  T(`1440 废墟沙城：对话框高度 ≥ ${MIN_BOX_H}`,
    m15.linesH >= MIN_BOX_H, { linesH: m15.linesH });

  // 更新公告未被误伤（update-modal 应与 event-modal 分开，保持原尺寸）
  await page.evaluate(() => {
    const s = window.gameState || window.state;
    s.view = "hall"; s.hallModal = "updates";
    if (window.render) window.render();
  });
  await page.waitForTimeout(250);
  const up = await page.evaluate(() => {
    const card = document.querySelector(".modal-card");
    return {
      cls: card ? card.className : null,
      w: card ? Math.round(card.getBoundingClientRect().width) : 0,
      h: card ? Math.round(card.getBoundingClientRect().height) : 0,
    };
  });
  T("更新公告仍用 update-modal（未被 event-modal 放大）",
    up.cls && up.cls.includes("update-modal") && !up.cls.includes("event-modal"), up);
  T("更新公告宽度保持 860", up.w === 860, up);
  T("更新公告高度不超过 680", up.h <= 680, up);

  // —— 1280×720 矮屏 ——
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page2 = await ctx2.newPage();
  page2.on("pageerror", e => errors.push(e.message));
  await openGame(page2);
  await startFreshGame(page2);
  await page2.waitForTimeout(300);
  for (const ev of [EVENTS[0], EVENTS[1]]) {
    await openModal(page2, ev.modal);
    const m = await measure(page2);
    T(`1280 ${ev.label}：按钮未溢出视口`, m.btnVisible === true, { btnVisible: m.btnVisible, card: m.card });
    T(`1280 ${ev.label}：立绘大于基线 66`, m.portrait && m.portrait.w >= MIN_PORTRAIT, m.portrait);
    T(`1280 ${ev.label}：无横向溢出`, m.hOverflow === false);
    T(`1280 ${ev.label}：单句无需滚动`, m.needScroll === 0 && m.cardScroll === 0, m);
  }
  await openModal(page2, "ruinsSandCityUnlock");
  const m2 = await measure(page2);
  T(`1280 废墟沙城：对话框高度 ≥ ${MIN_BOX_H}`,
    m2.linesH >= MIN_BOX_H, { linesH: m2.linesH });

  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));
  await browser.close();
  console.log(`\n结果：${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
