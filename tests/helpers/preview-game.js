// 浏览器自愈（必须在 require @playwright/test 之前执行：
// playwright 在模块加载时即解析浏览器路径，之后再设 env 无效）。
// 背景：playwright 自带 headless shell 二进制曾在 virtiofs 上损坏（I/O error），
// 且下载源被白名单拦截无法重装；系统 nix store 内有可用 chromium 142。
// /data/workspace/.pw-browsers 内的 wrapper 是持久的，但 /root/.cache 会被清空，
// 故此处每次自动重建，实现自愈。
(function ensureChromium() {
  const fs = require("fs");
  const nodePath = require("path");
  const { execSync } = require("child_process");
  let nix = "";
  try {
    nix = execSync(
      "ls -d /nix/store/*-chromium-*/bin/chromium 2>/dev/null | grep -v unwrapped | head -1"
    ).toString().trim();
  } catch (e) { /* 系统无 chromium 则跳过 */ }
  if (!nix) return;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || "/data/workspace/.pw-browsers";
  process.env.PLAYWRIGHT_BROWSERS_PATH = base;
  // revision 不能写死：机器上可能同时存在多份 playwright（仓库内、qa-deps、
  // 以及 npmrc global=true 装到 /usr/local 的那份），各自要求的浏览器目录版本不同
  // （实测 1.61 → 1228、1.63 → 1243）。写死会在升级后集体报 "Executable doesn't exist"。
  const revisions = new Set();
  [
    nodePath.join(__dirname, "../../node_modules/playwright-core"),
    "/data/workspace/qa-deps/node_modules/playwright-core",
    "/usr/local/lib/node_modules/playwright/node_modules/playwright-core",
    "/usr/local/lib/node_modules/playwright-core",
  ].forEach(core => {
    try {
      const list = JSON.parse(fs.readFileSync(nodePath.join(core, "browsers.json"), "utf8")).browsers;
      (list || []).filter(b => /^chromium(-headless-shell)?$/.test(b.name))
        .forEach(b => revisions.add(b.revision));
    } catch (e) { /* 该位置未安装则跳过 */ }
  });
  if (!revisions.size) revisions.add("1228");
  const roots = [base, "/root/.cache/ms-playwright"];
  revisions.forEach(rev => {
    [
      `chromium_headless_shell-${rev}/chrome-headless-shell-linux64/chrome-headless-shell`,
      `chromium-${rev}/chrome-linux64/chrome`,
    ].forEach(rel => roots.forEach(root => {
      const target = nodePath.join(root, rel);
      try {
        fs.mkdirSync(nodePath.dirname(target), { recursive: true });
        fs.writeFileSync(target, `#!/bin/sh\nexec ${nix} --no-sandbox --disable-dev-shm-usage "$@"\n`);
        fs.chmodSync(target, 0o755);
      } catch (e) { /* 只读或其他异常则忽略，交由外层 wrapper 兜底 */ }
    }));
  });
})();

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
    // context.setOffline() 对 file:// 页面不生效（chromium 142 实测 navigator.onLine 仍为 true），
    // 而启动流程会据此走在线分支，故在此直接固定为离线，与既有测试假设保持一致。
    try {
      Object.defineProperty(navigator, "onLine", { get: () => false, configurable: true });
    } catch (e) { /* 部分环境 navigator 不可重定义则忽略 */ }
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

async function expectImagesLoaded(locator) {
  await expect.poll(() => locator.evaluateAll(images =>
    images.length > 0 && images.every(image => image.complete
      && image.naturalWidth > 0 && image.naturalHeight > 0))).toBe(true);
}

async function startFreshGame(page) {
  await page.locator("[data-start-game]").click();
  await expect(page.locator(".villa-hall")).toBeVisible();
  await expect(page.locator("[data-open-modal='team']")).toBeVisible();
}

async function openTestBattle(page) {
  await page.evaluate(() => {
    window.state.hallModal = "testBattle";
    window.render();
  });
  await page.locator("[data-start-test-battle]").waitFor({ state: "visible" });
}

async function startRegressionBattle(page) {
  await openGame(page);
  await enterRegressionBattle(page);
}

async function enterRegressionBattle(page) {
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
  collectErrors, relevantErrors, openGame, waitForImages, expectImagesLoaded, startFreshGame,
  openTestBattle, startRegressionBattle, enterRegressionBattle, prepareAoeLineCapture,
  capturedAoeLineCount,
};
