// 管家手册目标清单核对（浏览器）
// 用《魅魔杀》任务目标的硬编码清单比对运行时数据与手册界面，防止：
//   1. 新增副本 / 首领 / 精英后手册漏项
//   2. 手册显示的数据源被改成别的口径
//   3. 管家署名丢失
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
  return cond ? 1 : 0;
};
const same = (a, b) => {
  const x = [...new Set(a)].sort(), y = [...new Set(b)].sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
};

// ---- 《魅魔杀》任务目标清单 ----
const BOSS_BY_MISSION = {
  machine_factory: ["机械牛头王", "内英组杀手伊迪斯"],
  underwater_train: ["狂鲨海盗团船长莫迪奥", "天鹰突击队队长莫娜"],
  orc_dungeon: ["魔王巴卡尔", "XX型凋零者1124号"],
  ruins_sand_city: ["机械AI龙", "XX型凋零者1312号"],
};
const ELITES = [
  "艾尔拉娜克隆体", "克罗博士", "入侵者橘千樱", "鱼人武士安倍麦克",
  "内英组杀手拉芙", "兽人王邦迪", "特坚组护卫凯丽", "内英组杀手樱羽丽莎",
  "凋零者1124号分裂体", "内英组杀手希尔德", "武装直升机", "装甲运输车",
];
const HEROES = [
  "罗卡尔", "贝丝妲魔偶", "安洁莉卡", "诺诺卡", "艾尔拉娜", "曼妮", "温蒂",
  "芙萝娅", "贝尔蒂丝", "娜娜莉", "洛基", "卡洛斯", "米勒", "杰洛特", "鲁卡",
  "卡迪西斯", "艾斯", "奥菲莉亚", "艾伦格", "格尔达", "星野依", "星野海一",
  "索尼娅", "橘千樱", "亚缇娜", "玛利亚", "小艾尔拉娜", "贝丝妲", "凯瑟琳",
];
const MISSION_NAMES = ["魔国机械工厂", "水下列车", "兽人地下城", "废墟沙城"];
const DIFF_NAMES = ["普通级", "冒险级", "勇士级", "王者级", "英雄级"];
const BUTLER_NAME = "凯瑟琳";

const tab = async (page, id) => {
  await page.locator(`[data-butler-tab='${id}']`).click();
  await page.waitForTimeout(120);
};
const texts = (page, sel) => page.locator(sel).allTextContents();

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await openGame(page);
  await startFreshGame(page);
  // hall 分组（含管家手册模块）是按需加载的，等入口出现后再读数据。
  await page.locator("[data-open-butler]").waitFor({ state: "visible", timeout: 30000 });

  // ============ 一、数据源与清单一致 ============
  const data = await page.evaluate(() => {
    const G = window.GameData || {};
    const groups = {};
    for (const [k, list] of Object.entries(G.enemies || {})) {
      groups[k] = {
        boss: (list || []).filter(e => e.type === "boss").map(e => e.name),
        elite: (list || []).filter(e => e.type === "elite").map(e => e.name),
      };
    }
    return {
      groups,
      missions: (G.missions || []).filter(m => m.kind === "dungeon").map(m => m.name),
      heroes: (G.characters || []).map(c => c.name),
      maxLevel: window.ButlerManualProgress?.MAX_LEVEL || 0,
      butlerName: window.ButlerManualProgress?.BUTLER_NAME || "",
    };
  });

  T("四个副本齐全", same(data.missions, MISSION_NAMES), data.missions);
  for (const [mid, names] of Object.entries(BOSS_BY_MISSION)) {
    T(`[${mid}] 首领与清单一致`, same(data.groups[mid]?.boss || [], names),
      data.groups[mid]?.boss || []);
  }
  const allElite = Object.values(data.groups).flatMap(g => g.elite);
  T("精英共 12 名且与清单一致", allElite.length === 12 && same(allElite, ELITES), allElite);
  T("英雄共 29 名且与清单一致", data.heroes.length === 29 && same(data.heroes, HEROES), data.heroes.length);
  T("满级线为 20 级", data.maxLevel === 20, data.maxLevel);
  T(`管家名为「${BUTLER_NAME}」`, data.butlerName === BUTLER_NAME, data.butlerName);

  // ============ 二、手册界面与清单一致 ============
  await page.locator("[data-open-butler]").click();
  await page.locator(".butler-page").waitFor({ state: "visible" });

  T("立绘 alt 显示管家名",
    (await page.locator(".butler-portrait img").getAttribute("alt")) === BUTLER_NAME);
  T("台词气泡已取消（不再渲染 .butler-bubble / .butler-speaker）",
    (await page.locator(".butler-bubble").count()) === 0
    && (await page.locator(".butler-speaker").count()) === 0);
  const nameHits = await page.locator(`text=${BUTLER_NAME}`).count();
  T("界面仍显示管家名（底部简评）", nameHits >= 1, { nameHits });
  const comment = await page.locator(".butler-comment").textContent();
  T("底部简评带管家署名", (comment || "").startsWith(`${BUTLER_NAME}：`), { comment });

  // 讨伐目标
  await tab(page, "boss");
  const bossGroups = await page.locator(".butler-group h3").allTextContents();
  T("讨伐目标按四个副本分组", same(bossGroups, MISSION_NAMES), bossGroups);
  const bossRows = (await texts(page, ".butler-row b")).map(s => s.trim());
  const wantBoss = Object.values(BOSS_BY_MISSION).flat();
  T("讨伐目标列出全部首领", same(bossRows, wantBoss), bossRows);
  const bossMarks = await page.locator(".butler-row").first().locator(".butler-mark").count();
  T("每名首领有 5 档难度标记", bossMarks === 5, { bossMarks });

  // 精英目标
  await tab(page, "elite");
  const eliteRows = (await texts(page, ".butler-row b")).map(s => s.trim());
  T("精英目标列出 12 名", same(eliteRows, ELITES), eliteRows);

  // 魅魔目标
  await tab(page, "hero");
  const heroNames = (await texts(page, ".butler-hero b")).map(s => s.trim());
  T("魅魔目标列出 29 名", same(heroNames, HEROES), heroNames.length);
  const lv = await page.locator(".butler-hero small").first().textContent();
  T("等级显示为 X/20", /\/\s*20$/.test((lv || "").trim()), { lv });

  // 探索目标
  await tab(page, "explore");
  const exploreRows = (await texts(page, ".butler-row b")).map(s => s.trim());
  const wantExplore = [];
  MISSION_NAMES.forEach(m => DIFF_NAMES.forEach(d => wantExplore.push(`通关${m} - ${d}`)));
  T("探索目标为 4 副本 × 5 难度（20 条）", same(exploreRows, wantExplore), exploreRows.length);

  // ============ 三、记录后点亮 ============
  await page.evaluate(() => {
    const st = window.state, P = window.ButlerManualProgress;
    P.recordBattle(st, ["mechanical_bull_king"], "hell");
    P.recordClear(st, "machine_factory", "normal");
  });
  await tab(page, "boss");
  await tab(page, "explore");
  const doneExplore = await page.locator(".butler-row.all-done").count();
  T("记录通关后探索目标点亮", doneExplore >= 1, { doneExplore });

  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n结果 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
