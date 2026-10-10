/* 真实点击「刷新商品」按钮：确认点了确实扣 500 并换一批商品。
   反向验证：断开 [data-shop-paid-refresh] 绑定应导致 X3/X4 变红。 */
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
    // 首次进大厅会弹出据点面板，先关掉，避免挡住侧栏按钮
    await page.keyboard.press("Escape");
    await page.evaluate(() => { window.state.resources.gold = 3000; });
    await page.click('[data-open-modal="shop"]');
    await page.waitForSelector('[data-shop-paid-refresh="1"]', { timeout: 20000 });

    const before = await page.evaluate(() => {
      const el = document.querySelector('[data-shop-paid-refresh="1"]');
      return {
        gold: window.state.resources.gold,
        key: (window.state.shopCards || []).map(s => `${s?.card?.name}|${s?.card?.suit}`).join(";"),
        disabled: !!el.disabled,
        label: el.textContent || "",
      };
    });
    T("X1 商店刷新按钮可见且未禁用", before.disabled === false, before);
    T("X2 按钮文案含 500", /500/.test(before.label), before.label);

    await page.click('[data-shop-paid-refresh="1"]');
    await page.waitForTimeout(2500);
    const after = await page.evaluate(() => ({
      gold: window.state.resources.gold,
      key: (window.state.shopCards || []).map(s => `${s?.card?.name}|${s?.card?.suit}`).join(";"),
    }));
    T("X3 点击后扣 500 莉莉丝元", before.gold - after.gold === 500,
      { before: before.gold, after: after.gold });
    T("X4 点击后商品被换掉", before.key !== after.key,
      { b: before.key.slice(0, 40), a: after.key.slice(0, 40) });
    T("X5 无页面错误", errors.length === 0, errors);

    console.log(`\n通过 ${pass}/${total}`);
    if (pass !== total) process.exitCode = 1;
  } catch (err) {
    console.log("EXCEPTION: " + err.message);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
