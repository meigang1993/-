// 专项实战：7 种状态牌"判定生效后"在单位卡上是否有可见标识。
// 判定生效标志（battle-status-card-triggers.js）：
//   眩晕 → skipPlayPhase + skipPlayReason="眩晕"
//   封魔 → skipDrawPhase + drawLockedThisTurn
//   麻痹 → skipPlayPhase + skipPlayReason="麻痹"
//   冰冻 → frozenSlash
//   混乱 → 立即结算（一次性，不需要持续标识）
//   地雷/粘液 → 非判定牌，持牌时由 statuses 显示首字
// 本脚本逐个注入生效标志，检查单位卡图标、tooltip、类与灰化。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, openTestBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 自实现进入战斗：helper 的 expect.poll 固定 5s，存储抖动时会误判超时
async function enterBattle(page) {
  await startFreshGame(page);
  await openTestBattle(page);
  await page.evaluate(() => {
    window.state.testEnemies = [0, 1];
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 60000 });
  await page.waitForFunction(() =>
    !window.BattleEffects.animating
      && !window.BattleEffects.draining
      && !window.state?.battle?.animQueue?.length, null, { timeout: 60000 });
  await page.evaluate(() => {
    const battle = window.state.battle;
    window.state.settings.battleSpeed = 1;
    battle.animQueue = [];
    battle.locked = false;
    battle.phase = 4;
    battle.activeUid = battle.allies[0].uid;
    battle.allies.concat(battle.enemies)
      .forEach(unit => unit.hand.forEach(card => { delete card._pendingDraw; }));
    window.render();
    window.BattleEffects.recover(window.state);
  });
}

const cases = [
  { name: "眩晕", mark: "晕", cls: "has-stun-locked",
    apply: `u.skipPlayPhase = true; u.skipPlayReason = "眩晕";` },
  { name: "封魔", mark: "魔", cls: "",
    apply: `u.skipDrawPhase = true; u.drawLockedThisTurn = true;` },
  { name: "麻痹", mark: "麻", cls: "has-paralysis-locked",
    apply: `u.skipPlayPhase = true; u.skipPlayReason = "麻痹";` },
  { name: "冰冻", mark: "冻", cls: "",
    apply: `u.frozenSlash = true;` },
  // 持牌场景：判定成功后牌仍在手里（回合结束才消耗），检查是否与生效标记重复
  { name: "麻痹(持牌)", mark: "麻", cls: "",
    apply: `u.hand.push(window.BattleStatusCardRegistry.create("paralysis"));
            window.BattleStatusCardRegistry.sync(u, b);
            u.skipPlayPhase = true; u.skipPlayReason = "麻痹";` },
];

const applyTpl = apply => `(() => {
  const b = window.state.battle;
  const u = b.allies[0];
  u.skipPlayPhase = false; u.skipPlayReason = null;
  u.skipDrawPhase = false; u.drawLockedThisTurn = false;
  u.frozenSlash = false;
  ${apply}
  b.activeUid = u.uid; b.phase = 4; b.locked = false;
  window.render();
  return u.name;
})()`;

const checkTpl = mark => `(() => {
  const b = window.state.battle;
  const u = b.allies[0];
  const el = document.querySelector('.unit[data-target="' + u.uid + '"]');
  if (!el) return { found: false };
  const icons = [...el.querySelectorAll(".status-icons .status-icon")]
    .map(n => ({ text: n.innerText.trim(), title: n.getAttribute("title") || "" }));
  const hit = icons.find(i => i.text === "${mark}");
  return {
    found: true,
    hasMark: !!hit,
    tooltip: hit ? hit.title : null,
    icons: icons.map(i => i.text),
    unitMainFilter: getComputedStyle(el.querySelector(".unit-main")).filter,
  };
})()`;

const classTpl = cls => `(() => {
  const b = window.state.battle;
  const u = b.allies[0];
  const el = document.querySelector('.unit[data-target="' + u.uid + '"]');
  return el ? el.classList.contains("${cls}") : false;
})()`;

const clearTpl = `(() => {
  const b = window.state.battle;
  const u = b.allies[0];
  u.skipPlayPhase = false; u.skipPlayReason = null;
  u.skipDrawPhase = false; u.drawLockedThisTurn = false;
  u.frozenSlash = false;
  b.activeUid = u.uid; b.phase = 4; b.locked = false;
  window.render();
  return true;
})()`;

(async () => {
  let pass = 0; let fail = 0;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", err => errors.push(String(err)));
  try {
    await openGame(page);
    await enterBattle(page);
    for (const item of cases) {
      await page.evaluate(applyTpl(item.apply));
      const got = await page.evaluate(checkTpl(item.mark));
      const ok = got.found && got.hasMark;
      console.log(`${ok ? "✅" : "❌"} ${item.name} 单位卡显示「${item.mark}」标记`
        + `  tooltip=${JSON.stringify(got.tooltip)}  图标=${JSON.stringify(got.icons)}`);
      if (ok) pass += 1; else fail += 1;
      if (item.cls) {
        const hasCls = await page.evaluate(classTpl(item.cls));
        const filter = got.unitMainFilter;
        const gray = /grayscale/.test(filter);
        const okCls = hasCls && gray;
        console.log(`${okCls ? "✅" : "❌"} ${item.name} 单位卡 ${item.cls} 类 + 灰化  cls=${hasCls} filter=${filter}`);
        if (okCls) pass += 1; else fail += 1;
      }
    }
    await page.evaluate(clearTpl);
    const cleared = await page.evaluate(
      `(() => { const b = window.state.battle; const u = b.allies[0];
        const el = document.querySelector('.unit[data-target="' + u.uid + '"]');
        const icons = [...el.querySelectorAll(".status-icon")].map(n => n.innerText.trim());
        return { icons, cls: el.className }; })()`);
    const okClear = !cleared.icons.includes("晕") && !cleared.icons.includes("魔")
      && !cleared.icons.includes("冻") && !/has-(stun|paralysis)-locked/.test(cleared.cls);
    console.log(`${okClear ? "✅" : "❌"} 对照：清除全部生效标志后无锁定标识  icons=${JSON.stringify(cleared.icons)}`);
    if (okClear) pass += 1; else fail += 1;
  } finally {
    console.log(`页面错误: ${errors.length ? errors.join(" | ") : "none"}`);
    await browser.close().catch(() => {});
  }
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
