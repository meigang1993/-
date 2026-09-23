// 截图：7 种状态牌中 4 种"判定生效后"的单位卡标识（晕/魔/麻/冻）。
// 产物：/data/workspace/shot-status-lock-icons.png
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, openTestBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SHOT = "/data/workspace/shot-status-lock-icons.png";

async function enterBattle(page) {
  await startFreshGame(page);
  await openTestBattle(page);
  await page.evaluate(() => {
    window.state.testEnemies = [0, 1];
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = cb => cb?.();
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
    window.render();
  });
}

// 四个单位各注入一种生效状态，一图展示
const applyTpl = `(() => {
  const b = window.state.battle;
  const all = [...b.allies, ...b.enemies];
  const setup = [
    { u: all[0], kind: "stun" },
    { u: all[1], kind: "seal" },
    { u: all[2], kind: "paralysis" },
    { u: all[3], kind: "freeze" },
  ];
  setup.forEach(({ u, kind }) => {
    if (!u) return;
    u.skipPlayPhase = false; u.skipPlayReason = null;
    u.skipDrawPhase = false; u.drawLockedThisTurn = false;
    u.frozenSlash = false;
    if (kind === "stun") { u.skipPlayPhase = true; u.skipPlayReason = "眩晕"; }
    if (kind === "seal") { u.skipDrawPhase = true; u.drawLockedThisTurn = true; }
    if (kind === "paralysis") { u.skipPlayPhase = true; u.skipPlayReason = "麻痹"; }
    if (kind === "freeze") { u.frozenSlash = true; }
  });
  window.render();
  return all.slice(0, 4).map(u => ({ name: u && u.name,
    icons: u ? [...document.querySelectorAll('.unit[data-target="' + u.uid + '"] .status-icon')]
      .map(n => n.innerText.trim()) : [] }));
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await openGame(page);
  await enterBattle(page);
  const info = await page.evaluate(applyTpl);
  console.log(JSON.stringify(info));
  await page.waitForTimeout(500);
  await page.screenshot({ path: SHOT, fullPage: false });
  await browser.close();
  console.log("SHOT:", SHOT);
})();
