// 实战：废墟沙城解锁事件对话 —— 渲染、立绘、按钮、点击后解锁
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
  const page = await browser.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(e.message));
  await openGame(page);
  await page.evaluate(() => Promise.all([
    window.GameBundles?.load?.("battle"),
    window.GameBundles?.load?.("dungeon"),
    window.GameBundles?.load?.("hall"),
  ]));
  // 必须先进大厅，否则渲染的是开始界面
  await page.click("[data-start-game]");
  await page.waitForTimeout(1500);

  const before = await page.evaluate(async () => {
    const s = window.state;
    s.battle = null; s.explore = null; s.view = "hall"; s.hallModal = null;
    s.flags ||= {};
    delete s.flags.ruinsSandCityUnlocked;
    delete s.flags.ruinsSandCityUnlockSeen;
    const a = s.chars.find(c => c.id === "artina");
    const m = s.chars.find(c => c.id === "maria");
    if (a) a.locked = true;
    if (m) m.locked = true;
    const triggered = window.triggerRuinsSandCityUnlockEvent?.(s,
      { missionId: "orc_dungeon", difficultyId: "warrior" });
    window.render?.();
    await new Promise(r => setTimeout(r, 500));
    // 只取弹窗内部，避免把大厅里的 <b> 一起匹配进来
    const html = document.querySelector(".villa-modal")?.innerHTML || "";
    return {
      triggered,
      modal: s.hallModal,
      villaModal: !!document.querySelector(".villa-modal"),
      portraits: (html.match(/class="portrait/g) || []).length,
      title: (html.match(/<h2>(.*?)<\/h2>/) || [])[1] || null,
      lines: [...html.matchAll(/<b>(.*?)<\/b><span>(.*?)<\/span>/g)].map(m => m[1] + "：" + m[2]),
      hasBtn: !!document.querySelector("[data-ruins-sand-city-unlock-complete]"),
    };
  });
  console.log("--- 弹窗对话 ---");
  (before.lines || []).forEach((l, i) => console.log(` ${i + 1}. ${l}`));

  check("兽人地下城勇士级→触发解锁", before.triggered === true, { triggered: before.triggered });
  check("hallModal = ruinsSandCityUnlock", before.modal === "ruinsSandCityUnlock", { modal: before.modal });
  check("弹窗 DOM 存在", before.villaModal === true);
  check("标题 = 加撒地区的战事", before.title === "加撒地区的战事", { title: before.title });
  check("立绘数 = 4", before.portraits === 4, { n: before.portraits });
  check("对话行数 = 15", before.lines.length === 15, { n: before.lines.length });
  check("以贝丝妲开场", (before.lines[0] || "").startsWith("贝丝妲："), { first: before.lines[0] });
  check("含「加撒地区」", before.lines.some(l => l.includes("加撒地区")));
  check("含「双胞胎姐姐」「卡迪西斯」",
    before.lines.some(l => l.includes("双胞胎姐姐")) && before.lines.some(l => l.includes("卡迪西斯")));
  check("含普雷希派的两位军方人员", before.lines.some(l => l.includes("普雷希") && l.includes("两位")));
  check("亚缇娜自报狙击手", before.lines.some(l => l.startsWith("亚缇娜") && l.includes("狙击手")));
  check("玛利亚自报支援兵", before.lines.some(l => l.startsWith("玛利亚") && l.includes("支援兵")));
  const badWords = ["乱交", "派对", "女同", "一夜", "榨", "变态", "轮我", "玩玩", "绿"];
  check("无敏感词残留", !before.lines.some(l => badWords.some(w => l.includes(w))),
    { hit: badWords.filter(w => before.lines.some(l => l.includes(w))) });
  check("完成按钮存在", before.hasBtn === true);

  await page.click("[data-ruins-sand-city-unlock-complete]");
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => {
    const s = window.state;
    const a = s.chars.find(c => c.id === "artina");
    const m = s.chars.find(c => c.id === "maria");
    return {
      unlocked: !!s.flags?.ruinsSandCityUnlocked,
      seen: !!s.flags?.ruinsSandCityUnlockSeen,
      artinaLocked: a?.locked,
      mariaLocked: m?.locked,
      log: (s.log || []).slice(0, 3),
      hallModal: s.hallModal,
    };
  });
  check("点击后 ruinsSandCityUnlocked = true", after.unlocked === true, after);
  check("亚缇娜解锁", after.artinaLocked === false, { locked: after.artinaLocked });
  check("玛利亚解锁", after.mariaLocked === false, { locked: after.mariaLocked });
  check("弹窗关闭", after.hallModal === null, { modal: after.hallModal });
  check("日志含解锁提示", (after.log || []).some(l => /废墟沙城/.test(l)), { log: after.log });

  const failed = results.filter(r => !r.ok);
  console.log(`\n汇总：${results.length - failed.length} 通过 / ${failed.length} 失败`);
  console.log("页面错误:", errors.length ? errors.slice(0, 3) : "none");
  await browser.close();
  process.exit(failed.length ? 1 : 0);
})();
