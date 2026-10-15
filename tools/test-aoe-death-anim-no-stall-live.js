// AOE（群体结算）打死角色时，动画不应整段停顿播死亡动画 —— 覆盖 1~4 个目标。
//
// 背景（玩家反馈）：AOE 打死人时动画明显变慢，打不死时正常。
// 根因：battle-effect-event-runner 的 floatEvent 在致命一击后统一
// `await wait(DEATH_ANIM_MS=760)`，而群体结算是逐个目标串行推进的。
// 死亡表现本身是 CSS 动画（deathFade 720ms），由渲染独立驱动，
// 不依赖队列阻塞 —— 故只要致命一击属于群体结算（groupHit）就跳过停顿。
//
// 首版修复只跳过了「后面还有受击浮字」的中段死亡，结果「打光全部目标」时
// 最后一个死亡事件（队列已空）仍多耗约 700ms（实测 +701/+756/+733）。
// 本测试按目标数 2/3/4 × 击杀数 0..N 全档位度量真实耗时，堵住该漏洞。
//
// 度量的是**真实耗时**，不是参数；并配单体杀对照组，确认单体击杀的
// 死亡演出没有被一并砍掉。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// mode: "aoe" 群体【机枪扫杀】 / "single" 单体【杀（普攻）】
// killCount: 前几个敌人设为 1 血（必死），其余 500 血（不死）
// realEnemies: true 用战场原有敌人（保留真实 uid，阵亡 DOM 才会渲染），
//              false 则按 targetCount 构造靶子（用于凑 3/4 个目标）
function setup(mode, targetCount, killCount, realEnemies) {
  return `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.floats = []; b.locked = false;
  if (${!!realEnemies}) {
    const orig = window.__origEnemies;
    if (orig && orig.length) b.enemies = orig.map(e => Object.assign({}, e));
    b.enemies.forEach((e, i) => {
      e.hp = i < ${killCount} ? 1 : 500; e.maxHp = 500; e.hand = [];
    });
  } else {
    const base = b.enemies[0];
    const list = [];
    for (let i = 0; i < ${targetCount}; i++) {
      list.push(Object.assign({}, base, {
        uid: "aoet_e" + i, name: "靶子" + i,
        hp: i < ${killCount} ? 1 : 500, maxHp: 500, hand: [], alive: true
      }));
    }
    b.enemies = list;
  }
  const actor = b.allies[0];
  const card = ${mode === "aoe"
    ? `{ name: "机枪扫杀", type: "slash", suit: "♠", uid: "aoe1", sweep: true, _playedFromHand: true }`
    : `{ name: "杀（普攻）", type: "slash", suit: "♠", uid: "sk1", _playedFromHand: true }`};
  actor.hand = [card];
  window.render();
  return { enemies: b.enemies.length };
})()`;
}

async function runCase(page, mode, targetCount, killCount, realEnemies) {
  await page.evaluate(setup(mode, targetCount, killCount, realEnemies));
  return page.evaluate(async () => {
    const st = window.state, b = st.battle;
    const actor = b.allies[0], card = actor.hand[0];
    const t0 = performance.now();
    window.BattleSystem.useCard(st, actor, b.enemies[0], card);
    let guard = 0;
    while (guard < 900) {
      const busy = window.BattleEffects?.animating || window.BattleEffects?.draining
        || (b.animQueue?.length || 0) > 0;
      if (!busy) break;
      await new Promise(r => setTimeout(r, 25));
      guard++;
    }
    await window.BattleEffects?.whenIdle?.();
    const ms = Math.round(performance.now() - t0);
    const deadUnits = Array.from(document.querySelectorAll(".unit")).filter(el =>
      el.classList.contains("dead")).length;
    return { ms, hp: b.enemies.map(e => e.hp), deadUnits };
  });
}

(async () => {
  const browser = await chromium.launch({ args: ["--disable-dev-shm-usage"] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await startRegressionBattle(page);

  // 保存战场原始敌人（真实 uid），单体对照组需用它还原，阵亡 DOM 才会渲染
  await page.evaluate(() => {
    window.__origEnemies = window.state.battle.enemies.map(e => Object.assign({}, e));
  });
  const deathMs = await page.evaluate(() => window.BattleEffectHandlers?.DEATH_ANIM_MS);
  console.log(`DEATH_ANIM_MS=${deathMs}\n`);

  const LIMIT = 250;   // 允许的耗时波动上限（远小于 DEATH_ANIM_MS 760）

  // —— 群体结算：2/3/4 个目标 × 击杀 0..N，全程不应因死亡而变慢 ——
  for (const n of [2, 3, 4]) {
    const base = await runCase(page, "aoe", n, 0);
    console.log(`[敌人${n}] 不死基线 ${base.ms}ms`);
    T(`敌人${n}：不死时无一阵亡`, base.hp.every(h => h > 0), { hp: base.hp });
    for (let k = 1; k <= n; k++) {
      const r = await runCase(page, "aoe", n, k);
      const delta = r.ms - base.ms;
      const killed = r.hp.filter(h => h === 0).length;
      console.log(`  死${k}人 ${r.ms}ms  差值${delta >= 0 ? "+" : ""}${delta}ms  实际阵亡${killed}`);
      T(`敌人${n} 死${k}人：动画不再变慢（|差值| ≤ ${LIMIT}ms）`,
        Math.abs(delta) <= LIMIT, { delta, ms: r.ms, base: base.ms });
      T(`敌人${n} 死${k}人：确实打死了 ${k} 个`, killed === k, { killed, hp: r.hp });
    }
    console.log("");
  }

  // —— 对照：单体击杀的死亡停顿必须保留 ——
  // 单体对照组：前面 AOE 多次把敌人打光、战斗已进入结束流程，需重开一场干净战斗
  await startRegressionBattle(page);
  await page.evaluate(() => {
    window.__origEnemies = window.state.battle.enemies.map(e => Object.assign({}, e));
  });
  const sgLive = await runCase(page, "single", 2, 0, true);
  const sgKill = await runCase(page, "single", 2, 1, true);
  const sgDelta = sgKill.ms - sgLive.ms;
  console.log(`单体 不死=${sgLive.ms}ms  打死=${sgKill.ms}ms  差值=${sgDelta}ms`);
  T("单体击杀仍保留死亡停顿（差值 ≥ 400ms）", sgDelta >= 400, { sgDelta });
  T("单体击杀后仍渲染阵亡表现（.unit.dead）", sgKill.deadUnits >= 1,
    { deadUnits: sgKill.deadUnits });

  T("无页面错误", errors.length === 0, { errors: errors.slice(0, 3) });

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  if (pass !== total) process.exit(1);
})().catch(e => { console.error("TEST_FAIL " + (e && e.stack || e)); process.exit(1); });
