// 严格检查：17 个剧情/解锁事件里，每一句台词的「说话人」都必须在登场立绘里有对应项，
// 且该立绘有真实图片文件。缺失表现为：台词能播，但立绘区没人高亮、观众看不出是谁在说。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!cond;
};

const MODALS = [
  "firstDefeat", "secondDefeat", "millerUnlock", "gerlotUnlock", "cadicisUnlock",
  "lukaUnlock", "littleElranaUnlock", "aceUnlock", "underwaterTrainUnlock",
  "opheliaUnlock", "bestaNurseryUnlock", "orcDungeonUnlock", "soniaNurseryUnlock",
  "chiyoRecruitUnlock", "gerdaNurseryUnlock", "hoshinoFamilyUnlock", "ruinsSandCityUnlock",
];

const open = (page, modal) => page.evaluate((modal) => {
  const s = window.state;
  s.chars.forEach(c => { c.locked = false; });   // 全部解锁：登场立绘不因未解锁而缺失
  s.flags = {}; s.adv = null; s.hallModal = modal; s.battle = null; s.explore = null; s.view = "hall";
  window.render?.();
  return !!document.querySelector(".adv-box");
}, modal);

// 逐句渲染：靠 state.adv.index 驱动 cursor()，读出每句的说话人与立绘状态
const walk = (page) => page.evaluate(() => {
  const s = window.state;
  const total = s.adv?.total || 0, key = s.adv?.key || "";
  const lines = [];
  for (let i = 0; i < total; i++) {
    s.adv = { key, index: i, total };
    window.render?.();
    const box = document.querySelector(".adv-box");
    const portraits = [...document.querySelectorAll(".portrait")].map(p => ({
      name: p.getAttribute("data-art-name") || p.textContent.trim(),
      art: p.getAttribute("data-art-src") || "",
      speaking: p.classList.contains("is-speaking"),
    }));
    lines.push({
      i,
      speaker: document.querySelector(".adv-name")?.textContent || "",
      text: (document.querySelector(".adv-text")?.textContent || "").slice(0, 12),
      portraits,
    });
    if (!box) return { error: "no adv-box at " + i, lines };
  }
  return { lines, total };
});

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await openGame(page);
  await startFreshGame(page);
  await page.waitForTimeout(400);

  const missingArt = new Set();
  for (const modal of MODALS) {
    const opened = await open(page, modal);
    T(`${modal}：弹窗渲染出 ADV 对话框`, opened, { opened });
    if (!opened) continue;
    const { lines, total: n, error } = await walk(page);
    T(`${modal}：逐句渲染无中断`, !error && Array.isArray(lines) && lines.length > 0, { error, n });

    const cast = lines[0]?.portraits || [];
    const castNames = cast.map(p => p.name);
    // 断言 1：登场立绘都有真实图片（否则退化成首字母方块）
    cast.forEach(p => {
      T(`${modal}：登场项「${p.name}」有立绘`, !!p.art, { name: p.name });
      if (p.art) missingArt.add(p.art);
    });
    // 断言 2：每一句台词的说话人都在登场项里有同名立绘，且该句确实高亮
    lines.forEach(l => {
      const hit = l.portraits.find(p => p.name === l.speaker);
      T(`${modal}：第${l.i + 1}句「${l.speaker}」有对应立绘`, !!hit,
        { speaker: l.speaker, cast: castNames, text: l.text });
      T(`${modal}：第${l.i + 1}句「${l.speaker}」立绘高亮`, !!hit && hit.speaking,
        { speaker: l.speaker, speaking: l.portraits.filter(p => p.speaking).map(p => p.name) });
    });
  }

  // 断言 3：所有引用到的立绘文件在 publish 下真实存在
  const root = path.join(__dirname, "..", "publish");
  for (const art of missingArt) {
    const rel = art.replace(/^\.\//, "");
    const file = path.join(root, rel);
    T(`立绘文件存在：${rel}`, fs.existsSync(file), { file });
  }

  T("无页面 JS 错误", errors.length === 0, errors.slice(0, 3));
  console.log(`\n立绘覆盖检查：${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
