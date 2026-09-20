// 复现用户报的 BUG：地雷状态牌是灰的；点击后猜拳弹窗里按钮点击无反应、关闭不了（卡死）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass += 1; console.log(`✅ ${name}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? "  " + JSON.stringify(extra) : ""}`); }
};

// 埋雷 + 摆到我方出牌阶段
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  const holder = b.allies[0], src = b.enemies[0];
  src.stats = src.stats || {}; src.stats.attack = 11;
  const mine = { name: "地雷", type: "status", suit: "♠",
    landmine: true, landmineSourceUid: src.uid, landmineAttack: 11 };
  holder.hand = [mine];
  holder.hp = 80;
  b.activeUid = holder.uid; b.phase = 4; b.locked = false;
  b.landmineRpsPrompt = null;
  window.render();
  return { holder: holder.name, active: String(b.activeUid) };
})()`;

// 观察手牌区地雷牌的样式（是否灰、是否 disabled）
const cardStyleTpl = `(() => {
  const el = document.querySelector('.active-hand [data-card-index="0"]');
  if (!el) return { found: false };
  const cs = getComputedStyle(el);
  const inner = el.querySelector('.play-card') || el;
  const ics = getComputedStyle(inner);
  return { found: true, text: (el.textContent||'').slice(0,20),
    cls: el.className, innerCls: inner.className || '',
    disabledAttr: el.disabled === true,
    filter: ics.filter, opacity: ics.opacity, pointerEvents: ics.pointerEvents };
})()`;

const promptTpl = `(() => {
  const b = window.state.battle;
  const gestures = [...document.querySelectorAll('[data-landmine-rps-choice]')];
  return { prompt: !!b.landmineRpsPrompt, locked: !!b.locked,
    result: b.landmineRpsPrompt?.result || null,
    gestureCount: gestures.length,
    gestureVals: gestures.map(g => g.dataset.landmineRpsChoice),
    skipBtn: !!document.querySelector('[data-landmine-rps-skip]'),
    confirmBtn: !!document.querySelector('[data-landmine-rps-result-confirm]'),
    boxTitle: document.querySelector('.manual-dodge-box h2')?.textContent || '' };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  const run = tpl => page.evaluate(tpl);

  const setup = await run(setupTpl);
  console.log("准备:", JSON.stringify(setup));

  // 1. 地雷牌外观
  const card = await run(cardStyleTpl);
  console.log("地雷牌样式:", JSON.stringify(card));
  check("手牌区渲染出地雷牌", card.found === true, card);

  // 2. 真实点击地雷牌 → 弹窗
  await page.click('.active-hand [data-card-index="0"]');
  await page.waitForTimeout(500);
  let r = await run(promptTpl);
  console.log("弹窗:", JSON.stringify(r));
  check("点击地雷牌弹出猜拳窗口", r.prompt === true && r.locked === true, r);
  check("手势按钮 3 个且带值", r.gestureCount === 3
    && r.gestureVals.every(v => ["石头", "剪刀", "布"].includes(v)), r.gestureVals);

  // 3. 真实点击「石头」→ 应有 result
  const hasGesture = r.gestureCount > 0;
  if (hasGesture) {
    await page.click('[data-landmine-rps-choice="石头"]');
    await page.waitForTimeout(700);
  }
  r = await run(promptTpl);
  console.log("点手势后:", JSON.stringify(r));
  check("点击手势后产生 result（按钮有反应）", r.result !== null, r);

  // 4. 点确认 → 弹窗关闭、locked 解除
  if (r.confirmBtn) {
    await page.click('[data-landmine-rps-result-confirm]');
    await page.waitForTimeout(700);
  }
  r = await run(promptTpl);
  console.log("确认后:", JSON.stringify(r));
  check("确认后弹窗关闭且 locked 解除", r.prompt === false && r.locked === false, r);

  // 5. 单独测 skip 关闭
  await run(setupTpl);
  await page.waitForTimeout(300);
  await page.click('.active-hand [data-card-index="0"]');
  await page.waitForTimeout(500);
  const before = await run(promptTpl);
  check("skip 按钮存在", before.skipBtn === true, before);
  if (before.skipBtn) {
    await page.click('[data-landmine-rps-skip]');
    await page.waitForTimeout(700);
  }
  r = await run(promptTpl);
  console.log("skip 后:", JSON.stringify(r));
  check("点「暂不猜拳」能关闭弹窗并解锁",
    r.prompt === false && r.locked === false, r);

  check("页面无错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
