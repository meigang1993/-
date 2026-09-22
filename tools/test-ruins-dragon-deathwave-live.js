// 专项实战：机械AI龙【死亡音波】三项回归（真实浏览器 + 真实钩子）
//   1) 头像徽章不得被拉伸撑满（曾因 left/bottom 与基类 right/top 同时生效，撑成 78×100）
//   2) 记录 1-3 种花色时，用上其中任一即免伤（曾为「任一未使用即受伤」，用一种也挨打）
//   3) 龙自己回合开始时清空上一轮记录（曾导致徽章常驻、跨轮残留）
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const D = 1;

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

const tpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[${D}];
  e.ai = "ruins_dragon"; e.name = "机械AI龙";
  e.stats = e.stats || {}; e.stats.attack = 13; e.hp = 342;
  const a = b.allies[0];
  const out = {};

  // --- 1) 徽章尺寸 ---
  e.ruinsDeathWaveSuits = ["♥"]; e.ruinsDeathWaveSuit = null;
  window.render();
  const el = document.querySelector(".death-wave-badge");
  if (el) {
    const r = el.getBoundingClientRect();
    out.badge = { w: Math.round(r.width), h: Math.round(r.height), text: el.textContent.trim() };
  } else out.badge = null;

  // --- 2) 记录 3 种花色，只用了 1 种 → 免伤 ---
  e.ruinsDeathWaveSuits = ["♥", "♦", "♠"];
  a.hp = 300; a.suitsUsedThisTurn = { "♥": true };
  window.RuinsEnemySkills.endTurn(window.state, a);
  out.usedOneOfThree = a.hp;

  // --- 2b) 记录 3 种花色，全部未用 → 受伤 13 ---
  a.hp = 300; a.suitsUsedThisTurn = {};
  window.RuinsEnemySkills.endTurn(window.state, a);
  out.usedNone = a.hp;

  // --- 2c) 记录 1 种，用了 → 免伤 ---
  e.ruinsDeathWaveSuits = ["♥"];
  a.hp = 300; a.suitsUsedThisTurn = { "♥": true };
  window.RuinsEnemySkills.endTurn(window.state, a);
  out.singleUsed = a.hp;

  // --- 2d) 记录 1 种，未用 → 受伤 ---
  a.hp = 300; a.suitsUsedThisTurn = {};
  window.RuinsEnemySkills.endTurn(window.state, a);
  out.singleUnused = a.hp;

  // --- 3) 龙回合开始清空记录 ---
  e.ruinsDeathWaveSuits = ["♥", "♦", "♠"];
  window.RuinsEnemySkills.prepare(window.state, e);
  out.afterPrepare = JSON.stringify(e.ruinsDeathWaveSuits);

  // --- 3b) 清空后徽章不再渲染 ---
  window.render();
  out.badgeAfterClear = !!document.querySelector(".death-wave-badge");
  return out;
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  let pass = 0, total = 0;
  const T = (n, c, x) => { total++; pass += check(n, c, x); };

  const r = await page.evaluate(tpl);
  console.log("实测:", JSON.stringify(r));
  console.log("--- 死亡音波回归 ---");

  T("徽章已渲染", !!r.badge && r.badge.text.indexOf("音波") === 0, r.badge);
  T("徽章未被拉伸（宽<80）", !!r.badge && r.badge.w < 80, r.badge);
  T("徽章未被拉伸（高<30）", !!r.badge && r.badge.h < 30, r.badge);
  T("记录3种·用1种 → 免伤", r.usedOneOfThree === 300, r.usedOneOfThree);
  T("记录3种·全未用 → 受伤13", r.usedNone === 287, r.usedNone);
  T("记录1种·已用 → 免伤", r.singleUsed === 300, r.singleUsed);
  T("记录1种·未用 → 受伤13", r.singleUnused === 287, r.singleUnused);
  T("龙回合开始清空记录", r.afterPrepare === "[]", r.afterPrepare);
  T("清空后徽章不再显示", r.badgeAfterClear === false, r.badgeAfterClear);
  T("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  console.log(`\n=== ${pass}/${total} 通过 ===`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
