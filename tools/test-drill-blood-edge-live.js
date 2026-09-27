// 专项：机械AI龙「电钻火花」追加多段 × 星野海一「半魅魔血」的边界场景
//
// MODE=propeller  海一同时装备「螺旋桨」：摸牌会触发螺旋桨面板（通用触发面板），
//                 与半魅魔血交牌窗两个 locked 弹窗是否会打架 / 卡死 / 吞段。
// MODE=death      海一血量只够撑 2 段：中途死亡后剩余追加段的行为。
// MODE=propdeath  两者叠加。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const MODE = process.env.MODE || "propeller";
// MODE=propskip 与 propeller 相同，但螺旋桨面板点「跳过」，用于对照发动/跳过两条分支。
const KILL = `{ name: "杀", type: "slash", suit: "♠" }`;
const PROPELLER = MODE === "propeller" || MODE === "propdeath" || MODE === "propskip";
const USE_PROPELLER = MODE !== "propskip";
const LOW_HP = MODE === "death" || MODE === "propdeath";

const setupTpl = `(() => {
  const b = window.state.battle;
  const dragon = b.enemies[1];
  dragon.ai = "ruins_dragon";
  dragon.name = "机械AI龙";
  dragon.stats = Object.assign({}, dragon.stats, { attack: 13, magic: 8, speed: 15 });
  dragon.hand = [${KILL}];
  dragon.handLimit = 4;
  const kaiichi = b.allies[0];
  kaiichi.name = "星野海一";
  kaiichi.ref = "hoshino_kaiichi";
  kaiichi.skills = [{ name: "半魅魔血", type: "trigger", icon: "🔵",
    text: "当你受到生命值伤害后，你摸2张牌，然后可以选择至多2张手牌并将这些牌交给一名其他友方角色。" }];
  kaiichi.hp = ${LOW_HP ? 30 : 400}; kaiichi.maxHp = ${LOW_HP ? 30 : 400};
  kaiichi.stats = Object.assign({}, kaiichi.stats, { handLimit: 99 });
  kaiichi.hand = [];
  ${PROPELLER ? `kaiichi.battleRelics = ["螺旋桨"];` : ``}
  b.allies.slice(1).forEach(u => { u.hp = 400; u.maxHp = 400; });
  b.enemies[0].hand = [];
  if (window.GameRandom && !window.__diceHooked) {
    const orig = window.GameRandom.int.bind(window.GameRandom);
    window.GameRandom.int = (min, max, st) => (min === 1 && max === 6 ? 6 : orig(min, max, st));
    window.__diceHooked = true;
  }
  // 精确计数：交牌入队次数（半魅魔血触发次数）
  window.__shareCount = 0;
  b.kaiichiShareQueue = [];
  const __qpush = b.kaiichiShareQueue.push.bind(b.kaiichiShareQueue);
  b.kaiichiShareQueue.push = (...items) => { window.__shareCount++; return __qpush(...items); };
  // 精确计数：通用触发面板打开次数（螺旋桨）
  window.__panelCount = 0;
  if (window.BattleCounterTriggers && !window.__openHooked) {
    const __origOpen = window.BattleCounterTriggers.open.bind(window.BattleCounterTriggers);
    window.BattleCounterTriggers.open = (st, cfg) => {
      window.__panelCount++; return __origOpen(st, cfg);
    };
    window.__openHooked = true;
  }
  // 双弹窗同时出现的采样
  window.__bothSeen = 0; window.__bothDom = 0;
  window.__hpTrack = [];
  window.__logAcc = [];
  const __pushLog = text => { window.__logAcc.push(String(text)); };
  if (window.BattleLog && !window.__logHooked) {
    const origAdd = window.BattleLog.add.bind(window.BattleLog);
    window.BattleLog.add = (st, text, ...rest) => {
      __pushLog(text); return origAdd(st, text, ...rest);
    };
    window.__logHooked = true;
  }
  if (window.__sampler) clearInterval(window.__sampler);
  window.__sampler = setInterval(() => {
    const bb = window.state && window.state.battle;
    if (!bb || !bb.allies[0]) return;
    const hp = bb.allies[0].hp;
    if (!window.__hpTrack.length || window.__hpTrack[window.__hpTrack.length-1] !== hp) {
      window.__hpTrack.push(hp);
    }
    if (bb.kaiichiShare && bb.counterTrigger) window.__bothSeen++;
    if (document.querySelector(".counter-trigger-panel")
      && document.querySelector("[data-kaiichi-share-skip]")) window.__bothDom++;
  }, 20);
  window.render();
  return { allyUid: b.allies[1] ? b.allies[1].uid : null };
})()`;

const peekTpl = `(() => {
  const b = window.state.battle;
  window.__logAcc = window.__logAcc || [];
  (window.state.log || []).map(String).forEach(l => {
    if (!window.__logAcc.includes(l)) window.__logAcc.push(l);
  });
  return {
    log: window.__logAcc.slice(-400),
    hpTrack: window.__hpTrack || [],
    shareCount: window.__shareCount || 0,
    panelCount: window.__panelCount || 0,
    bothSeen: window.__bothSeen || 0, bothDom: window.__bothDom || 0,
    kaiichiHp: b.allies[0] ? b.allies[0].hp : null,
    kaiichiHand: b.allies[0] ? (b.allies[0].hand || []).length : null,
    locked: !!b.locked,
    kaiichiShare: !!b.kaiichiShare,
    counterTrigger: !!b.counterTrigger,
    reactionQueue: (b.reactionQueue || []).length,
    phase: b.phase,
    ctDom: !!document.querySelector(".counter-trigger-panel"),
    skipDom: !!document.querySelector("[data-kaiichi-share-skip]"),
    ctQueue: (b.counterTriggerQueue || []).length,
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
    for (let i = 0; i < 70; i++) {
      await page.waitForTimeout(500);
      // 只在第一次敌人回合塞杀牌：本用例要测的是「一次电钻火花的 7 段」，
      // 若每轮都塞，敌人会反复攻击，面板次数与段数就无法一一对应。
      const st = await page.evaluate(`(() => {
        const b = window.state.battle, e = b.enemies[1];
        const drilled = (window.state.log || []).map(String)
          .some(l => l.includes("发动电钻火花"));
        if (!drilled && e && e.hp > 0 && b.phase === 4 && b.activeUid === e.uid) {
          e.hand = [${KILL}];
        }
        return { drilled, ct: !!b.counterTrigger, share: !!b.kaiichiShare,
          ctQ: (b.counterTriggerQueue || []).length,
          shareQ: (b.kaiichiShareQueue || []).length };
      })()`);
      // 一次电钻火花结算完、且所有受击弹窗都消费干净后立即收尾。
      if (st.drilled && !st.ct && !st.share && !st.ctQ && !st.shareQ) break;
      let handled = false;
      // 先处理通用触发面板（螺旋桨），再处理交牌窗。
      // 面板真实选择器是 .counter-trigger-panel，按钮是 [data-counter-trigger-use] /
      // [data-counter-trigger-skip]（battle-response-ui.js:46）。旧写法用 .counter-prompt
      // 与 [data-counter-trigger] 均不存在，面板从未被消费，属于假流程。
      try {
        const cpanel = page.locator(".counter-trigger-panel").first();
        if (await cpanel.count() && await cpanel.isVisible()) {
          const sel = USE_PROPELLER
            ? "[data-counter-trigger-use]" : "[data-counter-trigger-skip]";
          const btn = page.locator(sel).first();
          if (await btn.count() && await btn.isVisible()) await btn.click();
          handled = true;
        }
      } catch (e) { /* ignore */ }
      if (!handled) {
        try {
          const prompt = page.locator(".dimension-prompt").first();
          if (await prompt.count() && await prompt.isVisible()) {
            const skip = page.locator("[data-kaiichi-share-skip]").first();
            if (await skip.count()) await skip.click();
            handled = true;
          }
        } catch (e) { /* ignore */ }
      }
      if (handled) continue;
      try {
        const btn = page.locator("button", { hasText: "结束出牌" }).first();
        if (await btn.count() && await btn.isVisible()) await btn.click();
      } catch (e) { /* ignore */ }
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
  const drops = (f.hpTrack || []).length - 1;
  console.log(`模式: ${MODE}`);
  console.log("HP 轨迹:", JSON.stringify(f.hpTrack));
  console.log("交牌入队:", f.shareCount, " 面板打开:", f.panelCount, " 双弹窗并存:", f.bothSeen, " 双面板同现DOM:", f.bothDom);
  console.log("结束态:", JSON.stringify({ locked: f.locked, kaiichiShare: f.kaiichiShare,
    counterTrigger: f.counterTrigger, reactionQueue: f.reactionQueue, phase: f.phase,
    ctDom: f.ctDom, skipDom: f.skipDom, ctQueue: f.ctQueue }));
  console.log("螺旋桨日志:", (logs.filter(l => l.includes("螺旋桨")).slice(0, 3).join(" | ") || "无").slice(0, 160));

  check("1 电钻火花已发动（骰子6）",
    logs.some(l => l.includes("电钻火花") && l.includes("点数6")));
  check("2 无页面 JS 错误", (res.errors || []).length === 0,
    (res.errors || []).slice(0, 2).join(" | "));
  if (PROPELLER) {
    const propFire = logs.filter(l => l.includes("的螺旋桨触发，对")).length;
    check("3 螺旋桨面板已触发", (f.panelCount || 0) > 0, `次数=${f.panelCount}`);
    // 电钻火花 7 段 × 半魅魔血逐段摸牌，修复前每段各弹一次面板（实测 7 次）。
    check("3b 同一次伤害链只弹一次螺旋桨面板",
      (f.panelCount || 0) === 1, `次数=${f.panelCount}`);
    check("3c 面板已被玩家消费（无残留）",
      !f.counterTrigger && !(f.ctQueue || 0),
      `counterTrigger=${f.counterTrigger} 队列=${f.ctQueue}`);
    check("3d " + (USE_PROPELLER ? "点发动后螺旋桨生效" : "点跳过后螺旋桨不生效"),
      USE_PROPELLER ? propFire >= 1 : propFire === 0, `实际发动=${propFire}`);
    check("4 两个弹窗不会同时卡住（未双双残留）",
      !(f.kaiichiShare && f.counterTrigger),
      `kaiichiShare=${f.kaiichiShare} counterTrigger=${f.counterTrigger}`);
    check("5 结束时未卡在锁定态", !f.locked, `locked=${f.locked}`);
    // 追加段数用日志计数而非血量采样：面板被即时消费后 7 段连续结算，
    // 20ms 采样的血量变化会被合并记录（实测只留下 2 个变化点）。
    const drillHits = logs.filter(l => l.includes("电钻火花对") && l.includes("伤害")).length;
    // 残血模式海一撑不到第 3 段就死亡，剩余段按规定停止，不能套用「6 段全部结算」。
    if (LOW_HP) {
      check("6 中途死亡后剩余段停止结算",
        drillHits < 6 && (f.hpTrack || []).includes(0),
        `段数=${drillHits} 轨迹=${JSON.stringify(f.hpTrack)}`);
    } else {
      check("6 追加段未被弹窗吞掉（追加 6 段全部结算）",
        drillHits === 6, `日志段数=${drillHits} 轨迹=${JSON.stringify(f.hpTrack)}`);
    }
    check("7 无残留反应队列", (f.reactionQueue || 0) === 0, `剩余=${f.reactionQueue}`);
  }
  if (LOW_HP) {
    // 战斗会在结算后重置血量进入下一场，故只断言「中途被打到 0」而非「结束时为 0」。
    check("3 海一被打至 0 血", (f.hpTrack || []).includes(0),
      `轨迹=${JSON.stringify(f.hpTrack)}`);
    check("4 血量不为负数", (f.hpTrack || []).every(hp => hp >= 0),
      `轨迹=${JSON.stringify(f.hpTrack)}`);
    const afterDeath = logs.filter(l => l.includes("星野海一") && l.includes("半魅魔血"));
    check("5 死亡后不再触发半魅魔血",
      afterDeath.length <= 3, `半魅魔血日志数=${afterDeath.length}`);
    check("6 结束时未卡在锁定态", !f.locked, `locked=${f.locked}`);
  }
  console.log(`\n汇总：${passed} 通过 / ${failed} 失败`);
  process.exit(failed ? 1 : 0);
});
