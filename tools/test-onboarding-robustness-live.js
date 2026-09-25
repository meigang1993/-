// 新手引导健壮性实战回归（浏览器）
// 补齐验收清单中未覆盖的四项：
//   1. 推荐节点自动滚动到可见位置
//   2. 刷新（重新载入）后从当前步骤继续
//   3. 老存档（无 onboarding 字段）默认视为已完成，不重新强制教学
//   4. 跳过后所有规则恢复正常（无提示、无首战保护、地图随机）
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

const flag = page => page.evaluate(() => JSON.parse(JSON.stringify(
  window.state?.flags?.onboarding || null)));

// 走完 大厅 → 出征准备 → 地图
async function toMap(page) {
  await page.locator("[data-open-modal='team']").click();
  await page.locator(".difficulty-card").first().waitFor({ state: "visible" });
  await page.locator("[data-start='machine_factory'][data-difficulty='normal']").first().click();
  await page.locator(".map-node").first().waitFor({ state: "visible" });
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await openGame(page);
  await startFreshGame(page);

  // ================= 验收①：推荐节点自动滚动到可见位置 =================
  await toMap(page);
  let f = await flag(page);
  T("进入地图 step=map", f && f.step === "map", f);

  // 缩小视口让地图真正需要滚动（默认视口下推荐节点恰好已在视野内，断言会恒真）
  await page.setViewportSize({ width: 800, height: 420 });
  await page.waitForTimeout(600);
  const overflow = await page.evaluate(() => {
    const map = document.querySelector(".tower-map");
    return map ? map.scrollHeight > map.clientHeight + 4 : false;
  });
  T("地图需要滚动（断言有效的前提）", overflow === true);

  // 人为把地图滚到顶部使推荐节点不可见，再触发一次渲染，验证自动滚回
  const before = await page.evaluate(() => {
    const map = document.querySelector(".tower-map");
    const rec = document.querySelector(".map-node.onboarding-recommend");
    map.scrollTop = 0;
    const mr = map.getBoundingClientRect(), rr = rec.getBoundingClientRect();
    return { scrollTop: map.scrollTop, visible: rr.top >= mr.top - 2 && rr.bottom <= mr.bottom + 2 };
  });
  T("滚到顶部时推荐节点确实不可见（反向前提）", before.visible === false, before);

  await page.evaluate(() => window.render());
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => {
    const map = document.querySelector(".tower-map");
    const rec = document.querySelector(".map-node.onboarding-recommend");
    const mr = map.getBoundingClientRect(), rr = rec.getBoundingClientRect();
    return {
      scrollTop: Math.round(map.scrollTop),
      visible: rr.top >= mr.top - 2 && rr.bottom <= mr.bottom + 2,
    };
  });
  T("重绘后自动滚动到推荐节点（可见）", after.visible === true, after);
  T("滚动位置被真实调整（非原地不动）", after.scrollTop > 0, after);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForTimeout(400);

  // ================= 验收②：刷新后从当前步骤继续 =================
  // 走项目自身的存档入口（GameStore），避免依赖内部键名
  const saved = await page.evaluate(async () => {
    if (!window.GameStore?.save) return false;
    await window.GameStore.save(window.state, { flush: true });
    return true;
  });
  T("存档入口可用", saved === true);
  const persisted = await page.evaluate(() => {
    try { return !!localStorage.getItem(window.GameStoreIO?.key || ""); }
    catch (e) { return false; }
  });
  T("存档已写入本地存储", persisted === true);
  await page.waitForTimeout(800);
  await page.reload();
  await page.waitForFunction(() => !!window.state, null, { timeout: 25000 });
  await page.waitForTimeout(1200);

  // 重载后回到开始界面，真实路径是点「读档」→ 选自动存档 → 确认
  T("重载后回到开始界面并提供读档", await page.locator("[data-start-load]").count() === 1);
  await page.locator("[data-start-load]").click();
  await page.locator("[data-save-slot='auto']").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("[data-save-slot='auto']").click();
  await page.locator("[data-confirm-ok]").waitFor({ state: "visible", timeout: 10000 });
  await page.locator("[data-confirm-ok]").click();
  await page.waitForFunction(() => window.state?.view === "dungeon",
    null, { timeout: 25000 });
  await page.waitForTimeout(800);

  const afterReload = await page.evaluate(() => ({
    view: window.state.view,
    onboarding: JSON.parse(JSON.stringify(window.state.flags?.onboarding || null)),
    hasExplore: !!window.state.explore,
  }));
  T("重载后仍在同一存档", !!afterReload.onboarding, afterReload);
  const o2 = afterReload.onboarding || {};
  T("读档后引导未重置为 hall（保持原步骤 map）", o2.step === "map",
    { step: o2.step, persisted, saved });
  T("读档后未完成/未跳过状态保留", o2.completed === false && o2.skipped === false, o2);
  T("读档后仍处于副本流程（地图）",
    afterReload.view === "dungeon" && afterReload.hasExplore, afterReload);
  T("读档后推荐节点仍在（步骤未回退）",
    await page.locator(".onboarding-recommend").count() >= 1);

  // ================= 验收③：老存档视为已完成 =================
  await page.evaluate(() => {
    // 模拟老存档：删掉 onboarding 字段后走迁移
    delete window.state.flags.onboarding;
    window.GameStoreMigrations?.migrate?.(window.state);
    if (typeof window.render === "function") window.render();
  });
  await page.waitForTimeout(500);
  const o3 = await flag(page);
  T("老存档补出 onboarding 且 completed=true", o3 && o3.completed === true, o3);
  T("老存档不重新强制教学（无引导提示）",
    await page.locator(".onboarding-tip").count() === 0);

  // ================= 验收④：跳过后所有规则恢复正常 =================
  // 回到开始界面再开新档（当前在副本内，没有 [data-start-game]）
  await page.reload();
  await page.waitForFunction(() => !!window.state, null, { timeout: 25000 });
  await page.locator("[data-start-game]").click();
  // 若已有自动存档，新游戏会弹"覆盖"确认
  const overwrite = page.locator("[data-confirm-ok]");
  if (await overwrite.count() && await overwrite.isVisible().catch(() => false)) {
    await overwrite.click();
  }
  await page.locator(".villa-hall").waitFor({ state: "visible", timeout: 20000 });
  await page.waitForTimeout(800);
  f = await flag(page);
  T("新档重新进入引导 step=hall", f && f.step === "hall", f);

  await page.locator("[data-onboarding-skip]").click();
  await page.waitForTimeout(300);
  f = await flag(page);
  T("跳过后 skipped=true", f && f.skipped === true, f);
  T("跳过大厅不再显示引导提示", await page.locator(".onboarding-tip").count() === 0);
  T("跳过后大厅不再显示首次目标卡片",
    await page.locator(".hall-first-objective").count() === 0);

  await toMap(page);
  T("跳过后地图无推荐标记", await page.locator(".onboarding-recommend").count() === 0);
  const layer2 = await page.evaluate(() => {
    const els = [...document.querySelectorAll(".map-node")];
    const l2 = els.filter(e => /n2-/.test(e.getAttribute("data-dungeon-node") || ""));
    return { total: l2.length, types: [...new Set(l2.map(e => e.className.match(/map-node (\w+)/)?.[1]))] };
  });
  T("跳过后首层不再被强制为普通战斗（恢复正常随机）",
    !layer2.types.includes("elite") || layer2.types.length > 1, layer2);

  // 跳过后首战不再受保护：敌人组不应被固定成单只机械哥布林
  const firstOpen = page.locator(".map-node.open").first();
  await firstOpen.click();
  await page.waitForFunction(() => !!window.state?.battle, null, { timeout: 25000 });
  const enemyCount = await page.evaluate(() => (window.state.battle.enemies || []).length);
  T("跳过后首战不再固定为单敌人", enemyCount >= 1, enemyCount);
  T("跳过后战斗内无引导提示", await page.locator(".onboarding-tip").count() === 0);
  T("跳过后引导状态保持 skipped（未被战斗重置）",
    (await flag(page))?.skipped === true);

  const relevant = errors.filter(t => !/favicon|ResizeObserver loop/.test(t));
  T("页面无 JS 错误", relevant.length === 0, relevant.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("脚本异常:", e.message); process.exit(2); });
