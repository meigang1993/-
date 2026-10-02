// 管家手册「完成新手引导首战」目标（浏览器，真实 UI 路径）
// 覆盖：
//   1. 探索目标页签新增该条，且排在副本条目之前
//   2. 完成总数同步：explore.total 由 20 变 21，总完成度 pct 随之变化
//   3. 新档未完成 → 真实打完首战并确认奖励后点亮（走 Onboarding.complete 真实入口）
//   4. 跳过引导（skipped）不算完成，避免出现永远打不掉的死目标之外的反向遗漏
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const {openGame, startFreshGame, dismissOpeningStory} = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await openGame(page);
  await startFreshGame(page);
  // 新档会先弹开场剧情（凯瑟琳 × 罗卡尔），看完才能操作大厅 UI。
  await dismissOpeningStory(page);

  // ============ 一、数据源：新档时该条存在且未完成 ============
  console.log("—— 一、数据源（新档） ——");
  const src = await page.evaluate(() => {
    const P = window.ButlerManualProgress;
    const list = P.exploreList(window.state);
    return {
      first: list[0] ? { id: list[0].id, name: list[0].name, tutorial: !!list[0].tutorial, diffs: list[0].diffs } : null,
      len: list.length,
      missionIds: list.filter(m => !m.tutorial).map(m => m.id),
      total: P.overall(window.state).explore.total,
      done: P.overall(window.state).explore.done,
      tutorialDone: P.tutorialDone(window.state),
      onboarding: window.state.flags?.onboarding || null,
    };
  });
  T("探索目标第一条是「完成新手引导首战」",
    src.first && src.first.name === "完成新手引导首战" && src.first.tutorial === true, src.first);
  T("该条只有一档（无难度标记）", src.first && src.first.diffs.length === 1, src.first);
  T("探索目标总数 = 4 副本 ×5 + 1 = 21", src.total === 21, src);
  T("新档时该条未完成", src.tutorialDone === false && src.done === 0, src);
  T("副本条目仍为 4 条", src.missionIds.length === 4, src.missionIds);

  // ============ 二、界面：新档未点亮 ============
  console.log("—— 二、界面（新档未点亮） ——");
  await page.locator("[data-open-butler]").click();
  await page.waitForTimeout(350);
  await page.locator("[data-butler-tab='explore']").click();
  await page.waitForTimeout(250);
  const uiBefore = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".butler-row")];
    return {
      rows: rows.length,
      firstText: rows[0]?.querySelector("b")?.textContent || "",
      firstDone: rows[0]?.classList.contains("all-done") || false,
      doneRows: document.querySelectorAll(".butler-row.all-done").length,
      pct: document.querySelector(".butler-progress span")?.textContent || "",
    };
  });
  T("探索页签共 21 行", uiBefore.rows === 21, uiBefore);
  T("首行为「完成新手引导首战」", uiBefore.firstText === "完成新手引导首战", uiBefore);
  T("新档时首行未点亮", uiBefore.firstDone === false, uiBefore);
  const pctBefore = parseInt((uiBefore.pct.match(/(\d+)%/) || [0, "0"])[1], 10);

  // 关闭手册
  await page.locator("[data-close-butler]").first().click();
  await page.waitForTimeout(250);

  // ============ 三、跳过引导不算完成 ============
  console.log("—— 三、跳过引导不算完成 ——");
  const skipped = await page.evaluate(() => {
    const st = window.state;
    window.Onboarding.skip(st);
    return {
      skipped: !!st.flags?.onboarding?.skipped,
      completed: !!st.flags?.onboarding?.completed,
      tutorialDone: window.ButlerManualProgress.tutorialDone(st),
    };
  });
  T("跳过引导后 skipped 置位", skipped.skipped === true, skipped);
  T("跳过引导不计入完成（completed 仍为 false）",
    skipped.completed === false && skipped.tutorialDone === false, skipped);
  // 还原为新档未完成状态
  await page.evaluate(() => {
    const st = window.state;
    st.flags.onboarding = { version: window.Onboarding.VERSION, step: "hall", completed: false, skipped: false };
  });

  // ============ 四、真实打完首战 → 点亮 ============
  console.log("—— 四、真实打完首战 ——");
  await page.locator("[data-open-modal='team']").click();
  await page.locator(".difficulty-card").first().waitFor({ state: "visible" });
  await page.locator("[data-start='machine_factory'][data-difficulty='normal']").first().click();
  await page.locator(".map-node").first().waitFor({ state: "visible" });
  await page.locator(".onboarding-recommend").first().click();
  await page.locator(".battle-screen").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => !!window.state?.battle);

  await page.evaluate(async () => {
    const state = window.state, battle = state.battle;
    battle.defeatedEnemyIds = battle.enemies.map(e => e.id).filter(Boolean);
    battle.enemies.forEach(e => { e.hp = 0; });
    await window.DungeonNodeRewards.completeBattle(state, true);
    window.render?.();
  });
  await page.waitForFunction(() => window.state?.view === "dungeon", null, { timeout: 25000 });
  await page.waitForTimeout(500);

  const midway = await page.evaluate(() => ({
    tutorialDone: window.ButlerManualProgress.tutorialDone(window.state),
    completed: !!window.state.flags?.onboarding?.completed,
  }));
  T("结算后但奖励未确认时仍未完成（完成点在奖励确认）",
    midway.completed === false && midway.tutorialDone === false, midway);

  await page.locator("[data-reward-confirm]").first().click();
  await page.waitForFunction(() => window.state?.view === "hall", null, { timeout: 25000 });
  await page.waitForTimeout(400);

  const after = await page.evaluate(() => {
    const P = window.ButlerManualProgress;
    const o = P.overall(window.state);
    return {
      completed: !!window.state.flags?.onboarding?.completed,
      tutorialDone: P.tutorialDone(window.state),
      exploreDone: o.explore.done, exploreTotal: o.explore.total, pct: o.pct,
    };
  });
  T("奖励确认后引导完成", after.completed === true, after);
  T("手册认定首战目标已完成", after.tutorialDone === true, after);
  T("完成总数同步（探索 1 / 21）",
    after.exploreDone === 1 && after.exploreTotal === 21, after);

  // ============ 五、界面：已点亮 + 总完成度上升 ============
  console.log("—— 五、界面（打完后点亮） ——");
  // 打完首战回大厅后可能仍叠着弹窗（首战胜利剧情 / 队伍准备面板），
  // 不先清干净的话点手册按钮会被 .villa-modal 拦截。
  await dismissOpeningStory(page);
  if (await page.locator(".villa-modal").count()) {
    await page.evaluate(() => document.querySelector("[data-close-modal]")?.click());
    await page.waitForTimeout(300);
  }
  await page.locator("[data-open-butler]").first().evaluate(el => el.click());
  await page.waitForTimeout(350);
  await page.locator("[data-butler-tab='explore']").click();
  await page.waitForTimeout(250);
  const uiAfter = await page.evaluate(() => {
    const rows = [...document.querySelectorAll(".butler-row")];
    return {
      rows: rows.length,
      firstText: rows[0]?.querySelector("b")?.textContent || "",
      firstDone: rows[0]?.classList.contains("all-done") || false,
      firstBox: rows[0]?.querySelector(".butler-box")?.textContent || "",
      doneRows: document.querySelectorAll(".butler-row.all-done").length,
      pct: document.querySelector(".butler-progress span")?.textContent || "",
      width: document.querySelector(".butler-bar i")?.getAttribute("style") || "",
    };
  });
  T("打完后首行点亮（all-done + ✓）",
    uiAfter.firstDone === true && uiAfter.firstBox === "✓", uiAfter);
  T("探索页签仍为 21 行", uiAfter.rows === 21, uiAfter);
  const pctAfter = parseInt((uiAfter.pct.match(/(\d+)%/) || [0, "0"])[1], 10);
  T(`总完成度同步上升（${pctBefore}% → ${pctAfter}%）`, pctAfter > pctBefore,
    { pctBefore, pctAfter, uiAfter });
  T("进度条宽度与百分比一致", uiAfter.width.includes(`${pctAfter}%`), uiAfter);

  const relevant = errors.filter(t => !/favicon|ResizeObserver loop/.test(t));
  T("页面无 JS 错误", relevant.length === 0, relevant.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("脚本异常:", e.message, e.stack); process.exit(2); });
