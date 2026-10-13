// 专项：回合结束「出牌区牌飞入弃牌堆」必须一次性起飞
//
// 旧行为：trailExit 调 flyFrontCards 时未传 stagger，走默认 STAGGER_MS=100，
//   于是出牌区的牌一张一张依次飞（第 N 张要等 (N-1)*100ms 才起飞），
//   一回合打出越多，回合流转拖得越久。
// 新行为：显式 stagger:0，整批同时起飞、一次落位，时长与飞 1 张相当。
//   （与「一次性摸等量牌」battle-effect-card-transfers.js:88 同理的处理。）
//
// 判据（可证伪，行为层而非参数层）：
//   · 出牌区 N 张牌 → 产生 N 张 trail-exit-fly 飞行卡
//   · 这 N 张卡的创建时刻跨度 < ONCE_MS（一次性起飞）
//     错峰时第 N 张应在 (N-1)*100ms 后才创建，跨度远大于该阈值
//
// 防假通过：
//  1) 先断言出牌区张数、animQueue 的 trailExit 事件数、entries 数 == N，
//     否则「0 张牌 → 跨度 0」会被误判为一次性通过；
//  2) 用 N=4 与 N=2 两种规模分别验证，避免只在单一规模偶然成立；
//  3) 飞完后再断言出牌区已清空（防动画合并了但牌没回收）；
//  4) 对照组断言 flyFrontCards 的默认 stagger 仍是 100——证明这是局部改动，
//     不是把全局错峰关掉。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass += 1; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

// 一次性起飞的判据阈值：stagger=0 时整批在同一个 tick 附近创建（实测 <20ms）；
// stagger=100 时 N=4 的跨度约 300ms。取 100ms 作分界，两侧都有充分余量。
const ONCE_MS = 100;

async function settle(page, maxMs = 20000) {
  const deadline = Date.now() + maxMs;
  let lastLen = -1, stable = 0;
  while (Date.now() < deadline) {
    const s = await page.evaluate(`(() => {
      const b = window.state.battle || {};
      return { locked: !!b.locked, anim: (b.animQueue || []).length,
        len: (window.state.log || []).length };
    })()`);
    const quiet = !s.locked && !s.anim;
    if (quiet && s.len === lastLen) { stable += 1; if (stable >= 3) break; }
    else stable = 0;
    lastLen = s.len;
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(300);
}

// 记录每张飞行卡的真实创建时刻：这才是玩家看到的「是否同时起飞」。
async function instrument(page) {
  return page.evaluate(`(() => {
    if (!window.BattleEffectCardDOM?.front) return false;
    if (!window.__frontOrig) {
      window.__frontOrig = window.BattleEffectCardDOM.front;
    }
    window.BattleEffectCardDOM.front = function (data, enemy, className) {
      (window.__fly ||= []).push({
        t: performance.now(), className: className || "",
      });
      return window.__frontOrig.call(this, data, enemy, className);
    };
    return true;
  })()`);
}

async function run(page, count) {
  return page.evaluate(`(async () => {
    const state = window.state, b = state.battle;
    b.locked = false; b.animQueue = [];
    const owner = b.allies[0];
    const mk = i => ({
      name: "杀", type: "slash", suit: "黑桃",
      _playedByName: owner.name,
      _destinationSide: "ally",
      _destinationPile: "discard",
      _cardAnimationId: "trail-exit-probe-" + i,
    });
    b.played = Array.from({ length: ${count} }, (_, i) => mk(i));
    const before = b.played.length;
    window.__fly = [];
    // 走真实回收链路：cleanupTurn 内部先排 trailExit 动画，再清空 played。
    // 只调 queueTurnTrailExit 的话 played 不会被清（清空在 cleanupTurn 里），
    // 那样「飞完后出牌区已清空」会假红。
    window.BattleTurnState.cleanupTurn(
      b, owner, false, b.allies.concat(b.enemies));
    const queued = b.animQueue.length;
    const entries = (b.animQueue[0]?.entries || []).length;
    // 真实消费动画队列
    await window.BattleEffects.drain(state, () => window.render && window.render());
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline && (b.animQueue || []).length) {
      await new Promise(r => setTimeout(r, 60));
    }
    return { before, queued, entries, playedAfter: (b.played || []).length,
      fly: window.__fly || [] };
  })()`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message || e)));
  await startRegressionBattle(page);
  await settle(page);

  const hooked = await instrument(page);
  check("前置：可挂钩飞行卡工厂", hooked === true);

  for (const count of [4, 2]) {
    const r = await run(page, count);
    const trail = r.fly.filter(f => f.className.includes("trail-exit-fly"));
    const span = trail.length
      ? Math.max(...trail.map(f => f.t)) - Math.min(...trail.map(f => f.t))
      : -1;

    // 防假通过：先确认规模，否则「0 张 → 跨度 0」会误判
    check(`N=${count} 出牌区确有 ${count} 张`, r.before === count,
      JSON.stringify({ before: r.before }));
    check(`N=${count} 队列产生 1 条 trailExit`, r.queued === 1,
      JSON.stringify({ queued: r.queued }));
    check(`N=${count} entries 数吻合`, r.entries === count,
      JSON.stringify({ entries: r.entries }));
    check(`N=${count} 生成 ${count} 张飞行卡`, trail.length === count,
      JSON.stringify({ fly: trail.length }));
    check(`N=${count} 一次性起飞（跨度 ${Math.round(span)}ms < ${ONCE_MS}ms）`,
      span >= 0 && span < ONCE_MS, JSON.stringify({ span: Math.round(span) }));
    check(`N=${count} 飞完后出牌区已清空`, r.playedAfter === 0,
      JSON.stringify({ playedAfter: r.playedAfter }));
  }

  // 对照组：默认错峰行为未被改动（证明是局部改动，不是关掉全局错峰）。
  // 页面里常量已被压缩改名，故在源码层断言。
  const motionSrc = require("fs").readFileSync(
    path.join(__dirname, "..", "src", "original", "battle-effect-card-motion.js"),
    "utf8");
  const exitSrc = require("fs").readFileSync(
    path.join(__dirname, "..", "src", "original",
      "battle-effect-card-transfers-exit.js"), "utf8");
  check("对照组：默认错峰常量仍为 100ms",
    /const STAGGER_MS = 100;/.test(motionSrc));
  check("对照组：flyFrontCards 仍默认逐张错峰",
    /stagger = STAGGER_MS,/.test(motionSrc));
  // stagger:0 只应出现在 trailExit 内，不应污染 sealCards / burnCard。
  const zeroBlocks = exitSrc.split("\n")
    .filter(line => !/^\s*\/\//.test(line))
    .join("\n").match(/stagger:\s*0/g)?.length || 0;
  check("对照组：stagger:0 仅作用于 trailExit（1 处）", zeroBlocks === 1,
    JSON.stringify({ zeroBlocks }));

  check("无页面错误", errors.length === 0, JSON.stringify(errors.slice(0, 3)));

  console.log(`\n通过 ${pass} / ${pass + fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(err => {
  console.error("测试执行失败:", err?.message || err);
  process.exit(1);
});
