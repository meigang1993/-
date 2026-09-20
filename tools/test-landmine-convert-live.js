// 验证两处修复：
//  A) 放置地雷「埋设」语义（对齐 baseline）：目标手牌数 +1（新增一颗地雷），来源方弃置自己一张牌
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
  check("目标手牌数 +1（新增地雷，非转换）",
    after.targetHand === before.targetHand + 1, { before: before.targetHand, after: after.targetHand });
  check("来源方弃置自己一张牌",
    after.actorHand === before.actorHand - 1, { before: before.actorHand, after: after.actorHand });
  check("日志写明埋设（非转换）", (after.log || []).some(t => /埋设一颗地雷/.test(String(t))), after.log);

  // --- B) 不置灰 ---
  // 地雷加入时带 _pendingDraw，需等发牌动画清除后才在手牌区渲染
  // 固定等待不稳定（发牌动画时长不定），改为轮询，最多等 10s
  let card = { found: false };
  for (let i = 0; i < 25; i += 1) {
    card = await run(cardTpl);
    if (card.found) break;
    await page.waitForTimeout(400);
  }
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
