// 实战：10月16日公告渲染 + 普雷希「女王榨取」技能立绘接图
//
// 目的（上一轮未完成的收尾）：
//   1) 更新公告弹窗首期确实是 2026-10-16，且两条内容都在；
//   2) 女王榨取的技能立绘真的加载出来（此前缺图会退回通用兜底图）。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

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
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);

  console.log("\n【一】更新公告：首期为 2026-10-16");
  await page.locator('[data-open-modal="updates"]').click();
  await page.waitForTimeout(600);
  const notice = await page.evaluate(() => {
    const modal = document.querySelector(".modal, .modal-card, [data-modal]");
    const root = modal || document;
    const sections = Array.from(root.querySelectorAll("section, .update-section, article"));
    const firstDt = root.querySelector("[datetime]")?.getAttribute("datetime") || "";
    const text = (root.textContent || "").replace(/\s+/g, " ");
    return {
      firstDt,
      text: text.slice(0, 1200),
      has1016: /2026年10月16日|2026\.10\.16/.test(text),
      has1015: /2026年10月15日/.test(text),
      topics: {
        queen: /女王榨取/.test(text),
        beast: /快速装弹/.test(text),
        preshi: /普雷希/.test(text),
      },
      len: text.length,
    };
  });
  check("首期日期为 2026-10-16", notice.firstDt === "2026-10-16",
    `datetime=${notice.firstDt}`);
  check("页面含 10月16日 且不含 10月15日作为首期", notice.has1016, `has1016=${notice.has1016}`);
  check("公告含「女王榨取」立绘条目", notice.topics.queen, JSON.stringify(notice.topics));
  check("公告含「快速装弹」删除条目", notice.topics.beast, JSON.stringify(notice.topics));
  check("公告文本长度合理（非空壳）", notice.len > 200, `len=${notice.len}`);

  console.log("\n【二】女王榨取技能立绘真的能加载");
  const art = await page.evaluate(async () => {
    // CardArt 只暴露 className / fallbackUrl / isSkill / url(card)，
    // 用 url() 取技能立绘，并和兜底图比对以证明不是退回通用图。
    // 真实技能卡由 battle-combat-targeting 组装：_skill + skillName
    const card = { name: "女王榨取", type: "tactic", _skill: true, skillName: "女王榨取" };
    const url = window.CardArt?.url?.(card) || null;
    const fallback = window.CardArt?.fallbackUrl || null;
    const load = src => new Promise(res => {
      const im = new Image();
      im.onload = () => res({ ok: true, w: im.naturalWidth, h: im.naturalHeight });
      im.onerror = () => res({ ok: false, w: 0, h: 0 });
      im.src = src;
    });
    return {
      url, fallback,
      isSkill: !!window.CardArt?.isSkill?.(card),
      res: url ? await load(url) : null,
      fallbackRes: fallback ? await load(fallback) : null,
    };
  });
  check("技能立绘映射存在", !!art.url, `url=${art.url}`);
  check("未被判为普通牌（isSkill）", art.isSkill === true, `isSkill=${art.isSkill}`);
  check("未退回通用兜底图", !!art.url && art.url !== art.fallback,
    `url=${art.url} fallback=${art.fallback}`);
  check("立绘加载成功且尺寸正常（非兜底/非破图）",
    !!art.res?.ok && art.res.w > 0 && art.res.h > 0,
    JSON.stringify(art.res));

  console.log(`\n合计 ${pass} 通过 / ${fail} 失败   页面错误 ${errors.length}`);
  if (errors.length) console.log("页面错误:", errors.slice(0, 3));
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
