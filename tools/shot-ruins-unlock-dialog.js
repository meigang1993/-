// 截图：废墟沙城解锁事件弹窗（真实渲染，非模拟）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  await openGame(page);
  await page.evaluate(() => Promise.all([
    window.GameBundles?.load?.("battle"),
    window.GameBundles?.load?.("dungeon"),
    window.GameBundles?.load?.("hall"),
  ]));
  await page.click("[data-start-game]");
  await page.waitForTimeout(1500);

  await page.evaluate(() => {
    const s = window.state;
    s.battle = null; s.explore = null; s.view = "hall"; s.hallModal = null;
    s.flags ||= {};
    delete s.flags.ruinsSandCityUnlocked;
    delete s.flags.ruinsSandCityUnlockSeen;
    const a = s.chars.find(c => c.id === "artina");
    const m = s.chars.find(c => c.id === "maria");
    if (a) a.locked = true;
    if (m) m.locked = true;
    window.triggerRuinsSandCityUnlockEvent?.(s, { missionId: "orc_dungeon", difficultyId: "warrior" });
    window.render?.();
  });
  await page.waitForTimeout(2000);

  // 优先截弹窗本体，其次整页
  const modal = await page.$(".villa-modal, .hall-modal, .modal");
  const target = modal || page;
  const out = "/data/workspace/shot-ruins-unlock-dialog.png";
  await target.screenshot({ path: out });
  console.log("截图完成:", out, "弹窗元素:", !!modal);
  await browser.close();
})();
