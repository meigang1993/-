// 实战：更新公告渲染（日期以数据源为准）+ 普雷希「女王榨取」技能立绘接图
//
// 目的：
//   1) 公告弹窗首期 datetime / 标题日期与 UpdateNotice.latestDate() 一致，
//      且本期新角色与两件重做饰品条目都在；
//   2) 技能牌图已全部删除：技能牌不再解析任何卡图，出牌区不显示技能牌，
//      卡牌图案（card-art-*.webp）仍正常加载。
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

  console.log("\n【一】更新公告：首期与数据源一致");
  await page.locator('[data-open-modal="updates"]').click();
  await page.waitForTimeout(600);
  const notice = await page.evaluate(() => {
    const modal = document.querySelector(".modal, .modal-card, [data-modal]");
    const root = modal || document;
    const sections = Array.from(root.querySelectorAll("section, .update-section, article"));
    const firstDt = root.querySelector("[datetime]")?.getAttribute("datetime") || "";
    const text = (root.textContent || "").replace(/\s+/g, " ");
    // 首期标题不再写死日期：以数据源为准，避免每次改公告就要改测试。
    const src = window.UpdateNotice?.latestDate?.() || {};
    const firstTitle = (window.UpdateNoticeRecent?.[0]?.title || "");
    return {
      firstDt,
      srcIso: src.iso || "",
      srcLabel: src.label || "",
      firstTitle,
      // 公告正文较长，新一期插到首位后旧条目会整体后移，截取长度需覆盖全部期次。
      text: text.slice(0, 20000),
      // 首期标题的日期段不写死月份，一律以数据源 label 为准。
      firstTitleOnPage: new RegExp(
        String(src.label || "__none__").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
        + "\\s*·\\s*今日更新").test(text),
      hasLatestIso: new RegExp(src.iso || "__none__").test(firstDt),
      topics: {
        queen: /女王榨取/.test(text),
        beast: /快速装弹/.test(text),
        preshi: /普雷希/.test(text),
        noa: /怪面诺亚/.test(text),
        charm: /淫气改造/.test(text),
        gaianis: /盖亚妮丝护符/.test(text),
        eagle: /圣鹰剑/.test(text),
      },
      len: text.length,
    };
  });
  check("首期 datetime 与数据源 iso 一致", notice.firstDt === notice.srcIso,
    `datetime=${notice.firstDt} src=${notice.srcIso}`);
  check("页面含数据源日期文案", notice.hasLatestIso, `src=${notice.srcIso}`);
  check("首期标题形如「2026年10月X日 · 今日更新」", notice.firstTitleOnPage,
    `firstTitle=${notice.firstTitle}`);
  check("公告含「女王榨取」立绘条目", notice.topics.queen, JSON.stringify(notice.topics));
  check("公告含「快速装弹」删除条目", notice.topics.beast, JSON.stringify(notice.topics));
  check("本期公告含新角色【怪面诺亚】", notice.topics.noa, JSON.stringify(notice.topics));
  check("本期公告含【淫气改造】", notice.topics.charm, JSON.stringify(notice.topics));
  check("本期公告含重做饰品【盖亚妮丝护符】", notice.topics.gaianis, JSON.stringify(notice.topics));
  check("本期公告含重做饰品【圣鹰剑】", notice.topics.eagle, JSON.stringify(notice.topics));
  check("公告文本长度合理（非空壳）", notice.len > 200, `len=${notice.len}`);

  console.log("\n【二】技能牌图已删除，出牌区不显示技能牌");
  const art = await page.evaluate(async () => {
    const card = { name: "女王榨取", type: "tactic", _skill: true, skillName: "女王榨取" };
    const url = window.CardArt?.url?.(card) ?? "MISSING";
    const fallback = window.CardArt?.fallbackUrl?.(card) ?? "MISSING";
    const normal = { name: "杀", type: "slash" };
    const load = src => new Promise(res => {
      const im = new Image();
      im.onload = () => res({ ok: true, w: im.naturalWidth });
      im.onerror = () => res({ ok: false, w: 0 });
      im.src = src;
    });
    return {
      url, fallback,
      isSkill: !!window.CardArt?.isSkill?.(card),
      normalUrl: window.CardArt?.url?.(normal) || "",
      normalRes: await load(window.CardArt?.url?.(normal) || ""),
      skillArtImgs: Array.from(document.querySelectorAll("img[src*=skill-art]")).length,
      skillTrails: Array.from(document.querySelectorAll(".card-trail"))
        .filter(t => /技能/.test(t.textContent || "")).length,
    };
  });
  check("技能牌不再解析任何卡图（url 为空串）", art.url === "", `url=${art.url}`);
  check("仍被正确识别为技能牌（数据层不变）", art.isSkill === true, `isSkill=${art.isSkill}`);
  check("技能牌也不再走卡牌兜底图（fallbackUrl 为空串）", art.fallback === "", `fallback=${art.fallback}`);
  check("普通卡牌图案仍正常加载（未误删 card-art）",
    /card-art-/.test(art.normalUrl) && art.normalRes.ok && art.normalRes.w > 0,
    JSON.stringify({ url: art.normalUrl, res: art.normalRes }));
  check("页面无 skill-art 图片请求 / 出牌区无技能牌条目",
    art.skillArtImgs === 0 && art.skillTrails === 0,
    JSON.stringify({ imgs: art.skillArtImgs, trails: art.skillTrails }));

  console.log(`\n合计 ${pass} 通过 / ${fail} 失败   页面错误 ${errors.length}`);
  if (errors.length) console.log("页面错误:", errors.slice(0, 3));
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
