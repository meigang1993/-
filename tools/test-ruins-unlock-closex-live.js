// 实战：废墟沙城解锁弹窗 —— 点击右上角 X 的行为
// 验证点：能否关闭 / 关闭后副本与角色是否解锁 / 是否会永久丢失
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame } = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const results = [];
const check = (name, cond, info) => {
  results.push({ name, ok: !!cond, info });
  console.log(`${cond ? "✅" : "❌"} ${name}${info !== undefined ? "  " + JSON.stringify(info) : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } });
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(e.message));
  await openGame(page);
  await page.evaluate(() => Promise.all([
    window.GameBundles?.load?.("battle"),
    window.GameBundles?.load?.("dungeon"),
    window.GameBundles?.load?.("hall"),
  ]));
  await page.click("[data-start-game]");
  await page.waitForTimeout(1500);

  // 触发解锁弹窗
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
  await page.waitForTimeout(1200);

  // 找 X 按钮（.info-close）
  const xBtn = await page.$(".villa-modal .info-close");
  check("X 按钮存在", !!xBtn, { found: !!xBtn });
  if (!xBtn) {
    console.log("无法继续，X 按钮不存在");
    await browser.close();
    process.exit(1);
  }

  const before = await page.evaluate(() => {
    const s = window.state;
    const a = s.chars.find(c => c.id === "artina");
    const m = s.chars.find(c => c.id === "maria");
    return {
      modal: s.hallModal,
      unlocked: !!s.flags?.ruinsSandCityUnlocked,
      artinaLocked: !!a?.locked,
      mariaLocked: !!m?.locked,
    };
  });
  check("关闭前：未解锁", before.modal === "ruinsSandCityUnlock" && !before.unlocked, before);

  // 点击 X
  await xBtn.click();
  await page.waitForTimeout(1500);

  const after = await page.evaluate(() => {
    const s = window.state;
    const a = s.chars.find(c => c.id === "artina");
    const m = s.chars.find(c => c.id === "maria");
    return {
      modal: s.hallModal,
      unlocked: !!s.flags?.ruinsSandCityUnlocked,
      seen: !!s.flags?.ruinsSandCityUnlockSeen,
      artinaLocked: !!a?.locked,
      mariaLocked: !!m?.locked,
      log: (s.log || []).slice(-3),
    };
  });
  check("点 X 后弹窗关闭", after.modal === null, { modal: after.modal });
  check("点 X 后副本解锁（不丢失）", after.unlocked === true, after);
  check("点 X 后亚缇娜解锁", after.artinaLocked === false, { locked: after.artinaLocked });
  check("点 X 后玛利亚解锁", after.mariaLocked === false, { locked: after.mariaLocked });

  // 副本是否真的可进入（检查副本入口不再 locked）
  const dungeon = await page.evaluate(() => {
    const list = window.GameData?.dungeons || window.GameData?.missions || [];
    const d = list.find(x => x.id === "ruins_sand_city" || x.name?.includes("废墟沙城"));
    return d ? { id: d.id, locked: !!d.locked, requiresFlag: d.requiresFlag || null } : null;
  });
  check("废墟沙城副本条目存在", !!dungeon, dungeon);

  console.log("\n关闭后完整状态:", JSON.stringify(after, null, 1));

  const pass = results.filter(r => r.ok).length;
  const fail = results.length - pass;
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  console.log("页面错误:", errors.length ? errors : "none");
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
