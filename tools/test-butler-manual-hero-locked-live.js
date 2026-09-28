// 管家手册「魅魔目标」分母恒为 29 检查（浏览器）
// 需求：未解锁的魅魔也要占位显示灰剪影，分母不能随解锁进度增长。
// 场景：新档（仅 2 名解锁）/ 全解锁 0 级 / 部分满级 / 满级后无灰剪影。
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

const EXPECT_TOTAL = 29;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await openGame(page);
  await startFreshGame(page);
  await page.waitForTimeout(300);

  const openManual = async () => {
    // 手册已打开时先关闭（此时大厅入口不可见）
    if (await page.locator("[data-close-butler]").count()) {
      await page.locator("[data-close-butler]").first().click();
      await page.waitForTimeout(120);
    }
    await page.locator("[data-open-butler]").waitFor({ state: "visible", timeout: 30000 });
    await page.locator("[data-open-butler]").click();
    await page.locator("[data-butler-tab]").first().waitFor({ state: "visible" });
    await page.locator("[data-butler-tab='hero']").click();
    await page.locator(".butler-hero-grid").waitFor({ state: "visible" });
    await page.waitForTimeout(120);
  };
  // 手册已打开时，用切页签触发重渲染（避免关闭后大厅被其他弹窗遮挡）
  const refresh = async () => {
    await page.locator("[data-butler-tab='boss']").click();
    await page.waitForTimeout(120);
    await page.locator("[data-butler-tab='hero']").click();
    await page.locator(".butler-hero-grid").waitFor({ state: "visible" });
    await page.waitForTimeout(120);
  };
  const snapshot = () => page.evaluate(() => {
    const cells = [...document.querySelectorAll(".butler-hero")];
    const P = window.ButlerManualProgress;
    const list = P.heroList(state);
    return {
      list: list.length,
      cells: cells.length,
      locked: cells.filter(c => c.classList.contains("locked")).length,
      maxed: cells.filter(c => c.classList.contains("maxed")).length,
      img: cells.filter(c => c.querySelector("img")).length,
      face: cells.filter(c => c.querySelector("span")).length,
      sum: document.querySelector(".butler-sum")?.textContent?.trim() || "",
      heroes: P.overall(state).heroes,
      unlockedChars: (state.chars || []).filter(c => !c.locked).length,
    };
  });

  // ================= 场景1：新档（大部分未解锁） =================
  console.log("—— 场景1：新档，多数魅魔未解锁 ——");
  await openManual();
  let s = await snapshot();
  console.log(`   ${JSON.stringify(s)}`);
  T(`魅魔目标头像恒为 ${EXPECT_TOTAL} 个`, s.cells === EXPECT_TOTAL, s);
  T(`heroList 长度恒为 ${EXPECT_TOTAL}`, s.list === EXPECT_TOTAL, s);
  T("新档确实存在未解锁魅魔（前置条件）", s.unlockedChars < EXPECT_TOTAL, s);
  T("未解锁的以灰剪影占位（locked 数 = 未解锁数）",
    s.locked === EXPECT_TOTAL - s.unlockedChars, s);
  T("灰剪影用 face 占位而非头像图", s.face === s.locked && s.img === s.unlockedChars, s);
  T(`底部显示「已满级：0 / ${EXPECT_TOTAL}」（分母不随解锁数变化）`,
    s.sum === `已满级：0 / ${EXPECT_TOTAL}`, s);
  T("总览分母为 29", s.heroes.total === EXPECT_TOTAL, s.heroes);

  // ================= 场景2：全解锁但都 0 级 =================
  console.log("—— 场景2：全部解锁、均为 0 级 ——");
  await page.evaluate(() => {
    state.chars = (window.GameData?.characters || []).map(c => ({ id: c.id, level: 0, locked: false }));
  });
  await refresh();
  s = await snapshot();
  console.log(`   ${JSON.stringify(s)}`);
  T(`仍为 ${EXPECT_TOTAL} 个头像`, s.cells === EXPECT_TOTAL, s);
  T("无灰剪影（全部已解锁）", s.locked === 0, s);
  T("全部显示头像图", s.img === EXPECT_TOTAL && s.face === 0, s);
  T("0 个满级", s.maxed === 0, s);
  T(`底部为「已满级：0 / ${EXPECT_TOTAL}」`, s.sum === `已满级：0 / ${EXPECT_TOTAL}`, s);

  // ================= 场景3：部分满级 =================
  console.log("—— 场景3：3 名满级 ——");
  await page.evaluate(() => {
    state.chars = (window.GameData?.characters || []).map((c, i) => ({ id: c.id, level: i < 3 ? 20 : 5, locked: false }));
  });
  await refresh();
  s = await snapshot();
  console.log(`   ${JSON.stringify(s)}`);
  T("满级 3 个", s.maxed === 3, s);
  T("总览 done = 3", s.heroes.done === 3, s.heroes);
  T(`底部为「已满级：3 / ${EXPECT_TOTAL}」`, s.sum === `已满级：3 / ${EXPECT_TOTAL}`, s);

  // ================= 场景4：全满级后无灰剪影 =================
  console.log("—— 场景4：全部满级 ——");
  await page.evaluate(() => {
    state.chars = (window.GameData?.characters || []).map(c => ({ id: c.id, level: 20, locked: false }));
  });
  await refresh();
  s = await snapshot();
  console.log(`   ${JSON.stringify(s)}`);
  T("全部亮起", s.maxed === EXPECT_TOTAL, s);
  T("无灰剪影", s.locked === 0, s);
  T(`底部为「已满级：${EXPECT_TOTAL} / ${EXPECT_TOTAL}」`, s.sum === `已满级：${EXPECT_TOTAL} / ${EXPECT_TOTAL}`, s);

  // ================= 场景5：存档 chars 不完整 =================
  // 加固点：分母由角色模板决定，即便存档只留了已解锁角色，也要补出 29 个占位
  console.log("—— 场景5：存档只含 2 名已解锁角色 ——");
  await page.evaluate(() => {
    state.chars = (window.GameData?.characters || []).slice(0, 2).map(c => ({ id: c.id, level: 20, locked: false }));
  });
  await refresh();
  s = await snapshot();
  console.log(`   ${JSON.stringify(s)}`);
  T(`存档不完整时仍为 ${EXPECT_TOTAL} 个头像（27 个灰剪影补齐）`, s.cells === EXPECT_TOTAL, s);
  T("灰剪影数为 27", s.locked === EXPECT_TOTAL - 2, s);
  T("已解锁的 2 名仍计满级", s.maxed === 2, s);
  T(`底部仍为「已满级：2 / ${EXPECT_TOTAL}」`, s.sum === `已满级：2 / ${EXPECT_TOTAL}`, s);

  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n结果 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
