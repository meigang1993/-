// 【角色强化·副本置灰回大厅解除】浏览器实机：
// 副本态由合法 run 注入（作弊夹具），但回大厅走真实 [data-dungeon-retreat] UI → 确认弹窗 →
// DungeonSystem.retreat → render，再真实点击强化按钮。另覆盖异常兜底与普通任务胜利路径。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { expect } = require("@playwright/test");
const { openGame, startFreshGame, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SHOT = "/data/workspace/强化面板-回大厅解除-238.png";
const SHOT_FULL = "/data/workspace/强化面板-回大厅解除-完整-238.png";
let pass = 0, total = 0;
function check(name, cond, extra) {
  total += 1;
  if (cond) { pass += 1; return; }
  console.log(`❌ ${name}`, JSON.stringify(extra || {}));
}
const KEYS = ["maxHp", "attack", "magic", "speed"];
const snap = page => page.evaluate(() => {
  const s = window.state;
  const c = s.chars.find(x => x.id === "lokar");
  return {
    view: s.view, hasExplore: !!s.explore, gold: s.resources.gold,
    blocked: window.CharacterEnhance.blockedReason(s),
    levels: window.CharacterEnhance.levelsOf(c),
  };
});
const buttons = page => page.locator("[data-enhance-char]").evaluateAll(bs => bs.map(b => ({
  stat: b.dataset.enhanceStat, disabled: b.disabled, text: b.textContent.trim(),
})));

async function reopenPanel(page) {
  await page.evaluate(() => {
    window.state.infoUnit = "lokar"; window.state.infoTab = "enhance";
    window.render?.();
  });
  await expect(page.locator('.info-overlay [data-info-tab="enhance"]')).toBeVisible();
}

async function intoDungeon(page, patch = {}) {
  await page.evaluate(p => {
    const s = window.state;
    const mission = (window.GameData?.missions || [])[0] || { id: "machine_factory" };
    const difficulty = Object.keys(window.GameData?.difficulties || {})[0] || "normal";
    s.explore = {
      focusId: "hall-unblock-" + Date.now(), missionId: mission.id, difficultyId: difficulty,
      party: ["lokar"], activeParty: ["lokar"],
      layers: [[{ id: "n1-0", layer: 1, col: 0, type: "start", done: true, next: [] }]],
      current: "n1-0", earned: { gold: 0, essence: 0, relics: [], cards: [] },
      pending: null, lastReward: null, complete: false, rewardPopup: null, banked: false,
      ...p,
    };
    s.view = "dungeon"; s.battle = null; s.hallModal = null;
    s.resources.gold = 10000; s.infoUnit = "lokar"; s.infoTab = "enhance";
    window.render();
  }, patch);
  await expect(page.locator('.info-overlay [data-info-tab="enhance"]')).toBeVisible();
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
    await page.evaluate(async () => {
      if (!window.DungeonSystem && window.GameBundles?.load) await window.GameBundles.load("dungeon");
    });

    // ---- A. 副本中：四按钮全灰 ----
    await intoDungeon(page);
    const a = await snap(page);
    check("A1 副本态 blockedReason=副本中不可强化", a.blocked === "副本中不可强化", a);
    const b0 = await buttons(page);
    check("A2 四按钮各带属性键且全部 disabled",
      JSON.stringify(b0.map(b => b.stat)) === JSON.stringify(KEYS) && b0.every(b => b.disabled), b0);
    check("A3 按钮文案写明副本中不可强化",
      b0.every(b => b.text.includes("副本中不可强化")), b0.map(b => b.text));

    // ---- B. 真实 UI 撤退：点击 → 二次确认 → DungeonSystem.retreat → render ----
    const hasRetreat = await page.locator("[data-dungeon-retreat]").count();
    check("B1 副本页存在撤退按钮", hasRetreat === 1, hasRetreat);
    if (hasRetreat) {
      await page.locator("[data-dungeon-retreat]").evaluate(el => el.click());
      await page.waitForTimeout(500);
      const okBtn = page.locator(".confirm-ok, [data-confirm-ok]").first();
      if (await okBtn.count()) await okBtn.evaluate(el => el.click());
      await expect.poll(() => page.evaluate(() => !!window.state.explore),
        { timeout: 12000 }).toBe(false);
    }
    const c = await snap(page);
    check("B2 真实撤退后 explore 清空且 view=hall", !c.hasExplore && c.view === "hall", c);
    check("B3 真实撤退后 blockedReason 为空", c.blocked === "", c);
    const b1 = await buttons(page);
    check("B4 回大厅后四个按钮解除 disabled",
      b1.length === 4 && b1.every(b => !b.disabled), b1);
    check("B5 按钮文案回到「消耗 5000 · 强化」",
      b1.every(b => b.text.includes("消耗 5000") && !b.text.includes("不可强化")), b1.map(b => b.text));

    const popup = page.locator(".info-popup");
    if (await popup.count()) await popup.screenshot({ path: SHOT });
    await page.screenshot({ path: SHOT_FULL, fullPage: false });

    // ---- C. 回大厅后真实点击强化：扣 5000、只加攻击 1 次 ----
    await page.locator('[data-enhance-stat="attack"]').evaluate(el => el.click());
    await expect.poll(() => page.evaluate(() => window.state.resources.gold),
      { timeout: 10000 }).toBe(5000);
    const d = await snap(page);
    check("C1 真实点击扣费 5000 且只加攻击力 1 次",
      d.gold === 5000 && JSON.stringify(d.levels) === JSON.stringify({ maxHp: 0, attack: 1, magic: 0, speed: 0 }), d);
    check("C2 强化后仍可继续点击其它项",
      (await buttons(page)).every(b => !b.disabled), await buttons(page));

    // ---- D. 副本数据异常兜底：ensureRenderableView 也解除置灰 ----
    await intoDungeon(page);
    await page.evaluate(() => {
      window.state.explore = { layers: [] };
      window.ensureRenderableView?.();
      window.render?.();
    });
    await reopenPanel(page);
    const e = await snap(page);
    check("D1 异常兜底回大厅同样解除置灰",
      !e.hasExplore && e.view === "hall" && e.blocked === ""
      && (await buttons(page)).every(b => !b.disabled), e);

    // ---- E. 普通任务胜利回大厅（不经副本结算）也不误置灰 ----
    await intoDungeon(page);
    await page.evaluate(async () => {
      const s = window.state;
      s.explore = null;
      s.battle = { missionId: (window.GameData.missions[0] || {}).id, test: false,
        exploration: false, pendingVictory: false, victoryScreen: true, locked: false };
      await window.BattleSessionSettlement?.({
        cleanupBattlePrompts: () => {}, clearBattleLog: () => {},
        getCombat: () => ({ checkDefeat: () => {}, checkEnd: () => {} }),
      })?.(s, true, true);
      window.render?.();
    });
    await reopenPanel(page);
    const f = await snap(page);
    check("E1 普通任务胜利回大厅解除置灰",
      !f.hasExplore && f.view === "hall" && f.blocked === ""
      && (await buttons(page)).every(b => !b.disabled), f);

    check("F1 页面无 JS 错误", errors.length === 0, errors);
  } finally {
    await browser.close();
  }
  console.log(`${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error(err); process.exit(2); });
