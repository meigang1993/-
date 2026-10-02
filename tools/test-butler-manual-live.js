// 管家手册 · 界面回归
//   大厅入口 → 打开手册 → 四个页签渲染与切换 → 立绘加载 → 进度条与台词 → 关闭回大厅
//   另含数据层断言：成果记录、老档回填、总完成度计算
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

const openManual = async page => {
  // 开场剧情弹窗会挡住入口按钮；页面持续 re-render 时 locator.click() 的
  // actionability 检查也会误判，故用 DOM click 并自行等待面板出现。
  await page.evaluate(() => {
    const btn = document.querySelector("[data-open-butler]");
    if (btn) btn.click();
  });
  await page.locator(".butler-page").waitFor({ state: "visible" });
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);

  // 1. 入口按钮存在且可见
  T("大厅侧边栏有「管家手册」入口", await page.locator("[data-open-butler]").isVisible());

  // 2. 打开手册
  await openManual(page);
  T("点击后打开管家手册", await page.locator(".butler-page").isVisible());
  T("标题为「管家手册」", (await page.locator(".butler-top h2").textContent()).trim() === "管家手册");

  // 3. 立绘真实加载（非 404）
  // 立绘是 lazy 加载，等它真正解码完成再断言（否则会读到 complete:false/naturalWidth:0）
  await page.waitForFunction(() => {
    const el = document.querySelector(".butler-portrait img");
    return !!el && el.complete && el.naturalWidth > 0;
  }, null, { timeout: 15000 }).catch(() => {});
  const img = await page.locator(".butler-portrait img").evaluate(el => ({
    src: el.getAttribute("src"), complete: el.complete, w: el.naturalWidth, h: el.naturalHeight,
  }));
  T("管家立绘已加载", img.complete && img.w > 0 && img.h > 0, img);
  T("立绘路径指向 assets", /assets\/images\/butler-portrait/.test(img.src || ""), img);

  // 4b. 布局：立绘在任务列表右侧，且渲染尺寸明显放大
  const layout = await page.evaluate(() => {
    const box = el => {
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    };
    return {
      list: box(document.querySelector(".butler-list")),
      main: box(document.querySelector(".butler-right")),
      art: box(document.querySelector(".butler-portrait img")),
      aside: box(document.querySelector(".butler-left")),
    };
  });
  T("立绘位于任务列表右侧",
    !!layout.list && !!layout.art && layout.art.x >= layout.list.x + layout.list.w - 40, layout);
  T("立绘渲染尺寸放大（短边 ≥ 240px）",
    !!layout.art && Math.min(layout.art.w, layout.art.h) >= 240, layout);
  T("立绘区与列表区同高（占满可用高度）",
    !!layout.aside && !!layout.main && Math.abs(layout.aside.h - layout.main.h) <= 8, layout);

  // 4. 四个页签
  const tabs = await page.locator("[data-butler-tab]").allTextContents();
  T("四个页签齐全", JSON.stringify(tabs) === JSON.stringify(["讨伐目标", "精英目标", "魅魔目标", "探索目标"]), tabs);
  T("默认选中讨伐目标", await page.locator("[data-butler-tab='boss'].on").isVisible());

  // 5. 页签切换
  await page.locator("[data-butler-tab='hero']").click();
  await page.locator(".butler-hero-grid").waitFor({ state: "visible" });
  const heroCount = await page.locator(".butler-hero").count();
  T("魅魔目标列出 30 名角色", heroCount === 30, { heroCount });
  const sum = await page.locator(".butler-sum").textContent();
  T("显示已满级统计", /已满级：\d+ \/ 30/.test(sum || ""), { sum });

  await page.locator("[data-butler-tab='explore']").click();
  await page.waitForTimeout(120);
  const exploreRows = await page.locator(".butler-group").count();
  // 4 个副本 + 1 个「新手引导」组（完成新手引导首战，单独成组）
  T("探索目标列出 4 个副本 + 1 个新手引导组", exploreRows === 5, { exploreRows });

  await page.locator("[data-butler-tab='elite']").click();
  await page.waitForTimeout(120);
  const eliteGroups = await page.locator(".butler-group").count();
  T("精英目标按副本分组", eliteGroups >= 4, { eliteGroups });

  await page.locator("[data-butler-tab='boss']").click();
  await page.waitForTimeout(120);
  const bossMarks = await page.locator(".butler-mark").count();
  T("讨伐目标列出难度标记（每首领 5 档）", bossMarks > 0 && bossMarks % 5 === 0, { bossMarks });

  // 6. 新档完成度为 0，台词为最低档
  const pct0 = await page.locator(".butler-progress span").textContent();
  T("新档总完成度为 0%", /0%/.test(pct0 || ""), { pct0 });
  T("台词气泡已取消（不再渲染）", await page.locator(".butler-bubble").count() === 0);

  // 7. 数据层：记录成果后完成度与台词随之变化
  const after = await page.evaluate(() => {
    const st = window.state, P = window.ButlerManualProgress;
    P.recordBattle(st, ["mechanical_bull_king", "pursuer_edis"], "normal");
    P.recordClear(st, "machine_factory", "normal");
    st.butlerTab = "boss";
    window.render();
    return { pct: P.overall(st).pct, line: P.line(st), feats: P.feats(st).length };
  });
  T("记录战斗成果后 feats 增加", after.feats === 3, after);
  T("总完成度随之上升", after.pct > 0, after);
  T("台词数据层仍按进度分档（低档）", (after.line || "").includes("深渊的目标"), after);
  await page.waitForTimeout(150);
  const pct1 = await page.locator(".butler-progress span").textContent();
  T("进度条文案同步更新", pct1 === `总完成度：${after.pct}%`, { pct1, expect: after.pct });
  const barWidth = await page.locator(".butler-bar i").evaluate(el => el.style.width);
  T("进度条宽度与百分比一致", barWidth === `${after.pct}%`, { barWidth });

  // 7b. 填满全部目标后应切换到高档台词
  const full = await page.evaluate(() => {
    const st = window.state, P = window.ButlerManualProgress;
    st.butlerFeats = [];
    P.missions().forEach(m => {
      ["boss", "elite"].forEach(kind => P.enemiesOf(m.id, kind)
        .forEach(e => P.DIFFS.forEach(d => P.record(st, kind, e.id, d))));
      P.DIFFS.forEach(d => P.record(st, "clear", m.id, d));
    });
    st.chars.forEach(c => { c.level = 20; });
    window.render();
    return { pct: P.overall(st).pct, line: P.line(st), comment: P.comment(st) };
  });
  T("全部达成后完成度接近满值", full.pct >= 90, full);
  T("高进度台词数据层切换为赞赏", (full.line || "").includes("您比我想象的更有趣"), full);
  T("高进度底部简评切换", (full.comment || "").includes("所剩无几"), full);
  await page.waitForTimeout(150);
  T("高进度下仍不渲染台词气泡", await page.locator(".butler-bubble").count() === 0);

  // 8. 打勾显示
  const doneMarks = await page.locator(".butler-mark.done").count();
  T("已完成的难度标记点亮", doneMarks > 0, { doneMarks });

  // 9. 老档回填：defeatedElites 视为普通级已完成
  const legacy = await page.evaluate(() => {
    const st = window.state, P = window.ButlerManualProgress;
    st.butlerFeats = [];
    st.defeatedElites = ["mechanical_bull_king"];
    const diffs = P.doneDiffs(st, "boss", "mechanical_bull_king");
    // 该 id 会联动触发橘千樱招募解锁弹窗，测完立刻还原，避免污染后续步骤。
    st.defeatedElites = [];
    st.hallModal = null;
    window.render();
    return diffs;
  });
  T("老档 defeatedElites 回填为普通级", JSON.stringify(legacy) === JSON.stringify(["normal"]), { legacy });

  // 10. 关闭回大厅
  await page.locator(".butler-back").click();
  await page.locator(".villa-hall").waitFor({ state: "visible" });
  T("点「返回别墅」回到大厅", await page.locator(".villa-hall").isVisible());
  T("关闭后手册不再显示", await page.locator(".butler-page").count() === 0);

  // 11. ESC 关闭
  const hallModalNow = await page.evaluate(() => window.state.hallModal || null);
  T("关闭后 hallModal 为空", !hallModalNow, { hallModalNow });
  await openManual(page);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  T("ESC 可关闭手册", await page.locator(".butler-page").count() === 0);

  // 12. 瞬时 UI 字段不写入存档
  T("butlerManual 属瞬时 UI 字段（存档剥离）", await page.evaluate(() => {
    const data = window.GameStoreCompact.stripTransientUiState(JSON.parse(JSON.stringify(window.state)));
    return !("butlerManual" in data) && !("butlerTab" in data);
  }));

  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n结果 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
