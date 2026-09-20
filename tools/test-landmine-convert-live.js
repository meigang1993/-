// 验证两处修复：
//  A) 放置地雷「转换」语义：目标手牌数不变（原牌被替换为地雷），来源方不弃自己的牌
//  B) 地雷状态牌在手牌区不再置灰（可点击发起猜拳）
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

// 构造：actor 为士兵(ai=ruins_soldier)，target 手牌 3 张普通牌
const beforeTpl = `(() => {
  const st = window.state, b = st.battle;
  const actor = b.enemies[0], target = b.allies[0];
  actor.ai = "ruins_soldier";
  actor.usedRuinsLandmine = false;
  actor.stats = actor.stats || {}; actor.stats.attack = 11;
  const mk = (n, s) => ({ name: n, type: "slash", suit: s, text: "" });
  target.hand = [mk("杀", "♠"), mk("杀", "♥"), mk("闪", "♦")];
  target.hp = 80;
  b.activeUid = actor.uid;
  window.__target = target; window.__actor = actor;
  window.render();
  return { actorHand: actor.hand.length, targetHand: target.hand.length,
    names: target.hand.map(c => c.name) };
})()`;

const doMineTpl = `(() => {
  const st = window.state;
  const actor = window.__actor, target = window.__target;
  const ok = window.RuinsGruntSkills?.usePlaceLandmine?.(st, actor, target);
  window.render();
  const hasMine = (target.hand || []).some(c =>
    window.BattleStatusCards?.keyOf?.(c) === "landmine");
  return { ok, actorHand: actor.hand.length, targetHand: target.hand.length,
    hasMine, names: target.hand.map(c => c.name),
    log: (window.state.log || []).slice(0, 3).map(String) };
})()`;

// 地雷牌外观（不置灰）
const cardTpl = `(() => {
  const st = window.state, b = st.battle;
  b.activeUid = b.allies[0].uid; b.phase = 4; b.locked = false;
  window.render();
  const els = [...document.querySelectorAll('.active-hand [data-card-index]')];
  const mine = els.find(e => (e.textContent || '').includes('地雷'));
  if (!mine) return { found: false };
  const cs = getComputedStyle(mine);
  return { found: true, cls: mine.className,
    hasDisabledClass: /\\bdisabled\\b/.test(mine.className),
    filter: cs.filter, opacity: cs.opacity };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);
  const run = tpl => page.evaluate(tpl);

  // --- A) 转换语义 ---
  const before = await run(beforeTpl);
  console.log("埋雷前:", JSON.stringify(before));
  const after = await run(doMineTpl);
  console.log("埋雷后:", JSON.stringify(after));

  check("埋雷执行成功", after.ok === true, after);
  check("目标获得地雷状态牌", after.hasMine === true, after);
  check("目标手牌数不变（转换而非新增）",
    after.targetHand === before.targetHand, { before: before.targetHand, after: after.targetHand });
  check("来源方不弃自己的手牌",
    after.actorHand === before.actorHand, { before: before.actorHand, after: after.actorHand });
  check("日志写明转换", (after.log || []).some(t => /转换为【地雷】/.test(String(t))), after.log);

  // --- B) 不置灰 ---
  // 地雷加入时带 _pendingDraw，需等发牌动画清除后才在手牌区渲染
  await page.waitForTimeout(2500);
  const card = await run(cardTpl);
  console.log("地雷牌外观:", JSON.stringify(card));
  check("手牌区能找到地雷牌", card.found === true, card);
  check("地雷牌不再带 disabled 类（不置灰）", card.hasDisabledClass === false, card);
  check("地雷牌 filter 不是 grayscale（不灰化）",
    card.found && !/grayscale/.test(card.filter || ""), card);

  check("页面无错误", errors.length === 0, errors.slice(0, 3));
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail === 0 ? 0 : 1);
})();
