// 实战：全部解锁/剧情事件改为 ADV 对话框后的行为检查
// 检查：一次只显示一句、说话者立绘高亮其余压暗、点击/空格推进、上一句、跳到结尾才出现解锁按钮。
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

// villa.js 的 modal 映射里全部 17 个剧情/解锁事件
const EVENTS = [
  "firstDefeat", "secondDefeat", "millerUnlock", "gerlotUnlock", "cadicisUnlock",
  "lukaUnlock", "littleElranaUnlock", "aceUnlock", "underwaterTrainUnlock",
  "opheliaUnlock", "bestaNurseryUnlock", "orcDungeonUnlock", "soniaNurseryUnlock",
  "chiyoRecruitUnlock", "gerdaNurseryUnlock", "hoshinoFamilyUnlock",
  "ruinsSandCityUnlock",
];

const openModal = async (page, modal) => {
  await page.evaluate(m => {
    const s = window.state;
    s.view = "hall"; s.battle = null; s.explore = null; s.hallModal = m; s.adv = null;
    window.render?.();
  }, modal);
  await page.waitForSelector(".adv-box", { timeout: 5000 });
  await page.waitForTimeout(120);
};

const snapshot = page => page.evaluate(() => {
  const q = s => document.querySelector(s);
  const speaking = [...document.querySelectorAll(".portrait.is-speaking")];
  const muted = [...document.querySelectorAll(".portrait.is-muted")];
  const box = q(".adv-box");
  const card = q(".modal-card");
  return {
    textCount: document.querySelectorAll(".adv-text").length,
    text: q(".adv-text")?.textContent || "",
    name: q(".adv-name")?.textContent || "",
    progress: q(".adv-progress")?.textContent?.trim() || "",
    portraits: document.querySelectorAll(".adv-stage .portrait").length,
    speakingNames: speaking.map(el => el.dataset.artName || el.textContent.trim()),
    mutedCount: muted.length,
    hasNext: !!q("[data-adv-next]"),
    hasPrev: !!q("[data-adv-prev]"),
    prevDisabled: q("[data-adv-prev]")?.disabled ?? null,
    hasSkip: !!q("[data-adv-skip]"),
    completeAttr: (document.querySelector(".first-defeat-event .actions button")?.outerHTML.match(/data-([a-z-]+-complete)/) || [])[1] || null,
    // 对话框与弹窗都不应需要滚动
    boxScroll: box ? box.scrollHeight - box.clientHeight : 0,
    cardScroll: card ? card.scrollHeight - card.clientHeight : 0,
  };
});

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  await openGame(page);
  await startFreshGame(page);
  await page.waitForTimeout(400);

  // —— 1. 全部 17 个事件：ADV 结构、推进、结尾按钮 ——
  const totals = {};
  for (const modal of EVENTS) {
    await openModal(page, modal);
    const first = await snapshot(page);
    T(`${modal}：首屏只显示一句`, first.textCount === 1 && first.text.length > 0, first);
    T(`${modal}：有登场立绘`, first.portraits >= 1, { n: first.portraits });

    await page.click("[data-adv-next]");
    await page.waitForTimeout(120);
    const second = await snapshot(page);
    T(`${modal}：点继续后换到下一句`, second.text !== first.text || second.progress !== first.progress,
      { before: first.progress, after: second.progress });

    await page.click("[data-adv-skip]");
    await page.waitForTimeout(150);
    const last = await snapshot(page);
    T(`${modal}：结尾出现解锁按钮`, !!last.completeAttr, { attr: last.completeAttr });
    T(`${modal}：结尾不再显示继续按钮`, last.hasNext === false);
    const m = /(\d+)\s*\/\s*(\d+)/.exec(last.progress || first.progress || "");
    const totalLines = await page.evaluate(() => window.state.adv?.total || 0);
    totals[modal] = totalLines;
    T(`${modal}：进度走完`, totalLines > 0 && (!m || Number(m[2]) === totalLines), { total: totalLines });
    T(`${modal}：对话框无需滚动`, last.boxScroll === 0 && last.cardScroll === 0,
      { boxScroll: last.boxScroll, cardScroll: last.cardScroll });
  }
  T("17 个事件全部覆盖", Object.keys(totals).length === 17, { n: Object.keys(totals).length });

  // —— 2. 废墟沙城（15 句，最长）：逐句、高亮、多种推进方式 ——
  await openModal(page, "ruinsSandCityUnlock");
  const s0 = await snapshot(page);
  T("废墟沙城：15 句", await page.evaluate(() => window.state.adv?.total) === 15,
    { total: await page.evaluate(() => window.state.adv?.total) });
  T("废墟沙城：首句说话者高亮 = 贝丝妲",
    s0.speakingNames.length === 1 && s0.speakingNames[0] === "贝丝妲", s0.speakingNames);
  T("废墟沙城：非说话者压暗（4 人中有 3 人 is-muted）", s0.mutedCount === 3,
    { muted: s0.mutedCount, portraits: s0.portraits });
  T("废墟沙城：进度显示 1 / 15", s0.progress === "1 / 15", { p: s0.progress });
  T("废墟沙城：首句上一句按钮禁用", s0.prevDisabled === true, { d: s0.prevDisabled });

  // 点击对话框推进
  await page.click(".adv-box");
  await page.waitForTimeout(120);
  const s1 = await snapshot(page);
  T("点击对话框推进到 2 / 15", s1.progress === "2 / 15", { p: s1.progress });

  // 空格推进
  await page.keyboard.press("Space");
  await page.waitForTimeout(120);
  const s2 = await snapshot(page);
  T("空格推进到 3 / 15", s2.progress === "3 / 15", { p: s2.progress });

  // 上一句
  await page.click("[data-adv-prev]");
  await page.waitForTimeout(120);
  const s3 = await snapshot(page);
  T("上一句回到 2 / 15", s3.progress === "2 / 15", { p: s3.progress });

  // 遍历全部句子，确认说话者都有对应立绘、台词不重复缺失
  const walk = await page.evaluate(async () => {
    const out = [];
    const total = window.state.adv.total;
    window.state.adv.index = 0;
    for (let i = 0; i < total; i++) {
      window.state.adv.index = i;
      window.render?.();
      await new Promise(r => setTimeout(r, 30));
      const speaking = [...document.querySelectorAll(".portrait.is-speaking")]
        .map(el => el.dataset.artName || "");
      out.push({
        name: document.querySelector(".adv-name")?.textContent || "",
        text: (document.querySelector(".adv-text")?.textContent || "").length,
        speaking,
      });
    }
    return out;
  });
  T("废墟沙城：15 句全部有台词", walk.length === 15 && walk.every(l => l.text > 0),
    { n: walk.length, empty: walk.filter(l => !l.text).length });
  T("废墟沙城：每句说话者都对应到唯一高亮立绘",
    walk.every(l => l.speaking.length === 1 && l.speaking[0] === l.name),
    { bad: walk.filter(l => l.speaking[0] !== l.name).map(l => l.name) });
  T("废墟沙城：末句是罗卡尔/贝丝妲收尾",
    ["贝丝妲"].includes(walk[walk.length - 1].name), { last: walk[walk.length - 1].name });

  // 事件之间互不串台
  await openModal(page, "gerdaNurseryUnlock");
  const g0 = await snapshot(page);
  T("切换事件后进度归零（不串台）", g0.progress === "1 / 4", { p: g0.progress });

  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));
  await browser.close();
  console.log(`\n结果：${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
