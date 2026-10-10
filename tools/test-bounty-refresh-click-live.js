/* 核查刷新任务按钮的「真实点击」链路：
   任务界面与商店里的按钮是否都绑定成功、点击后是否真的扣费并刷新任务。
   与 test-bounty-refresh-cost-live.js 的分工：那个测核心逻辑，这个测 UI 绑定。
   反向验证：把 app-hall-bindings.js 里 data-bounty-refresh 的 onclick 去掉，
   A2/B3 应变红（按钮存在但点击无反应）。 */
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const { openGame, startFreshGame } = require("../tests/helpers/preview-game.js");

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) { pass++; console.log(`✅ ${name}`); }
  else console.log(`❌ ${name}  ← ${JSON.stringify(extra || {})}`);
  return !!cond;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  try {
    await openGame(page);
    await startFreshGame(page);

    // 给足莉莉丝元，保证按钮可用
    // 开局据点面板可能已经打开，会拦截对侧栏按钮的点击，先关掉
    await page.evaluate(() => {
      window.state.resources.gold = 2000;
      document.querySelector(".info-close")?.click();
    });
    await page.waitForTimeout(1000);

    // ===== A. 任务界面真实点击 =====
    await page.click('[data-open-modal="bounty"]');
    await page.waitForSelector('[data-bounty-refresh]', { timeout: 8000 });
    const btnInfo = await page.evaluate(() => {
      const b = document.querySelector('[data-bounty-refresh]');
      return { text: b?.textContent?.trim() || "", disabled: b?.disabled === true };
    });
    T("A1 任务界面按钮可点击（未禁用）", btnInfo.disabled === false, btnInfo);

    const before = await page.evaluate(() => {
      window.BountySystem.ensure(window.state);
      return { gold: window.state.resources.gold, ids: window.state.bounties.map(t => t.id) };
    });
    await page.click('[data-bounty-refresh]');
    await page.waitForTimeout(2000);
    const after = await page.evaluate(() => ({
      gold: window.state.resources.gold,
      ids: window.state.bounties.map(t => t.id),
    }));
    T("A2 点击后扣 500 莉莉丝元", after.gold === before.gold - 500,
      { before: before.gold, after: after.gold });
    T("A3 点击后任务列表被重摇",
      JSON.stringify(before.ids) !== JSON.stringify(after.ids),
      { before: before.ids.length, after: after.ids.length });

    // ===== B. 商店界面按钮 =====
    // 先关闭任务弹窗，否则据点面板会拦截对侧栏按钮的点击
    await page.evaluate(() => { window.state.resources.gold = 2000; document.querySelector(".info-close")?.click(); });
    await page.waitForTimeout(800);
    await page.click('[data-open-modal="shop"]');
    await page.waitForTimeout(1500);
    const shopBtn = await page.evaluate(() => {
      const b = document.querySelector('[data-bounty-refresh]');
      return { has: !!b, text: b?.textContent?.trim() || "", disabled: b?.disabled === true };
    });
    T("B1 商店出现刷新任务按钮", shopBtn.has, shopBtn);
    T("B2 商店按钮文案含 500", /500/.test(shopBtn.text), shopBtn.text);

    if (shopBtn.has && !shopBtn.disabled) {
      const b2 = await page.evaluate(() => window.state.resources.gold);
      await page.click('[data-bounty-refresh]');
      await page.waitForTimeout(2000);
      const a2 = await page.evaluate(() => window.state.resources.gold);
      T("B3 商店点击后扣 500 莉莉丝元", a2 === b2 - 500, { before: b2, after: a2 });
    } else {
      T("B3 商店点击后扣 500 莉莉丝元", false, shopBtn);
    }

    T("C1 无页面错误", errors.length === 0, errors.slice(0, 3));
    console.log(`\n总计 ${pass}/${total}`);
  } catch (err) {
    console.error("测试异常：", err.message);
    console.log(`\n总计 ${pass}/${total}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
