// 浏览器实机：更新公告面板删除顶部固定说明后，下方分期列表完整可见且可滚动，并输出截图。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const fs = require("fs");
const { chromium } = require("playwright");
const { openGame, startFreshGame, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SHOT = process.env.NOTICE_SHOT || "/data/workspace/更新公告-无顶部说明.png";
let pass = 0, fail = 0;
const check = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? "✅" : "❌"} ${name}${detail ? `  ← ${detail}` : ""}`);
};

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_BIN || undefined,
    args: ["--disable-dev-shm-usage"],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);

  await page.locator('[data-open-modal="updates"]').click();
  await page.waitForTimeout(700);
  const info = await page.evaluate(() => {
    const notice = document.querySelector(".update-notice");
    const list = document.querySelector(".update-notice-list");
    const head = document.querySelector(".update-notice-head");
    const sections = Array.from(list ? list.querySelectorAll(".update-notice-section") : []);
    const first = sections[0] ? sections[0].textContent.replace(/\s+/g, " ").slice(0, 120) : "";
    return {
      open: !!notice,
      topSummaryCount: document.querySelectorAll(".update-notice-summary").length,
      paragraphCount: document.querySelectorAll(".update-notice > p").length,
      children: notice ? Array.from(notice.children).map(el => el.className) : [],
      listH: list ? list.clientHeight : 0,
      scrollH: list ? list.scrollHeight : 0,
      headH: head ? head.getBoundingClientRect().height : 0,
      firstSection: first,
      sectionCount: sections.length,
    };
  });
  check("公告面板已打开", info.open);
  check("顶部固定说明段 0 个", info.topSummaryCount === 0 && info.paragraphCount === 0,
    `topSummary=${info.topSummaryCount} p=${info.paragraphCount}`);
  check("面板根节点只有 head + 可滚动 list 两个子元素",
    info.children.length === 2 && info.children[0].includes("update-notice-head")
    && info.children[1].includes("update-notice-list"), JSON.stringify(info.children));
  check("列表获得完整剩余高度（不再被上面说明挤压）", info.listH > 400,
    `listH=${info.listH} headH=${info.headH}`);
  check("列表内容可滚动", info.scrollH > info.listH + 100,
    `scrollH=${info.scrollH} listH=${info.listH}`);
  check("首期条目在列表内且可见", /2026年11月19日/.test(info.firstSection) && info.sectionCount > 3,
    `sections=${info.sectionCount} first=${info.firstSection.slice(0, 60)}`);

  // 真实滚动一次，再把位置归零后截图
  const scrolled = await page.evaluate(() => {
    const list = document.querySelector(".update-notice-list");
    if (!list) return 0;
    list.scrollTop = 260;
    const top = list.scrollTop;
    list.scrollTop = 0;
    return top;
  });
  check("滚动区真实可滚动（scrollTop 能改变）", scrolled > 0, `scrollTop=${scrolled}`);

  const card = page.locator(".modal-card.update-modal");
  await card.screenshot({ path: SHOT, animations: "disabled" });
  const size = fs.existsSync(SHOT) ? fs.statSync(SHOT).size : 0;
  check("面板截图已生成", size > 10000, `${SHOT} ${size}B`);
  check("页面无 JS 错误", errors.length === 0, errors.slice(0, 2).join(" | "));

  console.log(`\n合计 ${pass} 通过 / ${fail} 失败   截图 ${SHOT}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
