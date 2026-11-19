// 245 版：出牌资源旧名→「淫气」浏览器实机验证。
// 旧词以 Unicode 转义构造，避免脚本自身被全库残留扫描命中。
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

    const html = await page.content();
    check("A1 渲染 DOM 全文无旧词", !html.includes(OLD));
    check("A2 页面无 JS 错误", errors.length === 0, errors);
    check("A3 图片请求失败 0", badImages.length === 0, badImages.slice(0, 4));

    const g = await page.evaluate(({ oldWord, newWord }) => {
      const C = window.GameDataCards || {};
      // 全局暴露的是 cardCodex / baseDeck / marketCards，不是源码里的局部 shoup4Defs。
      const defs = [C.cardCodex, C.baseDeck, C.marketCards]
        .find(a => Array.isArray(a) && a.length > 30) || [];
      const texts = defs.map(c => String(c.text || ""));
      const notices = (window.UpdateNoticeRecent || []).flatMap(x => x.items || []);
      const body = document.body.innerText || "";
      const serialized = JSON.stringify(C);
      return {
        defsN: defs.length,
        defsOld: texts.filter(t => t.includes(oldWord)).length,
        killText: (defs.find(c => c.name === "杀（普攻）") || {}).text || "",
        killHit: serialized.includes("消耗1点" + newWord),
        globalNew: JSON.stringify(C).includes(newWord),
        globalOld: JSON.stringify(C).includes(oldWord),
        noticeHit: notices.some(t => t.includes("出牌资源统一更名为【淫气】")),
        noticeOld: notices.some(t => t.includes(oldWord)),
        bodyOld: body.includes(oldWord),
        versionHit: /20260915-245|26\.0915\.245/.test(body + document.documentElement.outerHTML.slice(0, 4000)),
      };
    }, { oldWord: OLD, newWord: NEW });

    check("B1 运行时卡表 > 30 张", g.defsN > 30, { n: g.defsN });
    check("B2 运行时所有卡面 text 无旧词", g.defsOld === 0, { n: g.defsOld });
    check("B3 运行时卡表含消耗1点淫气", g.killHit, { t: g.killText.slice(0, 90) });
    check("B4 卡表全局含新词且无旧词", g.globalNew && !g.globalOld, { g });
    check("C1 公告数据含更名说明", g.noticeHit);
    check("C2 公告数据无旧词", !g.noticeOld);
    check("C3 可见文本无旧词", !g.bodyOld);
    check("D1 页面版本戳 245", g.versionHit);
    check("D2 收尾仍无 JS 错误", errors.length === 0, errors);
  } finally {
    await browser.close();
  }
  console.log(`${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error(err); process.exit(2); });
