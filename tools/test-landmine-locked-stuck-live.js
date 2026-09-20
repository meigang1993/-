// 复现用户报的卡死链路：
//   地雷猜拳弹窗开着时，若回合流转调用了 BattleTurnState.cleanupPrompts，
//   landmineRpsPrompt 被清空（弹窗消失）但 locked 没解除 →
//   .battle-locked 的 pointer-events:none + grayscale 让整个界面变灰、点击全失效、且无从关闭。
// 现象对应：
//   "地雷状态牌是灰"        ← grayscale(.85)
//   "按键点击没有反应"      ← pointer-events: none
//   "关闭不了卡死了"        ← 弹窗已被清空，没有可点的关闭入口
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
  return { holder: holder.name };
})()`;

const openTpl = `(() => {
  const b = window.state.battle;
  const ok = window.RuinsEnemySkills?.landmineRps?.open?.(window.state, b.allies[0]);
  window.render();
  return { opened: ok, prompt: !!b.landmineRpsPrompt, locked: !!b.locked };
})()`;

// 模拟回合流转：调用 cleanupPrompts
const cleanupTpl = `(() => {
  const b = window.state.battle;
  window.BattleTurnState?.cleanupPrompts?.(b);
  window.render();
  return { prompt: !!b.landmineRpsPrompt, locked: !!b.locked };
})()`;

const viewTpl = `(() => {
  const b = window.state.battle;
  const card = document.querySelector('.active-hand [data-card-index="0"]') || document.querySelector('.hand-panel .play-card');
  const cs = card ? getComputedStyle(card) : null;
  return {
    prompt: !!b.landmineRpsPrompt, locked: !!b.locked,
    hasLockedClass: !!document.querySelector('.battle-locked'),
    gestureCount: document.querySelectorAll('[data-landmine-rps-choice]').length,
    skipBtn: !!document.querySelector('[data-landmine-rps-skip]'),
    confirmBtn: !!document.querySelector('[data-landmine-rps-result-confirm]'),
    cardFilter: cs ? cs.filter : 'no-card',
    cardPointerEvents: cs ? cs.pointerEvents : 'no-card',
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  await page.evaluate(setupTpl);
  const opened = await page.evaluate(openTpl);
  console.log("打开弹窗:", JSON.stringify(opened));
  check("弹窗打开且 locked", opened.prompt && opened.locked, opened);

  // 关键：弹窗开着时发生回合流转
  const cleaned = await page.evaluate(cleanupTpl);
  console.log("cleanupPrompts 后:", JSON.stringify(cleaned));
  check("cleanupPrompts 清空了 prompt（弹窗消失）", !cleaned.prompt, cleaned);
  check("cleanupPrompts 后 locked 已解除（不残留）", !cleaned.locked, cleaned);

  const view = await page.evaluate(viewTpl);
  console.log("界面状态:", JSON.stringify(view));
  check("界面不再是 battle-locked 灰态", !view.hasLockedClass, view);
  check("手牌未被 grayscale 置灰", view.cardFilter === "none" || view.cardFilter === "no-card", view);
  check("手牌可点击(pointer-events 非 none)", view.cardPointerEvents !== "none", view);

  console.log(`\n页面错误: ${errors.length ? errors.join(" | ") : "none"}`);
  check("页面无错误", errors.length === 0);
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
