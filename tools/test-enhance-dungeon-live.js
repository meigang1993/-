// 【角色强化·副本置灰】浏览器实机：副本视图四按钮置灰、绕过按钮不扣费、结束副本恢复可强化。
// 副本状态用合法 run 直接注入（作弊夹具，避免走完整出征流程），其余均走真实渲染与真实点击。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { expect } = require("@playwright/test");
const { openGame, startFreshGame, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SHOT_POPUP = "/data/workspace/强化面板-副本置灰.png";
const SHOT_FULL = "/data/workspace/强化面板-副本置灰-完整.png";
let pass = 0, total = 0;
function check(name, cond, extra) {
  total += 1;
  if (cond) { pass += 1; return; }
  console.log(`❌ ${name}`, JSON.stringify(extra || {}));
}
const KEYS = ["maxHp", "attack", "magic", "speed"];
const readState = page => page.evaluate(() => {
  const c = window.state.chars.find(x => x.id === "lokar");
  return {
    gold: window.state.resources.gold,
    levels: window.CharacterEnhance.levelsOf(c),
    blocked: window.CharacterEnhance.blockedReason(window.state),
  };
});
async function intoDungeon(page) {
  await page.evaluate(() => {
    const s = window.state;
    const mission = (window.GameData?.missions || [])[0] || { id: "machine_factory" };
    const difficulty = Object.keys(window.GameData?.difficulties || {})[0] || "normal";
    s.explore = {
      focusId: "enhance-dungeon-guard-fixture", missionId: mission.id, difficultyId: difficulty,
      party: ["lokar"], activeParty: ["lokar"],
      layers: [[{ id: "n1-0", layer: 1, col: 0, type: "start", done: true, next: [] }]],
      current: "n1-0",
      earned: { gold: 0, essence: 0, relics: [], cards: [] },
      pending: null, lastReward: null, complete: false,
    };
    s.view = "dungeon";
    s.hallModal = null;
    s.resources.gold = 5000;
    s.infoUnit = "lokar";
    s.infoTab = "enhance";
    window.render();
  });
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

    // A. 副本主视图：面板四个按钮全灰、写明原因、页签仍可查看
    await intoDungeon(page);
    const st0 = await readState(page);
    check("A1 副本状态判定为「副本中不可强化」", st0.blocked === "副本中不可强化", st0);
    const buttons = await page.locator("[data-enhance-char]").evaluateAll(bs => bs.map(b => ({
      stat: b.dataset.enhanceStat, disabled: b.disabled, text: b.textContent.trim(),
    })));
    check("A2 四个按钮各带属性键且全部 disabled",
      JSON.stringify(buttons.map(b => b.stat)) === JSON.stringify(KEYS)
      && buttons.every(b => b.disabled), buttons);
    check("A3 每个按钮都写明「副本中不可强化」",
      buttons.every(b => b.text.includes("副本中不可强化")), buttons.map(b => b.text));
    check("A4 「角色强化」页签仍在（副本中可查看加成）",
      await page.locator('[data-info-tab="enhance"]').count() === 1);
    check("A5 面板文案写明副本进行中不可强化",
      (await page.locator(".character-enhance").textContent()).includes("副本进行中与战斗中不可强化"));

    // 截图：面板特写 + 副本视图整页
    const popup = page.locator(".info-popup");
    if (await popup.count()) await popup.screenshot({ path: SHOT_POPUP });
    await page.screenshot({ path: SHOT_FULL, fullPage: false });

    // B. 绕过置灰按钮直接触发动作层：副本中不扣费、不加属性
    const bypass = await page.evaluate(async () => {
      const s = window.state;
      const before = read();
      const ret = await window.enhanceCharacter("lokar", "magic", s, () => true);
      return { ret, before, after: read() };
      function read() {
        const c = s.chars.find(x => x.id === "lokar");
        return { gold: s.resources.gold, levels: window.CharacterEnhance.levelsOf(c) };
      }
    });
    check("B1 副本中直接调动作层返回 false", bypass.ret === false, bypass);
    check("B2 副本中不扣费、四项次数均不变",
      bypass.before.gold === bypass.after.gold
      && JSON.stringify(bypass.before.levels) === JSON.stringify(bypass.after.levels), bypass);

    // C. 副本内战斗（explore 仍在、view=battle）：判定优先按副本，动作层同样拒绝
    const inBattle = await page.evaluate(async () => {
      const s = window.state, prev = s.view;
      s.view = "battle";
      const reason = window.CharacterEnhance.blockedReason(s);
      const before = s.resources.gold;
      const ret = await window.enhanceCharacter("lokar", "speed", s, () => true);
      const after = s.resources.gold;
      s.view = prev;
      return { reason, ret, before, after };
    });
    check("C1 副本内战斗判定为「副本中不可强化」", inBattle.reason === "副本中不可强化", inBattle);
    check("C2 副本内战斗绕过按钮仍拒绝且不扣费",
      inBattle.ret === false && inBattle.before === inBattle.after, inBattle);

    // D. 普通战斗（无 explore）仍按战斗口径置灰
    const plainBattle = await page.evaluate(() => {
      const s = window.state, prevView = s.view, prevExplore = s.explore;
      s.explore = null; s.view = "battle";
      const reason = window.CharacterEnhance.blockedReason(s);
      s.view = prevView; s.explore = prevExplore;
      return reason;
    });
    check("D1 普通战斗仍为「战斗中不可强化」", plainBattle === "战斗中不可强化", plainBattle);

    // E. 结束副本回据点：恢复可点，并真实点击一次
    await page.evaluate(() => {
      const s = window.state;
      s.explore = null; s.view = "hall"; s.battle = null;
      s.resources.gold = 5000; s.infoUnit = "lokar"; s.infoTab = "enhance";
      window.render();
    });
    const restored = await page.locator("[data-enhance-char]").evaluateAll(bs => bs.map(b => b.disabled));
    check("E1 回据点后四按钮恢复可点", restored.every(d => !d), restored);
    const beforeClick = await readState(page);
    await page.locator('[data-enhance-stat="attack"]').evaluate(el => el.click());
    await expect.poll(() => page.evaluate(() => window.state.resources.gold)).toBe(4000);
    const afterClick = await readState(page);
    check("E2 真实点击扣费恰好 1000 且只加攻击力 1 次",
      afterClick.gold === beforeClick.gold - 1000
      && JSON.stringify(afterClick.levels) === JSON.stringify({ maxHp: 0, attack: 1, magic: 0, speed: 0 }),
      { beforeClick, afterClick });
    check("E3 页面无 JS 错误", errors.length === 0, errors);
  } finally {
    await browser.close();
  }
  console.log(`${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error(err); process.exit(2); });
