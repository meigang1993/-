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

// 新档开场剧情（凯瑟琳 × 罗卡尔）会盖在大厅上，拦截对 [data-open-modal] 的点击。
// 需要直接操作大厅 UI 的用例先调用它把剧情看完并关闭。
// 全部走 DOM click：Playwright 的 hit-target 在页面持续 re-render 时会误报被拦截。
async function dismissOpeningStory(page) {
  // 剧情类弹窗：只有这些还开着时才继续处理，避免误把队伍面板之类也关掉或死循环
  const STORY = /intro|victory|defeat|unlock|story|dialogue/i;
  // 点「开始游戏」后剧情是异步渲染的，先等它出现；否则第一轮就会误判成"已关闭"而直接退出
  await page.waitForSelector(".adv-box, .villa-modal", { timeout: 5000 }).catch(() => {});
  let idle = 0;
  for (let i = 0; i < 30; i++) {
    const adv = await page.locator(".adv-box").count();
    const modal = await page.evaluate(() => window.state?.hallModal || null);
    // 没有 ADV 框、且大厅弹窗为空或非剧情态 → 可能已清理干净，连续两轮如此才收工
    if (!adv && (!modal || !STORY.test(modal))) {
      if (++idle >= 2) break;
      await page.waitForTimeout(250);
      continue;
    }
    idle = 0;
    if (await page.locator("[data-adv-skip]").count()) {
      await page.evaluate(() => { window.AdvDialogue?.skip?.(); window.render?.(); });
      await page.waitForTimeout(250);
      continue;
    }
    const done = page.locator([
      "[data-new-game-intro-complete]", "[data-first-victory-complete]",
      "[data-first-defeat-complete]", "[data-close-modal]",
    ].join(",")).first();
    if (await done.count()) {
      await done.evaluate(el => el.click()).catch(() => {});
      await page.waitForTimeout(300);
      continue;
    }
    const box = page.locator(".adv-box[data-adv-advance]").first();
    if (await box.count()) {
      await box.evaluate(el => el.click()).catch(() => {});
      await page.waitForTimeout(250);
      continue;
    }
    // 剧情还在但 render 异步导致暂时无可点元素，稍等再试
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(300);
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
  dismissOpeningStory,
  collectErrors, relevantErrors, openGame, waitForImages, expectImagesLoaded, startFreshGame,
  openTestBattle, startRegressionBattle, enterRegressionBattle, prepareAoeLineCapture,
  capturedAoeLineCount,
};
