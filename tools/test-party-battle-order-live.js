// 真实浏览器实战：
// 1) 出战顺序必须跟随 state.party（玩家编队顺序）。旧实现用 state.chars.filter(...)，
//    顺序恒为角色表的固定定义顺序，玩家怎么调队伍进战斗都一样。
// 2) 顺带核实单位卡左下角 "x/y" 到底渲染的是什么（手牌数/上限 还是 血量），
//    避免把非血量数字误判成血量异常。
require("./repository-toolchain");
const path = require("path");
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const { openGame, startFreshGame, openTestBattle, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  try {
    await openGame(page);
    await startFreshGame(page);
    await dismissOpeningStory(page);

    // 新档只解锁了少数角色；为了覆盖 4 人编队（用户场景是 4 人），
    // 把用户提到的角色一并解锁后再编队。
    const roster = await page.evaluate(() => {
      ["lokar", "besta_doll", "loki", "carlos"].forEach(id => {
        const c = (window.state.chars || []).find(x => x.id === id);
        if (c) { delete c.locked; c.hp = c.hp || 1; }
      });
      window.render();
      return (window.state.chars || []).filter(c => !c.locked).map(c => c.id);
    });
    console.log("可出战角色:", JSON.stringify(roster));

    const want = ["lokar", "besta_doll", "loki", "carlos"];
    const picked = want.filter(id => roster.includes(id));
    console.log("本次编队:", JSON.stringify(picked));

    // 关键：故意用一个与角色表定义顺序不同的编队顺序（倒序），
    // 若战斗仍按 chars 顺序，这里必然不符。
    const partyOrder = [...picked].reverse();
    await page.evaluate(order => {
      window.state.party = order.slice(0, 4);
      window.state.testAllies = order.slice(0, 4);
      window.render();
    }, partyOrder);
    console.log("设置的 party 顺序:", JSON.stringify(partyOrder));

    const hallOrder = await page.evaluate(() => {
      window.state.hallModal = "team";
      window.render();
      return [...document.querySelectorAll(".party-avatar[data-toggle-party]")]
        .map(el => el.dataset.toggleParty);
    });
    console.log("大厅显示顺序:", JSON.stringify(hallOrder));

    await openTestBattle(page);
    await page.evaluate(() => {
      window.state.testEnemies = [0, 1];
      window.GameAssets.preloadBattle = async () => {};
      window.state.settings.battleSpeed = 2;
      window.BattleFX.playBattleStart = callback => callback?.();
      window.BattleLines.intro = () => 0;
      window.render();
    });
    const partyBeforeClick = await page.evaluate(() => window.state.party.slice());
    console.log("点击前 state.party:", JSON.stringify(partyBeforeClick));
    const onboard = await page.evaluate(() => ({
      atBattle: !!window.Onboarding?.at?.(window.state, "battle"),
      step: window.state.flags?.onboardingStep ?? window.state.onboarding?.step ?? null,
    }));
    console.log("新手引导状态:", JSON.stringify(onboard));

    await page.locator("[data-start-test-battle]").click();
    await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 60000 });
    await page.waitForFunction(() => {
      const b = window.state?.battle;
      return !!b?.allies?.length;
    }, null, { timeout: 60000 });

    const partyAfter = await page.evaluate(() => window.state.party.slice());
    console.log("战斗后 state.party:", JSON.stringify(partyAfter));
    const battleOrder = await page.evaluate(() => (window.state.battle.allies || [])
      .map(u => u.ref));
    console.log("战斗实际顺序:", JSON.stringify(battleOrder));

    const charsOrder = await page.evaluate(() => (window.state.chars || [])
      .map(c => c.id).filter(id => (window.state.party || []).includes(id)));
    console.log("角色表固定顺序:", JSON.stringify(charsOrder));

    T("A1 战斗出战顺序 = state.party 顺序",
      JSON.stringify(battleOrder) === JSON.stringify(partyOrder),
      { battleOrder, partyOrder });

    T("A2 战斗顺序 ≠ 角色表固定顺序（证明不再是 chars 顺序）",
      JSON.stringify(battleOrder) !== JSON.stringify(charsOrder),
      { battleOrder, charsOrder });

    T("A3 战斗顺序与大厅「当前挑战」显示顺序一致",
      JSON.stringify(battleOrder) === JSON.stringify(hallOrder),
      { battleOrder, hallOrder });

    const domOrder = await page.evaluate(() =>
      [...document.querySelectorAll(".unit-frame")]
        .filter(f => f.querySelector(".ally-main"))
        .map(f => f.nextElementSibling?.querySelector("b")?.textContent.trim() ?? null));
    const nameOrder = await page.evaluate(order => order.map(id => {
      const c = (window.state.chars || []).find(x => x.id === id);
      return c ? c.name : id;
    }), partyOrder);
    console.log("DOM 单位名顺序:", JSON.stringify(domOrder));
    T("A4 DOM 渲染的名字顺序 = party 顺序",
      JSON.stringify(domOrder) === JSON.stringify(nameOrder),
      { domOrder, nameOrder });

    // ---- 核实 "x/y" 到底是什么 ----
    const probe = await page.evaluate(() => {
      const u = (window.state.battle.allies || [])[0];
      if (!u) return null;
      const frame = [...document.querySelectorAll(".unit-frame")]
        .find(f => f.querySelector(".ally-main")) || document.querySelector(".unit-frame");
      const hc = frame?.querySelector(".hand-count");
      const bar = frame?.querySelector(".combat-bar");
      return {
        ref: u.ref, name: u.name,
        hp: u.hp, maxHp: u.maxHp,
        handLen: (u.hand || []).length,
        handReal: (u.hand || []).filter(c => !c._pendingDraw).length,
        pending: (u.hand || []).filter(c => c._pendingDraw).length,
        handLimit: u.stats?.handLimit,
        handCountText: hc ? hc.textContent.trim() : null,
        handCountTitle: hc ? hc.getAttribute("title") : null,
        barText: bar ? bar.textContent.trim() : null,
        barTitle: bar ? bar.getAttribute("title") : null,
      };
    });
    console.log("单位卡探针:", JSON.stringify(probe, null, 1));

    if (probe) {
      T("B1 卡上 x/y = 已发到手牌数/手牌上限（不含待发牌，不是血量）",
        probe.handCountText === `${probe.handReal}/${probe.handLimit}`,
        { handCountText: probe.handCountText,
          expect: `${probe.handReal}/${probe.handLimit}`,
          handLen: probe.handLen, pending: probe.pending });
      T("B2 血量由 combat-bar 单独渲染，值等于单位 hp",
        String(probe.barText ?? "").includes(String(probe.hp)),
        { barText: probe.barText, hp: probe.hp });
      T("B3 单位 hp 不超过 maxHp（血量本身无异常）",
        probe.hp <= probe.maxHp, { hp: probe.hp, maxHp: probe.maxHp });
      T("B4 maxHp 与角色成长档位相符（非个位数）",
        probe.maxHp >= 40, { maxHp: probe.maxHp, ref: probe.ref });
    }

    T("C1 全程无页面错误", errors.length === 0, { errors: errors.slice(0, 4) });

    console.log(`\n合计 ${pass}/${total}`);
    if (pass !== total) process.exitCode = 1;
  } catch (err) {
    console.error("运行异常:", err && err.stack || err);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
