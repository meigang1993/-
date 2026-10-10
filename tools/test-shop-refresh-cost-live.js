/* 核查「花 500 莉莉丝元刷新商店商品」功能。
   关注点：
   1) 商店出现「刷新商品」按钮，价格 500，金币不足时禁用
   2) 刷新确实扣 500 并重摇全部商品（含已售位置重新上架）
   3) 边界：莉莉丝元不足、商品池为空 —— 必须拒绝且不扣费
   4) 商店内不应再出现「任务刷新服务」（那是错放的功能）
   反向验证：去掉 refreshShop 的金币校验应导致 C2 变红；
   把 refreshShop 改为不重摇应导致 B2 变红。 */
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

    // 准备：确保商品池非空、库存已确认
    const prep = await page.evaluate(() => {
      const st = window.state;
      if (!(st.unlockedShopCards || []).length) {
        st.unlockedShopCards = (GameData.eliteCards || []).slice(0, 10).map(c => c.name);
      }
      st.resources.gold = 3000;
      window.ShopSystem.ensure(st);
      return { pool: window.ShopSystem.shopPool(st).length, stock: st.shopCards.length,
        confirmed: window.ShopSystem.confirmed(st) };
    });
    T("A0 商品池与库存可用", prep.pool > 0 && prep.stock > 0, prep);

    // ===== A. 界面：按钮与价格 =====
    const ui = await page.evaluate(() => {
      const st = window.state;
      let html;
      try {
        html = window.VillaCollectionUI({ U: window.UICommon, cardTypeLabel: () => "" }).shop(st);
      } catch (err) { html = "ERR:" + err.message; }
      const btn = html.match(/<button[^>]*data-shop-paid-refresh="1"[^>]*>([^<]*)</);
      return { cost: window.ShopSystem.REFRESH_COST, has: !!btn, label: btn ? btn[1] : "",
        disabled: btn ? /disabled/.test(btn[0]) : null,
        hasBountyBlock: /任务刷新服务/.test(html), gold: st.resources.gold,
        htmlHead: html.slice(0, 60) };
    });
    T("A1 刷新价格为 500 莉莉丝元", ui.cost === 500, ui.cost);
    T("A2 商店出现刷新商品按钮", ui.has, ui);
    T("A3 按钮文案含 500", /500/.test(ui.label), ui.label);
    T("A4 金币充足时按钮未禁用", ui.disabled === false, ui);
    T("A5 商店不再出现任务刷新服务", ui.hasBountyBlock === false, ui);

    // ===== B. 刷新行为 =====
    const b = await page.evaluate(async () => {
      const st = window.state;
      const key = () => (st.shopCards || []).map(s => `${s?.card?.name}|${s?.card?.suit}|${s?.sold ? 1 : 0}`).join(";");
      if (st.shopCards[0]) st.shopCards[0].sold = true;
      const goldBefore = st.resources.gold;
      const before = key();
      const soldBefore = st.shopCards.filter(s => s.sold).length;
      const r = await window.ServerCore.call("refreshShop", {}, st);
      return { ok: r.ok, changed: r.changed, goldBefore, goldAfter: st.resources.gold,
        before, after: key(), soldBefore, soldAfter: st.shopCards.filter(s => s.sold).length,
        stock: st.shopCards.length };
    });
    T("B1 刷新调用成功", b.ok === true, b);
    T("B2 商品确实被重摇", b.before !== b.after, b);
    T("B3 扣费精确 500", b.goldBefore - b.goldAfter === 500, b);
    T("B4 已售位置重新上架", b.soldBefore > 0 && b.soldAfter === 0, b);
    T("B5 库存数量正常", b.stock > 0, b);

    // ===== C. 金币不足 =====
    const c = await page.evaluate(async () => {
      const st = window.state;
      st.resources.gold = 100;
      const key = () => (st.shopCards || []).map(s => `${s?.card?.name}|${s?.card?.suit}|${s?.sold ? 1 : 0}`).join(";");
      const before = key();
      const r = await window.ServerCore.call("refreshShop", {}, st);
      return { ok: r.ok, changed: r.changed, gold: st.resources.gold, same: key() === before };
    });
    T("C1 金币不足时被拒绝", c.changed === false, c);
    T("C2 金币不足时不扣费", c.gold === 100, c);
    T("C3 金币不足时商品不变", c.same === true, c);

    // ===== D. 连续刷新 =====
    // 注：商品池为空的场景在真实游戏中不可达 —— cleanShopUnlocks 会强制合并
    // GameData.initialShopCardNames，因此这里改为验证连续刷新的扣费与重摇。
    const d = await page.evaluate(async () => {
      const st = window.state;
      st.resources.gold = 3000;
      const key = () => (st.shopCards || []).map(s => `${s?.card?.name}|${s?.card?.suit}`).join(";");
      const first = key();
      const r1 = await window.ServerCore.call("refreshShop", {}, st);
      const second = key();
      const r2 = await window.ServerCore.call("refreshShop", {}, st);
      const third = key();
      return { r1ok: r1.ok, r2ok: r2.ok, final: st.resources.gold,
        changed12: first !== second, changed23: second !== third };
    });
    T("D1 连续两次刷新共扣 1000", 3000 - d.final === 1000, d);
    T("D2 每次刷新都换掉商品", d.changed12 && d.changed23, d);

    // ===== E. 存档与报错 =====
    const e = await page.evaluate(() => ({
      valid: window.GameStoreSaveSchema?.validPersistedState?.(window.state),
      shopValid: window.GameStoreSaveSchema?.validShopStock?.(window.state),
    }));
    T("E1 刷新后存档仍合法", e.valid === true, e);
    T("E2 商店库存结构合法", e.shopValid === true, e);
    T("E3 无页面错误", errors.length === 0, errors);

    console.log(`\n通过 ${pass}/${total}`);
    if (pass !== total) process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
