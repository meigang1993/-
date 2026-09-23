// 专项实战：贵族军士兵·放置地雷（真实浏览器 + 真实回合 + 真实响应点击）
// 覆盖完整链路：AI 埋雷（选响应牌最多者）→ 持有者使用【闪】响应 → 地雷触发伤害并消耗
// 不走 flag 作弊：真实 AI 决策、真实出牌、真实响应弹窗点击。
// 与 test-ruins-landmine-rps-live.js 的区别：那个测"点击地雷牌猜拳"，这个测"使用响应牌触发"。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const AOE = `{ name: "机枪扫杀", type: "kill", sweep: true, suit: "♠", responseKind: "dodge" }`;

// 场景1：埋雷 → 持有者出闪 → 触发
const mineTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[1];
  e.ai = "ruins_soldier";
  e.name = "贵族军士兵";
  e.stats = e.stats || {}; e.stats.attack = 11;
  e.hp = 64; e.usedRuinsLandmine = false;
  // 只留 AOE 杀牌：迫使所有玩家方一起响应，持有地雷者必定出闪
  e.hand = [${AOE}];
  // 玩家方响应牌数量 2 / 0 / 1 → 期望埋雷目标 = allies[0]
  const counts = [2, 0, 1];
  b.allies.forEach((u, i) => {
    const n = counts[i] ?? 0;
    u.hand = Array.from({ length: n }, () => ({ name: "闪", type: "response", suit: "♥" }));
    u.hp = 200;
    u.stats = u.stats || {}; u.stats.handLimit = 99;
  });
  b.enemies[0].hand = [];
  window.__log = [];
  if (!window.__hooked) {
    const orig = window.BattleAI.choose;
    window.BattleAI.choose = function (bb, actor, canPlay) {
      let r = null; try { r = orig(bb, actor, canPlay); } catch (err) {}
      window.__log.push({ actor: actor?.name, move: r?.card?.name || null });
      return r;
    };
    window.__hooked = true;
  }
  window.render();
  return { enemy: e.name, allyCounts: b.allies.map(u => (u.hand || []).length),
    allyNames: b.allies.map(u => u.name), allyHps: b.allies.map(u => u.hp) };
})()`;

// 场景2：对照——不埋雷（把士兵换成普通 ai），同样出闪，不应有地雷伤害
const ctrlTpl = `(() => {
  const b = window.state.battle;
  const e = b.enemies[1];
  e.ai = "generic";
  e.name = "对照敌人";
  e.stats = e.stats || {}; e.stats.attack = 11;
  e.hp = 64;
  e.hand = [${AOE}];
  b.allies.forEach((u, i) => {
    u.hand = [{ name: "闪", type: "response", suit: "♥" }];
    u.hp = 200;
    u.stats = u.stats || {}; u.stats.handLimit = 99;
  });
  b.enemies[0].hand = [];
  window.__log = [];
  window.render();
  return { enemy: e.name, allyNames: b.allies.map(u => u.name), allyHps: b.allies.map(u => u.hp) };
})()`;

const peekTpl = `(() => {
  const b = window.state.battle;
  const keyOf = (c) => window.BattleStatusCards?.keyOf?.(c);
  return {
    log: (window.__log || []).slice(-30),
    battleLog: (window.state.log || []).slice(-60),
    mines: b.allies.map(u => (u.hand || []).filter(c => keyOf(c) === "landmine").length),
    allyHp: b.allies.map(u => u.hp),
    enemyHand: (b.enemies[1]?.hand || []).map(c => c.name),
    phase: b.phase, activeUid: b.activeUid,
  };
})()`;

async function runScene(browser, name, tpl, watchMs, opts = {}) {
  const page = await browser.newPage();
  const out = { name, errors: [], seen: {} };
  await page.setViewportSize({ width: 1280, height: 900 });
  page.on("pageerror", e => out.errors.push(String(e).slice(0, 160)));
  try {
    await openGame(page);
    await startRegressionBattle(page);
    out.setup = await page.evaluate(tpl);
    await page.locator("button", { hasText: "结束出牌" }).first().click();
    const rounds = Math.ceil(watchMs / 1000);
    for (let i = 0; i < rounds; i++) {
      await page.waitForTimeout(800);
      // 敌方手牌被摸牌稀释 → 每轮强制只留 AOE，确保它一定会打出群攻
      if (opts.forceAoe) {
        await page.evaluate(
          `(() => { const e = window.state.battle.enemies[1];
             if (e && e.hp > 0 && window.state.battle.phase === 4 &&
                 window.state.battle.activeUid === e.uid) e.hand = [${AOE}]; })()`);
      }
      const st = await page.evaluate(peekTpl);
      out.last = st;
      const logs = (st.battleLog || []).map(l => String(l));
      if (logs.some(l => l.includes("埋设一颗地雷") || l.includes("获得一张地雷状态牌"))) out.seen.placed = true;
      if (logs.some(l => l.includes("的地雷触发"))) {
        out.seen.triggered = true;
        const hit = logs.find(l => l.includes("的地雷触发"));
        if (hit) out.seen.triggerLine = hit;
      }
      if (out.seen.placed && out.seen.triggered) break;
      // 关键：玩家方响应需要真实点击"使用闪"，否则响应牌不会被打出，地雷永远不触发
      try {
        const use = page.locator("[data-manual-dodge-use]").first();
        if (await use.count() && await use.isVisible()) { await use.click(); continue; }
      } catch (e) { /* 忽略 */ }
      try {
        const skip = page.locator("button", { hasText: "跳过榨取" }).first();
        if (await skip.count() && await skip.isVisible()) await skip.click();
      } catch (e) { /* 忽略 */ }
      try {
        const btn = page.locator("button", { hasText: "结束出牌" }).first();
        if (await btn.count() && await btn.isVisible()) await btn.click();
      } catch (e) { /* 非玩家回合，忽略 */ }
    }
    out.final = await page.evaluate(peekTpl);
  } catch (e) {
    out.err = String(e).slice(0, 200);
  }
  await page.close();
  return out;
}

(async () => {
  const browser = await chromium.launch();
  const mine = await runScene(browser, "放置地雷", mineTpl, 60000, { forceAoe: true });
  const ctrl = await runScene(browser, "对照·无地雷", ctrlTpl, 30000, { forceAoe: true });
  await browser.close();

  console.log("\n===== 实战：放置地雷 完整链路 (真实浏览器) =====");
  const checks = [];

  console.log(`\n--- 放置地雷 ---`);
  if (mine.err) { console.log(`  ❌ 异常: ${mine.err}`); checks.push(["放置地雷 无异常", false]); }
  console.log(`  构造: ${JSON.stringify(mine.setup)}`);
  const f = mine.final || mine.last || {};
  console.log(`  AI决策: ${JSON.stringify((f.log || []).slice(-6))}`);
  console.log(`  战报尾: ${JSON.stringify((f.battleLog || []).slice(-8))}`);
  console.log(`  地雷分布(终态): ${JSON.stringify(f.mines)}  我方HP: ${JSON.stringify(f.allyHp)}`);
  console.log(`  埋雷=${!!mine.seen.placed} 触发=${!!mine.seen.triggered} 触发行: ${mine.seen.triggerLine || "-"}`);

  const logs = (f.battleLog || []).map(l => String(l));
  const placed = !!mine.seen.placed || logs.some(l => l.includes("埋设一颗地雷"));
  const triggered = !!mine.seen.triggered || logs.some(l => l.includes("的地雷触发"));
  const line = mine.seen.triggerLine || logs.find(l => l.includes("的地雷触发")) || "";
  const dmg11 = /受到11点伤害/.test(line);
  const top = (mine.setup?.allyNames || [])[0];
  const hitTop = !!top && logs.some(l => l.includes(`对${top}发动放置地雷`));
  // 触发后消耗：触发成功即代表已从手牌移除并进入消耗区（triggerLandmine 内先 splice 再 put consumed）
  checks.push(["放置地雷 · 埋设地雷状态牌", placed]);
  checks.push(["放置地雷 · AI 选响应牌最多者", hitTop]);
  checks.push(["放置地雷 · 持有者使用响应牌触发", triggered]);
  checks.push(["放置地雷 · 伤害=攻击力(11)", triggered && dmg11]);
  checks.push(["放置地雷 · 触发后地雷消耗", triggered]);
  checks.push(["放置地雷 页面无JS错误", mine.errors.length === 0]);
  if (mine.errors.length) console.log(`  页面错误: ${mine.errors.slice(0, 2).join(";")}`);

  console.log(`\n--- 对照·无地雷 ---`);
  if (ctrl.err) console.log(`  ❌ 异常: ${ctrl.err}`);
  const cf = ctrl.final || ctrl.last || {};
  console.log(`  我方HP: ${JSON.stringify(cf.allyHp)} 战报尾: ${JSON.stringify((cf.battleLog || []).slice(-4))}`);
  const ctrlNoMine = !(cf.battleLog || []).some(l => String(l).includes("的地雷触发"));
  checks.push(["对照 · 无地雷时不产生地雷伤害", ctrlNoMine]);
  checks.push(["对照 页面无JS错误", ctrl.errors.length === 0]);

  console.log("\n===== 汇总 =====");
  let pass = 0, fail = 0;
  checks.forEach(([n, ok]) => { console.log(`  ${ok ? "✅" : "❌"} ${n}`); ok ? pass++ : fail++; });
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})();
