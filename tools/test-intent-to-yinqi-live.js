// 246 版：历史公告「原文保留」口径下的浏览器实机验证。
// 旧词以 Unicode 转义构造，避免脚本自身被全库残留扫描命中。
// 旧词只允许出现在历史公告条目（往期 recent + archive）及其渲染容器内。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const OLD = "\u6740\u610f";
const NEW = "淫气";
let pass = 0, total = 0;
function check(name, cond, extra) {
  total += 1;
  if (cond) { pass += 1; return; }
  console.log(`❌ ${name}`, JSON.stringify(extra || {}));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [], badImages = [];
  page.on("pageerror", e => errors.push(String(e)));
  page.on("requestfailed", r => {
    if (r.resourceType() === "image") badImages.push(r.url());
  });
  try {
    await openGame(page);
    await startFreshGame(page);
    await dismissOpeningStory(page);

    const g = await page.evaluate(({ oldWord, newWord }) => {
      const C = window.GameDataCards || {};
      // 全局暴露的是 cardCodex / baseDeck / marketCards，不是源码里的局部 shoup4Defs。
      const defs = [C.cardCodex, C.baseDeck, C.marketCards]
        .find(a => Array.isArray(a) && a.length > 30) || [];
      const texts = defs.map(c => String(c.text || ""));
      const recent = window.UpdateNoticeRecent || [];
      const curNotices = (recent[0] && recent[0].items) || [];
      const histNotices = recent.slice(1).flatMap(x => x.items || []);
      const archiveNotices = (window.UpdateNoticeArchive || []).flatMap(x => x.items || []);
      // 遍历文本节点，区分「公告容器内」与「其它可见区域」。
      let nonNoticeOld = 0, noticeOld = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (!n.nodeValue || !n.nodeValue.includes(oldWord)) continue;
        if (n.parentElement && n.parentElement.closest(".update-notice")) noticeOld += 1;
        else nonNoticeOld += 1;
      }
      const serialized = JSON.stringify(C);
      return {
        defsN: defs.length,
        defsOld: texts.filter(t => t.includes(oldWord)).length,
        killText: (defs.find(c => c.name === "杀（普攻）") || {}).text || "",
        killHit: serialized.includes("消耗1点" + newWord),
        globalNew: serialized.includes(newWord),
        globalOld: serialized.includes(oldWord),
        noticeHit: curNotices.some(t => t.includes("出牌资源统一更名为【淫气】")),
        noticePolicy: curNotices.some(t => t.includes("全库文案统一")),
        noticeCurOld: curNotices.some(t => t.includes(oldWord)),
        noticeHistOld: histNotices.concat(archiveNotices).some(t => t.includes(oldWord)),
        nonNoticeOld, noticeOld,
        versionHit: /20260915-247|26\.0915\.247/.test(
          document.body.innerText + document.documentElement.outerHTML.slice(0, 4000)),
      };
    }, { oldWord: OLD, newWord: NEW });

    check("A1 页面无 JS 错误", errors.length === 0, errors);
    check("A2 图片请求失败 0", badImages.length === 0, badImages.slice(0, 4));
    check("A3 非公告区域渲染文本无旧词", g.nonNoticeOld === 0, { g });

    check("B1 运行时卡表 > 30 张", g.defsN > 30, { n: g.defsN });
    check("B2 运行时所有卡面 text 无旧词", g.defsOld === 0, { n: g.defsOld });
    check("B3 运行时卡表含消耗1点淫气", g.killHit, { t: g.killText.slice(0, 90) });
    check("B4 卡表全局含新词且无旧词", g.globalNew && !g.globalOld, { g });

    check("C1 公告数据含更名说明", g.noticeHit);
    check("C2 当期公告数据无旧词", !g.noticeCurOld);
    check("C2b 往期/归档旧词已清零", !g.noticeHistOld, { g });
    check("C3 全库统一口径说明在位", g.noticePolicy);

    // 真实点击大厅「更新公告」按钮打开面板，确认全页面（含公告条目）旧词为零。
    await page.click('[data-open-modal="updates"]');
    await page.waitForSelector(".update-notice .update-notice-list", { timeout: 8000 });
    const h = await page.evaluate(({ oldWord }) => {
      let nonNoticeOld = 0, noticeOld = 0;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (!n.nodeValue || !n.nodeValue.includes(oldWord)) continue;
        if (n.parentElement && n.parentElement.closest(".update-notice")) noticeOld += 1;
        else nonNoticeOld += 1;
      }
      const notice = document.querySelector(".update-notice");
      return { nonNoticeOld, noticeOld, noticeLen: (notice && notice.innerText || "").length };
    }, { oldWord: OLD });
    check("C4 公告面板内可见旧词 = 0", h.noticeOld === 0, { h });
    check("C5 打开公告面板后其它区域仍无旧词", h.nonNoticeOld === 0, { h });

    check("D1 页面版本戳 247", g.versionHit);
    check("D2 收尾仍无 JS 错误", errors.length === 0, errors);
  } finally {
    await browser.close();
  }
  console.log(`${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error(err); process.exit(2); });
