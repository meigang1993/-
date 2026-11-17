// 【角色强化】浏览器实机：面板四按钮、逐项真实点击、余额/战斗置灰，并输出面板截图。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { expect } = require("@playwright/test");
const { openGame, startFreshGame, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SHOT_PANEL = "/data/workspace/强化面板-232.png";
const SHOT_FULL = "/data/workspace/强化面板-完整-232.png";
let pass = 0, total = 0;
function check(name, cond, extra) {
  total += 1;
  if (cond) { pass += 1; return; }
  console.log(`❌ ${name}`, JSON.stringify(extra || {}));
}
const KEYS = ["maxHp", "attack", "magic", "speed"];

async function openEnhance(page) {
  await page.evaluate(() => {
    const s = window.state;
    s.view = "hall";
    s.hallModal = null;
    s.resources.gold = 5000;
    s.infoUnit = "lokar";
    s.infoTab = "enhance";
    window.render();
  });
  await expect(page.locator('.info-overlay [data-info-tab="enhance"]')).toBeVisible();
}
const readState = page => page.evaluate(() => {
  const c = window.state.chars.find(x => x.id === "lokar");
  return {
    gold: window.state.resources.gold,
    levels: window.CharacterEnhance.levelsOf(c),
    stats: { maxHp: c.stats.maxHp, attack: c.stats.attack, magic: c.stats.magic, speed: c.stats.speed },
    hp: c.hp,
    log: (window.state.log || []).slice(0, 3),
  };
});

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  try {
    await openGame(page);
    await startFreshGame(page);
    await dismissOpeningStory(page);
    await openEnhance(page);

    // A. 面板结构
    const tabs = await page.evaluate(() => ({
      enhance: !!document.querySelector('[data-info-tab="enhance"]'),
      illust: !!document.querySelector('[data-info-tab="specialArt"]'),
      buttons: [...document.querySelectorAll("[data-enhance-char]")].map(b => b.dataset.enhanceStat),
      text: document.querySelector(".character-enhance")?.textContent || "",
    }));
    check("A1 「角色强化」页签存在且「立绘」页签已删除", tabs.enhance && !tabs.illust, tabs);
    check("A2 四个按钮各绑定一个属性键", JSON.stringify(tabs.buttons) === JSON.stringify(KEYS), tabs.buttons);
    check("A3 面板写明「选择一项属性」与四项加成",
      tabs.text.includes("选择一项属性") && ["生命值", "攻击力", "魔力", "速度"].every(k => tabs.text.includes(k)));
    const disabled = await page.locator("[data-enhance-char]").evaluateAll(bs => bs.map(b => b.disabled));
    check("A4 余额充足时四按钮均可点", disabled.every(d => !d), disabled);

    // 截图：面板特写 + 整页
    const popup = page.locator(".info-popup");
    if (await popup.count()) await popup.screenshot({ path: SHOT_PANEL });
    else await page.screenshot({ path: SHOT_PANEL });
    await page.screenshot({ path: SHOT_FULL, fullPage: false });

    // B. 真实点击：一次只加一项
    const before = await readState(page);
    await page.locator('[data-enhance-stat="attack"]').evaluate(el => el.click());
    await expect.poll(() => page.evaluate(() => window.state.resources.gold)).toBe(4000);
    const afterAttack = await readState(page);
    check("B1 点击攻击力扣费恰好 1000", afterAttack.gold === before.gold - 1000);
    check("B2 只增加攻击力 1 点，其余三项不变",
      afterAttack.stats.attack === before.stats.attack + 1
      && afterAttack.stats.maxHp === before.stats.maxHp
      && afterAttack.stats.magic === before.stats.magic
      && afterAttack.stats.speed === before.stats.speed,
      { before: before.stats, after: afterAttack.stats });
    check("B3 只写入攻击力次数", JSON.stringify(afterAttack.levels)
      === JSON.stringify({ maxHp: 0, attack: 1, magic: 0, speed: 0 }), afterAttack.levels);
    check("B4 战报写明本次强化的属性与加成",
      afterAttack.log.some(l => l.includes("攻击力") && l.includes("+1")), afterAttack.log);
    check("B5 满血 hp 跟随新上限", afterAttack.hp === afterAttack.stats.maxHp);

    await page.locator('[data-enhance-stat="maxHp"]').evaluate(el => el.click());
    await expect.poll(() => page.evaluate(() => window.state.resources.gold)).toBe(3000);
    const afterHp = await readState(page);
    check("B6 再点生命值：只加 3 点生命、攻击力保持 1 点加成",
      afterHp.stats.maxHp === before.stats.maxHp + 3
      && afterHp.stats.attack === before.stats.attack + 1, { before: before.stats, after: afterHp.stats });
    check("B7 两项分别累计", JSON.stringify(afterHp.levels)
      === JSON.stringify({ maxHp: 1, attack: 1, magic: 0, speed: 0 }), afterHp.levels);
    check("B8 累计显示随次数更新",
      (await page.locator(".character-enhance").textContent()).includes("已强化 2 次"));
    check("B9 强化后按钮仍可点（可重复强化）",
      (await page.locator('[data-enhance-stat="attack"]').evaluate(el => el.disabled)) === false);

    // C. 余额与战斗置灰
    await page.evaluate(() => { window.state.resources.gold = 999; window.render(); });
    const poorDisabled = await page.locator("[data-enhance-char]").evaluateAll(bs => bs.map(b => b.disabled));
    check("C1 余额不足四按钮全置灰", poorDisabled.every(Boolean), poorDisabled);
    check("C2 置灰时提示原因", (await page.locator(".character-enhance").textContent()).includes("莉莉丝元不足"));
    // 战斗中守卫：切 view 但不触发全局 render（战斗视图需完整 battle 对象，伪造会崩）。
    // 此时 DOM 里的按钮仍是上一次大厅渲染的可点状态，正好验证「绕过置灰按钮」的兜底。
    await page.evaluate(() => { window.state.resources.gold = 5000; window.render(); });
    const guarded = await page.evaluate(async () => {
      const s = window.state;
      const before = s.resources.gold;
      const prev = s.view;
      s.view = "battle";
      const btn = document.querySelector('[data-enhance-stat="magic"]');
      if (btn) btn.click();
      await new Promise(r => setTimeout(r, 200));
      const after = s.resources.gold;
      const levels = window.CharacterEnhance.levelsOf(s.chars.find(x => x.id === "lokar"));
      s.view = prev;
      return { before, after, levels, hadButton: !!btn };
    });
    check("C3 战斗中绕过按钮仍拒绝、不扣费、不加属性",
      guarded.hadButton && guarded.before === guarded.after && guarded.levels.magic === 0, guarded);
    await page.evaluate(() => { window.state.view = "hall"; window.render(); });
    const restored = await page.locator("[data-enhance-char]").evaluateAll(bs => bs.map(b => b.disabled));
    check("C4 恢复大厅后四按钮重新可点", restored.every(d => !d), restored);
    check("C5 页面无 JS 错误", errors.length === 0, errors);
  } finally {
    await browser.close();
  }
  console.log(`${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error(err); process.exit(2); });
