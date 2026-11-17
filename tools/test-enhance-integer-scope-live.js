// 【角色强化·整数收口 / 适用范围】浏览器实机：小数金币面板与真实扣费、34 名角色页签，并输出截图。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { expect } = require("@playwright/test");
const { openGame, startFreshGame, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SHOT_GOLD = "/data/workspace/强化面板-小数金币收口-234.png";
const SHOT_AFTER = "/data/workspace/强化面板-整数余额-234.png";
let pass = 0, total = 0;
function check(name, cond, extra) {
  total += 1;
  if (cond) { pass += 1; return; }
  console.log(`❌ ${name}`, JSON.stringify(extra || {}));
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  try {
    await openGame(page);
    await startFreshGame(page);
    await dismissOpeningStory(page);

    // ---------- A. 注入小数金币 1000.9 ----------
    await page.evaluate(() => {
      const s = window.state;
      s.view = "hall"; s.hallModal = null;
      s.resources.gold = 1000.9;
      s.infoUnit = "lokar"; s.infoTab = "enhance";
      window.render();
    });
    await expect(page.locator('.info-overlay [data-info-tab="enhance"]')).toBeVisible();
    const beforeText = await page.locator(".character-enhance").textContent();
    check("A1 小数余额按整数显示「莉莉丝元 1000」（不是 1000.9）",
      beforeText.includes("莉莉丝元 1000") && !beforeText.includes("1000.9"), beforeText.slice(0, 160));
    const disabled = await page.locator("[data-enhance-char]").evaluateAll(bs => bs.map(b => b.disabled));
    check("A2 1000.9 取整为 1000 后仍判定可强化（四按钮可点）",
      disabled.length === 4 && disabled.every(d => !d), disabled);
    const popup = page.locator(".info-popup");
    if (await popup.count()) await popup.screenshot({ path: SHOT_GOLD });
    else await page.screenshot({ path: SHOT_GOLD });

    // 真实点击「攻击力」，等待结算落盘
    await page.locator('[data-enhance-stat="attack"]').click();
    await page.waitForFunction(() => window.state.resources.gold === 0, null, { timeout: 8000 });
    const after = await page.evaluate(() => {
      const c = window.state.chars.find(x => x.id === "lokar");
      return {
        gold: window.state.resources.gold,
        levels: window.CharacterEnhance.levelsOf(c),
        panel: document.querySelector(".character-enhance")?.textContent || "",
        log: (window.state.log || []).slice(0, 2),
      };
    });
    check("A3 扣费后余额为整数 0（不再是 0.9）",
      after.gold === 0 && Number.isInteger(after.gold), after.gold);
    check("A4 只加攻击力 1 次，其它三项不变",
      JSON.stringify(after.levels) === JSON.stringify({ maxHp: 0, attack: 1, magic: 0, speed: 0 }), after.levels);
    check("A5 面板余额显示整数 0 且提示余额不足",
      after.panel.includes("莉莉丝元 0") && after.panel.includes("莉莉丝元不足"), after.panel.slice(0, 200));
    if (await popup.count()) await popup.screenshot({ path: SHOT_AFTER });
    else await page.screenshot({ path: SHOT_AFTER });

    // ---------- B. 34 名可玩角色适用范围（解锁后逐个渲染） ----------
    const scope = await page.evaluate(() => {
      const s = window.state;
      s.view = "hall"; s.hallModal = null; s.resources.gold = 5000;
      s.chars.forEach(c => { c.locked = false; });
      const ids = s.chars.map(c => c.id);
      const missing = [];
      const special = [];
      for (const id of ids) {
        s.infoUnit = id; s.infoTab = "enhance";
        window.render();
        const tab = !!document.querySelector('[data-info-tab="enhance"]');
        if (!tab) missing.push(id);
        if (["catherine", "noa", "besta_doll", "manny"].includes(id) && tab) special.push(id);
      }
      return { count: ids.length, missing, special };
    });
    check("B1 34 名可玩角色（解锁后）全部显示「角色强化」页签",
      scope.count === 34 && scope.missing.length === 0, scope);
    check("B2 自动解锁/特殊角色（凯瑟琳·诺亚·魔偶·曼妮）同样可强化",
      scope.special.length === 4, scope.special);
    const locked = await page.evaluate(() => {
      const s = window.state;
      const c = s.chars.find(x => x.id === "manny"); c.locked = true;
      s.infoUnit = "manny"; s.infoTab = "enhance";
      window.render();
      return !document.querySelector('[data-info-tab="enhance"]');
    });
    check("B3 未解锁角色不显示强化页签", locked);

    // ---------- C. 副本/战斗判定源 + 无 JS 错误 ----------
    // 不切到 battle/dungeon 视图（那需要完整 battle/explore 快照），仅验证统一判定源；
    // 真实副本视图的四按钮置灰由 test-enhance-dungeon-live.js 13/13 覆盖。
    const guard = await page.evaluate(() => {
      const E = window.CharacterEnhance;
      return {
        battle: E.blockedReason({ view: "battle" }),
        dungeon: E.blockedReason({ view: "dungeon", explore: {} }),
        hall: E.blockedReason({ view: "hall" }),
      };
    });
    check("C1 普通战斗判定为「战斗中不可强化」", guard.battle === "战斗中不可强化", guard);
    check("C2 副本判定为「副本中不可强化」且大厅放行",
      guard.dungeon === "副本中不可强化" && guard.hall === "", guard);
    check("C3 无页面 JS 错误", errors.length === 0, errors);

    console.log(`${pass}/${total}`);
    process.exit(pass === total ? 0 : 1);
  } catch (err) {
    console.error(err);
    process.exit(2);
  } finally {
    await browser.close();
  }
})();
