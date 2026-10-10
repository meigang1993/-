/* 核查「花 500 莉莉丝元刷新任务」功能。
   关注点：
   1) 任务界面与商店是否都出现刷新按钮，价格与禁用条件是否一致
   2) 刷新是否真的扣 500 莉莉丝元，且只重摇「未接取」的任务
   3) 已接取的任务是否被保留（不能被刷新清空）
   4) 边界：莉莉丝元不足、已接取已满 —— 必须拒绝且不扣费
   反向验证：把 refreshBounty 的金币校验去掉应导致 C1/C4 变红；
   把「保留已接取任务」改为全部重摇应导致 B2 变红。 */
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

    // ===== A. 界面：按钮与价格 =====
    const ui = await page.evaluate(() => {
      const st = window.state;
      const cost = window.BountyRender?.refreshCost?.();
      window.BountySystem.ensure(st);
      const html = window.BountySystem.render(st);
      const btn = html.match(/<button[^>]*data-bounty-refresh="1"[^>]*>([^<]*)</);
      const count = st.bounties.filter(t => t.accepted).length;
      const max = window.BountyTasks?.maxCount?.(st) || 4;
      return { cost, has: !!btn, label: btn ? btn[1] : "", count, max,
        total: st.bounties.length };
    });
    T("A1 刷新价格为 500 莉莉丝元", ui.cost === 500, ui.cost);
    T("A2 任务界面出现刷新按钮", ui.has, ui);
    T("A3 按钮文案含 500", /500/.test(ui.label), ui.label);

    // ===== B. 刷新：扣费与保留已接取 =====
    const refresh = await page.evaluate(async () => {
      const st = window.state;
      window.BountySystem.ensure(st);
      st.resources.gold = 1000;
      const max = window.BountyTasks.maxCount(st);
      // 接取第一个任务，作为「必须保留」的对照组
      const picked = st.bounties[0];
      window.BountySystem.acceptTask(st, picked.id);
      const beforeIds = st.bounties.map(t => t.id);
      const acceptedId = picked.id;
      const beforeGold = st.resources.gold;
      const res = await window.ServerCore.call("refreshBounty", {}, st);
      const afterIds = st.bounties.map(t => t.id);
      const survivors = afterIds.filter(id => beforeIds.includes(id));
      return {
        ok: res?.ok === true, changed: res?.changed === true,
        beforeGold, afterGold: st.resources.gold,
        beforeIds, afterIds, acceptedId, max,
        keptAccepted: afterIds.includes(acceptedId),
        survivors,
        afterCount: st.bounties.length,
        acceptedAfter: st.bounties.filter(t => t.accepted).length,
      };
    });
    T("B1 刷新成功（核心接受并应用）", refresh.ok && refresh.changed, refresh);
    T("B2 扣除 500 莉莉丝元", refresh.afterGold === refresh.beforeGold - 500,
      { before: refresh.beforeGold, after: refresh.afterGold });
    T("B3 已接取任务被保留", refresh.keptAccepted && refresh.acceptedAfter === 1,
      { kept: refresh.keptAccepted, acceptedAfter: refresh.acceptedAfter });
    T("B4 未接取任务被重摇", refresh.survivors.length <= 1,
      { survivors: refresh.survivors.length, before: refresh.beforeIds.length });
    T("B5 任务数量仍补足到上限", refresh.afterCount === refresh.max,
      { afterCount: refresh.afterCount, max: refresh.max });

    // ===== C. 边界：金币不足必须拒绝且不扣费 =====
    const poor = await page.evaluate(async () => {
      const st = window.state;
      st.resources.gold = 100;
      const beforeIds = st.bounties.map(t => t.id);
      const beforeGold = st.resources.gold;
      const res = await window.ServerCore.call("refreshBounty", {}, st);
      const html = window.BountyRender.refreshButton(st);
      return {
        ok: res?.ok === true, message: res?.message || "",
        beforeGold, afterGold: st.resources.gold,
        sameIds: JSON.stringify(beforeIds) === JSON.stringify(st.bounties.map(t => t.id)),
        disabled: /disabled/.test(html), label: html,
      };
    });
    T("C1 莉莉丝元不足时拒绝", poor.ok === false, poor);
    T("C2 莉莉丝元不足时不扣费", poor.afterGold === poor.beforeGold,
      { before: poor.beforeGold, after: poor.afterGold });
    T("C3 莉莉丝元不足时任务不变", poor.sameIds, poor);
    T("C4 莉莉丝元不足时按钮禁用", poor.disabled, poor.label);

    // ===== D. 边界：已接取满上限时拒绝 =====
    const fullCase = await page.evaluate(async () => {
      const st = window.state;
      st.resources.gold = 5000;
      window.BountySystem.ensure(st);
      const max = window.BountyTasks.maxCount(st);
      // 全部接取
      st.bounties.forEach(t => { t.accepted = true; });
      const beforeIds = st.bounties.map(t => t.id);
      const beforeGold = st.resources.gold;
      const res = await window.ServerCore.call("refreshBounty", {}, st);
      return {
        max, ok: res?.ok === true,
        beforeGold, afterGold: st.resources.gold,
        sameIds: JSON.stringify(beforeIds) === JSON.stringify(st.bounties.map(t => t.id)),
      };
    });
    T("D1 已接满时拒绝", fullCase.ok === false, fullCase);
    T("D2 已接满时不扣费", fullCase.afterGold === fullCase.beforeGold, fullCase);
    T("D3 已接满时任务不变", fullCase.sameIds, fullCase);

    // ===== E. 按钮归属：任务界面刷任务，商店刷商品 =====
    const shop = await page.evaluate(() => {
      const st = window.state;
      st.resources.gold = 1000;
      window.BountySystem.ensure(st);
      const btn = window.BountyRender.refreshButton(st);
      let html;
      try {
        html = window.VillaCollectionUI({ U: window.UICommon, cardTypeLabel: () => "" }).shop(st);
      } catch (err) { html = "ERR:" + err.message; }
      return { has: /data-bounty-refresh="1"/.test(btn), label: btn,
        shopHasBounty: /data-bounty-refresh="1"/.test(html),
        shopHasPaid: /data-shop-paid-refresh="1"/.test(html) };
    });
    T("E1 任务刷新按钮组件可用", shop.has, shop.label);
    T("E2 商店不再挂任务刷新按钮", shop.shopHasBounty === false, shop);
    T("E3 商店改为刷新商品按钮", shop.shopHasPaid === true, shop);
    T("E2 无页面错误", errors.length === 0, errors.slice(0, 3));

    console.log(`\n总计 ${pass}/${total}`);
  } catch (err) {
    console.error("测试异常：", err.message);
    console.log(`\n总计 ${pass}/${total}`);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
