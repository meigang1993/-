const path = require("path");
const { expect } = require("@playwright/test");

const gameUrl = `file://${path.resolve(__dirname, "../../publish/index.html")}`;

function collectErrors(page) {
  const errors = [];
  page.on("console", message => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", error => errors.push(error.message));
  return errors;
}

function relevantErrors(errors) {
  return errors.filter(text => !/favicon|ResizeObserver loop/.test(text));
}

async function openGame(page, options = {}) {
  await page.context().setOffline(true);
  await page.addInitScript(() => {
    let value = 2971485;
    Math.random = () => {
      value = (value * 1664525 + 1013904223) >>> 0;
      return value / 4294967296;
    };
  });
  await page.goto(gameUrl);
  await page.locator("#view").waitFor({ state: "visible" });
  await expect.poll(() => page.evaluate(() => ({
    online: navigator.onLine,
    dzmm: typeof window.dzmm,
  }))).toEqual({ online: false, dzmm: "undefined" });
  await expect(page.locator("#view")).toContainText(/魅魔杀|启动失败|正在进入/);
  await expect(page.locator("[data-start-game]")).toBeVisible();
  await expect(page.locator("[data-start-continue]")).toHaveCount(0);
  await expect(page.locator("[data-start-game]")).toHaveText("✦新游戏");
  await expect(page.locator("[data-start-load]")).toHaveText("◆读档");
  await expect(page.locator("[data-start-settings]")).toHaveText("⚙设置");
  await expect(page.locator("[data-start-exit]")).toHaveCount(0);
  await expect(page.locator("[data-open-credits]")).toHaveText("❦制作名单");
  await expect(page.locator("[data-entry-mode]")).toHaveCount(0);
  if (options.loadFeatures !== false) {
    await page.evaluate(() => Promise.all([
      window.GameBundles.load("battle"),
      window.GameBundles.load("dungeon"),
    ]));
  }
}

async function waitForImages(page) {
  await page.waitForFunction(() => [...document.images].every(image => image.complete));
}

async function startFreshGame(page) {
  await page.locator("[data-start-game]").click();
  await expect(page.locator(".villa-hall")).toBeVisible();
  await expect(page.locator("[data-open-modal='team']")).toBeVisible();
}

async function startRegressionBattle(page) {
  await openGame(page);
  await enterRegressionBattle(page);
}

async function enterRegressionBattle(page) {
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await page.evaluate(() => {
    window.state.testEnemies = [0, 1];
    window.GameAssets.preloadBattle = async () => {};
    window.state.settings.battleSpeed = 2;
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await expect.poll(() => page.evaluate(() =>
    !window.BattleEffects.animating
      && !window.BattleEffects.draining
      && !window.state?.battle?.animQueue?.length
  )).toBe(true);
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

async function prepareAoeLineCapture(page, key) {
  await page.evaluate(captureKey => {
    const capture = {};
    capture.ready = new Promise(resolve => {
      const observer = new MutationObserver(records => {
        const count = records.reduce((total, record) => total + [...record.addedNodes]
          .filter(node => node.nodeType === Node.ELEMENT_NODE
            && node.matches?.(".target-line.aoe-line.show")).length, 0);
        if (!count) return;
        capture.count = count;
        observer.disconnect();
        resolve();
      });
      observer.observe(document.body, { childList: true });
    });
    window[captureKey] = capture;
  }, key);
}

async function capturedAoeLineCount(page, key) {
  return page.evaluate(async captureKey => {
    await window[captureKey].ready;
    return window[captureKey].count;
  }, key);
}

module.exports = {
  collectErrors, relevantErrors, openGame, waitForImages, startFreshGame,
  startRegressionBattle, enterRegressionBattle, prepareAoeLineCapture, capturedAoeLineCount,
};
