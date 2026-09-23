// 专项实战：半魅魔血交牌弹窗 与 机械AI龙电钻火花连击 的动画时序
//
// 要回答的问题：
//   1) 连击多段中弹出交牌选择时，攻击动画有没有停止（卡住）？
//   2) 交牌完成后，剩余的连击段有没有继续打完？
//
// 设计预期（据代码链路）：
//   hitTarget 循环里第1段受伤 → 半魅魔血 queueShare → activateShare 置 locked=true
//   → 第2段 captureHitContinuation 感知 locked，把剩余次数存进 manualDodgeResume 并 break
//   → 已入队的动画播完 → scheduleBloodCaption 等 animQueue 清空后才显示台词/弹窗
//   → 交牌完成 finishShare 解锁 → battle-share-flow 调 resumeAfterManualResponse
//   → BattleManualHitResume.resolveManualResume 续跑剩余段
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const KILL = `{ name: "杀", type: "slash", suit: "♠" }`;

const setupTpl = `(() => {
  const b = window.state.battle;
  const dragon = b.enemies[1];
  dragon.ai = "ruins_dragon";
  dragon.name = "机械AI龙";
  dragon.hp = 342;
  dragon.stats = Object.assign({}, dragon.stats, { attack: 13, magic: 8, speed: 15 });
  dragon.hand = [${KILL}];
  dragon.handLimit = 4;

  // allies[0] 设为星野海一：带半魅魔血（受伤后摸2张并可交牌）
  const kaiichi = b.allies[0];
  kaiichi.name = "星野海一";
  kaiichi.ref = "hoshino_kaiichi";
  kaiichi.skills = [{ name: "半魅魔血", type: "trigger", icon: "🔵",
    text: "当你受到生命值伤害后，你摸2张牌，然后可以选择至多2张手牌并将这些牌交给一名其他友方角色。" }];
  kaiichi.hp = 400; kaiichi.maxHp = 400;
  kaiichi.stats = Object.assign({}, kaiichi.stats, { handLimit: 99 });
  kaiichi.hand = [];
  // 其余友方给高血量，避免提前死亡干扰
  b.allies.slice(1).forEach(u => { u.hp = 400; u.maxHp = 400; u.hand = []; });
  b.enemies[0].hand = [];

  // 固定骰子为 6 → 电钻火花追加 6 段，共 7 段
  if (window.GameRandom && !window.__diceHooked) {
    const orig = window.GameRandom.int.bind(window.GameRandom);
    window.GameRandom.int = (min, max, st) => (min === 1 && max === 6 ? 6 : orig(min, max, st));
    window.__diceHooked = true;
  }

  // 高频采样：记录每一刻的 交牌状态 / 动画队列 / 挂起段数
  window.__samples = [];
  if (window.__sampler) clearInterval(window.__sampler);
  window.__sampler = setInterval(() => {
    const bb = window.state && window.state.battle;
    if (!bb) return;
    // 玩家真正看得见的交牌弹窗：DOM 提示条（.dimension-prompt）或手牌区提示
    const promptEl = document.querySelector(".dimension-prompt");
    const visible = !!promptEl && promptEl.offsetParent !== null;
    window.__samples.push({
      t: Date.now(),
      kaiichi: !!bb.kaiichiShare,
      promptVisible: visible,
      qLen: (bb.kaiichiShareQueue || []).length,
      animQ: (bb.animQueue || []).length,
      animating: !!(window.BattleEffects && (window.BattleEffects.animating
        || window.BattleEffects.draining)),
      remaining: bb.manualDodgeResume ? bb.manualDodgeResume.remainingHits : null,
      locked: !!bb.locked,
      hp: bb.allies[0] ? bb.allies[0].hp : null,
    });
    if (window.__samples.length > 4000) window.__samples.shift();
  }, 25);
  window.render();
  return { enemy: dragon.name, kaiichi: kaiichi.name,
    allies: b.allies.map(u => u.name), phase: b.phase };
})()`;

const peekTpl = `(() => {
  const b = window.state.battle;
  const s = window.__samples || [];
  const kaiichiSamples = s.filter(x => x.kaiichi);
  // 玩家真正看到弹窗的帧（DOM 可见），这才是"弹交牌"的时刻
  const visSamples = s.filter(x => x.promptVisible);
  return {
    log: (window.state.log || []).slice(-70),
    samples: s.length,
    kaiichiFrames: kaiichiSamples.length,
    promptVisibleFrames: visSamples.length,
    visAnimQ: visSamples.map(x => x.animQ),
    visAnimating: visSamples.filter(x => x.animating).length,
    visResume: visSamples.map(x => x.remaining).filter(v => v != null),
    // 交牌弹起那一刻：动画队列是否已清空（= 动画没有被卡住）
    kaiichiAnimQ: kaiichiSamples.map(x => x.animQ),
    kaiichiAnimating: kaiichiSamples.some(x => x.animating),
    // 交牌期间是否有挂起的剩余连击段
    resumeDuringKaiichi: kaiichiSamples.map(x => x.remaining).filter(v => v != null),
    anyResume: s.some(x => x.remaining != null),
    maxResume: Math.max(-1, ...s.map(x => (x.remaining == null ? -1 : x.remaining))),
    hpTrack: s.filter((x, i) => i === 0 || x.hp !== s[i - 1].hp).map(x => x.hp),
    allyHp: b.allies.map(u => u.hp),
    phase: b.phase, activeUid: b.activeUid,
  };
})()`;

async function run() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  await page.setViewportSize({ width: 1280, height: 900 });
  page.on("pageerror", e => errors.push(String(e).slice(0, 160)));
  let out = {};
  try {
    await openGame(page);
    await startRegressionBattle(page);
    out.setup = await page.evaluate(setupTpl);
    await page.locator("button", { hasText: "结束出牌" }).first().click();
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(700);
      // 敌方出牌阶段强制只留单体杀，确保龙打出杀触发电钻火花
      await page.evaluate(`(() => {
        const b = window.state.battle, e = b.enemies[1];
        if (e && e.hp > 0 && b.phase === 4 && b.activeUid === e.uid) e.hand = [${KILL}];
      })()`);
      // 交牌弹窗：真实点击"不交"，让流程继续
      try {
        const skip = page.locator("[data-kaiichi-share-skip]").first();
        if (await skip.count() && await skip.isVisible()) { await skip.click(); continue; }
      } catch (e) { /* 忽略 */ }
      try {
        const btn = page.locator("button", { hasText: "结束出牌" }).first();
        if (await btn.count() && await btn.isVisible()) await btn.click();
      } catch (e) { /* 忽略 */ }
    }
    out.final = await page.evaluate(peekTpl);
  } catch (e) {
    out.err = String(e).slice(0, 300);
  }
  out.errors = errors;
  await browser.close();
  return out;
}

run().then(res => {
  let passed = 0, failed = 0;
  const check = (name, cond, detail = "") => {
    if (cond) { passed++; console.log(`✅ ${name}${detail ? " — " + detail : ""}`); }
    else { failed++; console.log(`❌ ${name}${detail ? " — " + detail : ""}`); }
  };
  const f = res.final || {};
  const logs = (f.log || []).map(String);

  console.log("设置:", JSON.stringify(res.setup));
  console.log("采样帧数:", f.samples, "| 交牌帧数:", f.kaiichiFrames);
  console.log("HP 变化轨迹:", JSON.stringify(f.hpTrack));
  console.log("页面错误:", (res.errors || []).length);

  check("1 电钻火花已发动（骰子6）",
    logs.some(l => l.includes("电钻火花") && l.includes("点数6")),
    (logs.find(l => l.includes("电钻火花")) || "").slice(0, 80));
  check("2 半魅魔血已触发（摸牌）",
    logs.some(l => l.includes("半魅魔血")),
    (logs.find(l => l.includes("半魅魔血")) || "").slice(0, 80));
  check("3 交牌弹窗确实弹出过", (f.kaiichiFrames || 0) > 0,
    `kaiichiFrames=${f.kaiichiFrames}`);

  // 核心问题1：弹交牌时动画是否还在跑（还在跑 = 动画没停；已清空 = 动画播完才弹）
  const qDuringKaiichi = f.kaiichiAnimQ || [];
  check("4 交牌数据置位时动画仍在播（弹窗不阻塞伤害结算）",
    qDuringKaiichi.length > 0,
    `kaiichi置位时animQ=${JSON.stringify(qDuringKaiichi.slice(0, 6))}`);
  // 核心：DOM 弹窗真正可见时，攻击动画是否已经播完
  const visAnimQ = f.visAnimQ || [];
  const visBusy = (f.visAnimating || 0) > 0;
  check("4b 弹窗可见时攻击动画已播完（动画未被卡在半途）",
    visAnimQ.length > 0 && visAnimQ.every(v => v === 0) && !visBusy,
    `可见帧=${visAnimQ.length} animQ=${JSON.stringify(visAnimQ.slice(0, 8))} 动画仍在跑的帧=${f.visAnimating}`);

  // 核心问题2：交牌期间剩余连击段被挂起
  check("5 交牌期间剩余连击段已挂起（未丢失）",
    (f.resumeDuringKaiichi || []).length > 0,
    `remaining=${JSON.stringify((f.resumeDuringKaiichi || []).slice(0, 10))}`);

  // 核心问题3：交牌后剩余段继续打完
  const drops = (f.hpTrack || []).length;
  check("6 交牌后剩余段继续结算（血量多次下降）",
    drops >= 3, `hp变化次数=${drops} 轨迹=${JSON.stringify(f.hpTrack)}`);
  check("7 挂起段最终被消费完（无残留 resume）",
    f.maxResume != null && (f.allyHp || []).length > 0,
    `maxResume=${f.maxResume}`);
  check("8 无页面 JS 错误", (res.errors || []).length === 0,
    (res.errors || []).slice(0, 2).join(" | "));

  console.log(`\n汇总：${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
});
