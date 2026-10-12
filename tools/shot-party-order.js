// 截图用：进入测试战斗，把「手牌数/上限」与「血量条」两处分别框出来，
// 用于确认玩家看到的 "x/y" 到底是不是血量。
require("./repository-toolchain");
const path = require("path");
const fs = require("fs");
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const { chromium } = require("playwright");
const { openGame, startFreshGame, openTestBattle, dismissOpeningStory } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  try {
    await openGame(page);
    await startFreshGame(page);
    await dismissOpeningStory(page);
    await page.evaluate(() => {
      ["lokar", "besta_doll", "loki", "carlos"].forEach(id => {
        const c = (window.state.chars || []).find(x => x.id === id);
        if (c) { delete c.locked; c.hp = c.hp || 1; }
      });
      // 编队顺序：罗卡尔、魔偶、洛基、卡洛斯 —— 与玩家界面一致
      window.state.party = ["lokar", "besta_doll", "loki", "carlos"];
      window.state.testAllies = ["lokar", "besta_doll", "loki", "carlos"];
      window.render();
    });
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
    await page.waitForFunction(() => !!window.state?.battle?.allies?.length,
      null, { timeout: 60000 });
    // 等发牌动画结束，让手牌数显示稳定
    await page.waitForFunction(() => {
      const b = window.state?.battle;
      return b && !window.BattleEffects?.animating && !window.BattleEffects?.draining
        && !b.animQueue?.length;
    }, null, { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.render());

    await page.screenshot({ path: "/data/workspace/shots/party-order-full.png" });

    // 单独截罗卡尔那张卡
    const lokar = await page.evaluate(() => {
      const u = (window.state.battle.allies || []).find(x => x.ref === "lokar");
      return u ? {
        hp: u.hp, maxHp: u.maxHp,
        handReal: (u.hand || []).filter(c => !c._pendingDraw).length,
        handLimit: u.stats?.handLimit,
      } : null;
    });
    const box = await page.evaluate(() => {
      const frames = [...document.querySelectorAll(".unit-frame")];
      const f = frames.find(x => {
        const name = x.nextElementSibling?.querySelector("b")?.textContent.trim();
        return name === "罗卡尔";
      });
      if (!f) return null;
      const r = f.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    });
    if (box) {
      await page.screenshot({
        path: "/data/workspace/shots/party-order-lokar.png",
        clip: { x: Math.max(0, box.x - 8), y: Math.max(0, box.y - 8),
                width: box.width + 16, height: box.height + 16 },
      });
    }
    console.log("罗卡尔:", JSON.stringify(lokar));
    console.log("errors:", JSON.stringify(errors.slice(0, 3)));
  } catch (err) {
    console.error("截图异常:", err && err.stack || err);
  } finally {
    await browser.close();
  }
})();
