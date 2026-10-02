// 新手引导首战胜利：经验只发给实际参战角色（浏览器）
// 覆盖：
//   1. 首战仅罗卡尔出战，贝丝妲魔偶不入场
//   2. 首战胜利结算后，经验/等级只记给罗卡尔，魔偶不变
//   3. lastReward.progression 不含贝丝妲魔偶
//   4. 首战胜利后奖励确认 → 强制回大厅、魔偶解锁并回到队伍
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const {openGame, startFreshGame, dismissOpeningStory} = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });

  await openGame(page);
  await startFreshGame(page);
  // 新档会先弹开场剧情（凯瑟琳 × 罗卡尔），看完才能操作大厅 UI。
  await dismissOpeningStory(page);

  // ---------- 进入首战 ----------
  await page.locator("[data-open-modal='team']").click();
  await page.locator(".difficulty-card").first().waitFor({ state: "visible" });
  await page.locator("[data-start='machine_factory'][data-difficulty='normal']").first().click();
  await page.locator(".map-node").first().waitFor({ state: "visible" });
  await page.locator(".onboarding-recommend").first().click();
  await page.locator(".battle-screen").first().waitFor({ state: "visible" });
  await page.waitForFunction(() => !!window.state?.battle);

  const allies = await page.evaluate(() =>
    window.state.battle.allies.map(a => ({ id: a.ref, name: a.name })));
  T("首战仅罗卡尔一人出战", allies.length === 1 && allies[0].id === "lokar", allies);
  T("首战魔偶未入场", !allies.some(a => a.id === "besta_doll"), allies);

  // 战前经验快照
  const snap = () => page.evaluate(() => {
    const get = id => {
      const c = window.state.chars.find(x => x.id === id);
      return { level: c.level, exp: c.exp, locked: !!c.locked };
    };
    return { lokar: get("lokar"), doll: get("besta_doll") };
  });
  const before = await snap();
  T("战前魔偶未锁定（首战只是不入场）", before.doll.locked === false, before.doll);

  // ---------- 强制胜利结算 ----------
  const win = await page.evaluate(async () => {
    const state = window.state, battle = state.battle;
    battle.defeatedEnemyIds = battle.enemies.map(e => e.id).filter(Boolean);
    battle.enemies.forEach(e => { e.hp = 0; });
    const ok = await window.DungeonNodeRewards.completeBattle(state, true);
    window.render?.();
    return { ok, enemyIds: battle.defeatedEnemyIds };
  });
  T("首战胜利结算成功", win.ok === true, win);

  await page.waitForFunction(() => window.state?.view === "dungeon", null, { timeout: 25000 });
  await page.waitForTimeout(500);

  const after = await page.evaluate(() => {
    const get = id => {
      const c = window.state.chars.find(x => x.id === id);
      return { level: c.level, exp: c.exp, locked: !!c.locked };
    };
    const run = window.state.explore;
    return {
      lokar: get("lokar"),
      doll: get("besta_doll"),
      progression: (run?.lastReward?.progression || []).map(p => ({ id: p.id, levelsGained: p.levelsGained })),
      experience: run?.lastReward?.experience || 0,
      step: window.state.flags?.onboarding?.step,
      completed: window.state.flags?.onboarding?.completed,
    };
  });

  T("胜利后引导推进到 reward 步骤", after.step === "reward", { step: after.step });
  T("节点经验奖励大于 0", after.experience > 0, after);
  T("经验名单只含罗卡尔", after.progression.length > 0
    && after.progression.every(p => p.id === "lokar"), after.progression);
  T("经验名单不含贝丝妲魔偶",
    !after.progression.some(p => p.id === "besta_doll"), after.progression);
  T("魔偶等级未变化", after.doll.level === before.doll.level, { before: before.doll, after: after.doll });
  T("魔偶经验未变化", after.doll.exp === before.doll.exp, { before: before.doll, after: after.doll });
  T("罗卡尔获得经验（等级或经验变化）",
    after.lokar.level > before.lokar.level || after.lokar.exp !== before.lokar.exp,
    { before: before.lokar, after: after.lokar });

  // ---------- 奖励确认：首战胜利强制回大厅并解锁魔偶 ----------
  await page.locator("[data-reward-confirm]").first().click();
  await page.waitForFunction(() => window.state?.view === "hall", null, { timeout: 25000 });
  await page.waitForTimeout(400);

  const hall = await page.evaluate(() => {
    const c = window.state.chars.find(x => x.id === "besta_doll");
    return {
      locked: !!c.locked,
      party: window.state.party,
      completed: !!window.state.flags?.onboarding?.completed,
      view: window.state.view,
    };
  });
  T("首战胜利后回到大厅", hall.view === "hall", hall);
  T("首战胜利后魔偶已解锁", hall.locked === false, hall);
  T("首战胜利后魔偶在出战队伍", hall.party.includes("besta_doll"), hall);
  T("首战胜利后引导完成", hall.completed === true, hall);

  const relevant = errors.filter(t => !/favicon|ResizeObserver loop/.test(t));
  T("页面无 JS 错误", relevant.length === 0, relevant.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("脚本异常:", e.message, e.stack); process.exit(2); });
