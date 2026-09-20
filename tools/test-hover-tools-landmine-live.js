// 实战复现两个问题：
//  A) 鼠标 hover 到最右侧（4号位）敌方角色时，右上角 battle-tools 两个按钮被遮挡消失
//  B) 贵族军士兵在玩家手牌无响应牌（闪）时，不主动发动放置地雷
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const results = [];
const ok = (name, pass, info) => {
  results.push({ name, pass, info });
  console.log(`${pass ? "✅" : "❌"} ${name}${info ? "   " + JSON.stringify(info) : ""}`);
};

// ---------- A) hover 遮挡 ----------
// 判定：取按钮中心点做 elementFromPoint，看命中的是否仍是按钮（未被 unit 盖住）
const probeRetreat = `(() => {
  const el = document.querySelector('.battle-retreat');
  if (!el) return { count: 0 };
  const r = el.getBoundingClientRect();
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  let hit = 'none';
  if (!top) hit = 'none';
  else if (top === el || el.contains(top)) hit = 'self';
  else if (top.closest && top.closest('.unit')) hit = 'unit';
  else hit = top.className || top.tagName;
  return { count: 1, hits: [hit],
    z: getComputedStyle(el).zIndex };
})()`;

const probeTools = `(() => {
  const btns = [...document.querySelectorAll('.battle-tools .battle-tool-button')];
  if (!btns.length) return { count: 0 };
  const hit = el => {
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    if (!top) return 'none';
    if (top === el || el.contains(top)) return 'self';
    if (top.closest && top.closest('.unit')) return 'unit';
    return top.className || top.tagName;
  };
  return { count: btns.length, hits: btns.map(hit),
    z: getComputedStyle(document.querySelector('.battle-tools')).zIndex };
})()`;

// ---------- B) 士兵地雷 AI ----------
// 构造：玩家手牌 {withDodge: 含闪 / without: 全是杀}，看 AI 是否返回放置地雷
const landmineTpl = (withDodge) => `(() => {
  const b = window.state.battle;
  const e = b.enemies[0];
  e.ai = "ruins_soldier";
  e.name = "贵族军士兵";
  e.stats = e.stats || {}; e.stats.attack = 11;
  e.hp = 64;
  e.usedRuinsLandmine = false;
  // 士兵自己要有牌才能弃置埋雷
  e.hand = [{ name: "杀", type: "slash", suit: "♠" },
            { name: "杀", type: "slash", suit: "♣" }];
  // 玩家手牌：一组含闪，一组不含
  b.allies.forEach(u => {
    u.hp = 200;
    u.stats = u.stats || {}; u.stats.handLimit = 99;
    u.hand = ${withDodge}
      ? [{ name: "闪", type: "response", suit: "♥", responseKind: "dodge" },
         { name: "杀", type: "slash", suit: "♠" }]
      : [{ name: "杀", type: "slash", suit: "♠" },
         { name: "杀", type: "slash", suit: "♣" }];
  });
  const move = window.RuinsEnemySkills?.aiMove?.(window.state, e, [], b.allies, e.hand,
    () => true, {});
  return { move: move?.card?.name || null, target: move?.target?.name || null };
})()`;

(async () => {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await openGame(page);
  await startRegressionBattle(page);

  console.log("\n===== A) hover 最右侧敌方角色时右上角按钮是否消失 =====\n");
  // 确保敌方有 4 个单位（4 号位 = 最右）
  const enemyCount = await page.evaluate(`(() => {
    const b = window.state.battle;
    if (!b) return -1;
    // 副本场景（非 test）下撤退按钮用基础层级 18，一并验证同类遮挡
    b.test = false;
    const mis = window.GameData?.missions?.find?.(m => m.id === b.missionId);
    if (mis) mis.kind = "dungeon";
    while (b.enemies.length < 4) {
      const src = b.enemies[0];
      b.enemies.push(JSON.parse(JSON.stringify(src)));
    }
    b.enemies.forEach((u, i) => { u.uid = u.uid || ('e' + i); u.hp = 60; });
    window.render();
    return b.enemies.length;
  })()`);
  console.log(`敌方单位数: ${enemyCount}`);

  // 基线：不 hover 任何单位
  const base = await page.evaluate(probeTools);
  ok("基线：未 hover 时两个按钮可命中",
    base.count === 2 && base.hits.every(h => h === "self"), base);

  // hover 最右侧（最后一个）敌方单位
  const lastUnit = page.locator(".enemy-row .unit").last();
  const box = await lastUnit.boundingBox();
  if (!box) {
    ok("能取到最右侧敌方单位的包围盒", false, {});
  } else {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(320);
    const hov = await page.evaluate(probeTools);
    const covered = hov.hits.filter(h => h !== "self");
    ok(`hover 最右侧敌方后按钮仍可命中（当前 z-index=${hov.z}）`,
      hov.hits.length === 2 && covered.length === 0, hov);
    if (covered.length) {
      console.log(`   → 被遮挡：${JSON.stringify(hov.hits)}`);
    }
    // 移开后应恢复
    await page.mouse.move(5, 500);
    await page.waitForTimeout(320);
    const away = await page.evaluate(probeTools);
    ok("移开鼠标后按钮恢复可命中", away.hits.every(h => h === "self"), away);
  }

  // 左上角「撤退」按钮：hover 最左侧敌方单位时是否同样被遮挡
  const rBase = await page.evaluate(probeRetreat);
  if (rBase.count) {
    ok("基线：未 hover 时撤退按钮可命中", rBase.hits[0] === "self", rBase);
    const firstUnit = page.locator(".enemy-row .unit").first();
    const fbox = await firstUnit.boundingBox();
    if (fbox) {
      await page.mouse.move(fbox.x + fbox.width / 2, fbox.y + fbox.height / 2);
      await page.waitForTimeout(320);
      const rh = await page.evaluate(probeRetreat);
      ok(`hover 最左侧敌方后撤退按钮仍可命中（当前 z-index=${rh.z}）`,
        rh.hits[0] === "self", rh);
      await page.mouse.move(5, 500);
      await page.waitForTimeout(320);
    }
  } else {
    console.log("（本场无撤退按钮，跳过该项）");
  }

  console.log("\n===== B) 贵族军士兵是否主动放置地雷 =====\n");
  for (const [label, withDodge] of [["玩家手牌含闪", true], ["玩家手牌无闪（全杀）", false]]) {
    const r = await page.evaluate(landmineTpl(withDodge));
    ok(`${label} → AI 应返回放置地雷`, r.move === "放置地雷", r);
  }

  console.log("\n========================================");
  const pass = results.filter(r => r.pass).length;
  console.log(`汇总：${pass}/${results.length} 通过`);
  console.log(`页面错误: ${errors.length ? errors.slice(0, 3).join(" | ") : "none"}`);
  await browser.close();
  process.exit(pass === results.length && !errors.length ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
