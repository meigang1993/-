// 天日国鹰7研究所 · devLocked 存档恢复真实浏览器验证
// 注入未开放副本的 run，走真实迁移层 / 渲染层 / 结算层，确认回大厅且不发奖。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);

  const probe = await page.evaluate(() => {
    const S = typeof state !== "undefined" ? state : window.state;
    const mission = GameData.missions.find(m => m.id === "tenri_institute");
    const clone = id => ({
      missionId: id, difficultyId: "adventure", complete: false, focusId: "probe1",
      layers: [[{ id: "n1", type: "normal", layer: 1, next: ["n2"] }],
        [{ id: "n2", type: "boss", layer: 2, next: [] }]],
      current: "n1", pending: null, party: [], activeParty: [],
    });
    const out = {};
    out.devLocked = mission?.devLocked === true && mission?.devHint === "未开发完成";

    // 迁移层：真实模块函数
    S.view = "dungeon"; S.explore = clone("tenri_institute"); S.battle = null;
    window.StoreRunMigrations.recoverBrokenDungeonState(S);
    out.migrationCleared = S.explore === null && S.view === "hall";

    // 渲染层：真实全局函数
    S.view = "dungeon"; S.explore = clone("tenri_institute"); S.battle = null;
    ensureRenderableView();
    out.renderCleared = S.explore === null && S.view === "hall";

    // 正常副本不误伤
    S.view = "dungeon"; S.explore = clone("ruins_sand_city"); S.battle = null;
    window.StoreRunMigrations.recoverBrokenDungeonState(S);
    out.normalKept = S.explore !== null && S.view === "dungeon";
    S.view = "dungeon"; S.explore = clone("ruins_sand_city"); S.battle = null;
    ensureRenderableView();
    out.normalKeptRender = S.explore !== null && S.view === "dungeon";

    // 结算层：真实模块拒绝发奖
    const rejected = window.LocalCoreUtils.outcomes.rejected;
    out.settleRejected = window.LocalCoreDungeonOps.settleDungeon(
      {}, { run: clone("tenri_institute"), nodeId: "n1" }) === rejected;

    // 回到干净大厅并渲染
    S.view = "hall"; S.explore = null; S.battle = null;
    window.render?.();
    out.hallVisible = !!document.querySelector("[data-open-butler]");
    out.noDungeonMap = !document.querySelector(".dungeon-map, .dungeon-screen");
    return out;
  });

  T("副本定义 devLocked / 提示未开发完成", probe.devLocked, probe);
  T("真实迁移层把 devLocked run 清回大厅", probe.migrationCleared, probe);
  T("真实渲染层把 devLocked run 清回大厅", probe.renderCleared, probe);
  T("真实迁移层不误清废墟沙城 run", probe.normalKept, probe);
  T("真实渲染层不误清废墟沙城 run", probe.normalKeptRender, probe);
  T("真实结算层拒绝 devLocked run 发奖", probe.settleRejected, probe);
  T("恢复后仍是可操作大厅", probe.hallVisible, probe);
  T("页面不残留副本地图", probe.noDungeonMap, probe);
  T("全程无 JS 页面错误", errors.length === 0, errors.slice(0, 3));

  await browser.close();
  console.log(`\n天日国 devLocked 存档恢复实机 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error(err); process.exit(2); });
