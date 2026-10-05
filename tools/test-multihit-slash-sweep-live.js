// 专项：其余「杀牌连击 / 多段」技能在受击方带弹窗类技能时是否丢段
//
// 背景：battle-damage-lifecycle / resolution / utils 里 damage 与 directDamage
// 首行均有 `if (state.battle?.locked) return { dodged:false, hpLoss:0 }`。
// 因此任何「自行 for 循环逐段调用伤害」的多段实现，一旦第一段触发受击方弹窗
// （星野一【半魅魔血】交牌等）置 locked，剩余段会被静默吞掉：
// 既不报错也不写日志，直接消失。
//
// 已确认安全（有挂起或入队）：
//   电钻火花 / 疯狂刺刀 / 幻影剑舞 —— BattleReactionQueue.enqueue + flush
//   无限暗刃 —— 循环内判 locked 并把剩余目标入队
//   hitTarget 多段（gatlingRepeats / fixedRepeats）—— captureHitContinuation
//   格林机枪 —— 队列 + greenGatlingResume 续跑
//
// 本轮待验（裸循环、无 locked 判断、无入队）：
//   1) 贝丝妲魔偶【终焉回旋斩】 guest-characters-skills.js resolveEndSpin
//   2) 贝尔蒂丝【疯狂屠戮】     bertis-gerlot-skills.js slaughter
//   3) 格洛特【复仇反击】       bertis-gerlot-skills.js revengeSlash
//
// 防假通过：每个场景先断言「多段确实发生（段数 ≥ 2）」，再比对段数与总伤害。
// 期望值一律按实战属性实时计算，不写死数值。
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

const logs = page => page.evaluate(`(() => (window.state.log || [])
  .map(l => String(l.text || l)))()`);

async function dismissPrompts(page) {
  return page.evaluate(`(() => {
    const el = document.querySelector(
      "[data-kaiichi-share-skip], [data-dimension-transfer-skip]");
    if (!el) return false;
    el.click();
    return true;
  })()`);
}

// 模拟「玩家点掉弹窗」：解锁并继续消费反应队列。
// 人为置 locked 后没有真实弹窗可点，需在此处代为解锁，否则队列永不 flush。
async function unlockAndFlush(page) {
  return page.evaluate(`(() => {
    const b = window.state?.battle;
    if (!b) return false;
    let did = false;
    if (b.locked && (b.reactionQueue || []).length) {
      b.locked = false;
      window.BattleReactionQueue?.flush?.(window.state, window.BattleSystem.damage);
      did = true;
    }
    if (b.locked && b.crazySlaughterResume) {
      b.locked = false;
      window.BertisGerlotSkills?.resumeCrazySlaughter?.(window.state);
      did = true;
    } else if (!b.locked && b.crazySlaughterResume) {
      window.BertisGerlotSkills?.resumeCrazySlaughter?.(window.state);
      did = true;
    }
    return did;
  })()`);
}

async function settle(page, maxMs = 25000) {
  const deadline = Date.now() + maxMs;
  let lastLen = -1, stable = 0;
  while (Date.now() < deadline) {
    await dismissPrompts(page);
    await unlockAndFlush(page);
    const s = await page.evaluate(`(() => {
      const b = window.state.battle || {};
      return { locked: !!b.locked, anim: (b.animQueue || []).length,
        queue: (b.reactionQueue || b.pendingActions || []).length,
        len: (window.state.log || []).length };
    })()`);
    const quiet = !s.locked && !s.anim && !s.queue;
    if (quiet && s.len === lastLen) { stable += 1; if (stable >= 3) break; }
    else stable = 0;
    lastLen = s.len;
    await page.waitForTimeout(400);
  }
  await dismissPrompts(page);
  await page.waitForTimeout(300);
}

const hitLines = (all, src) => all.filter(t =>
  t.includes(src) && /造成\d+伤害/.test(t));
const segCount = (all, src) => hitLines(all, src).length;

// ---------- 场景 1：终焉回旋斩 ----------
// 贝丝妲魔偶（allies）被闪避后，对敌方全体打出 count 张虚拟魔杀。
// 敌方挂半魅魔血 → 第一段即弹交牌窗 → locked。
async function runEndSpin(page, { count, popup }) {
  return page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    b.enemies.forEach((e, i) => { if (i > 0) e.hp = 0; });
    const foe = b.enemies[0];
    if (${popup}) {
      foe.ref = "hoshino_kaiichi";
      foe.skills = [{ name: "半魅魔血", type: "passive" }];
    }
    foe.hp = 999; foe.maxHp = 999;
    foe.hand = [];                       // 排空手牌，避免【闪】抵消干扰段数统计
    const besta = b.allies[0];
    besta.ref = "besta";
    besta.hp = 500; besta.maxHp = 500;
    b.locked = ${popup};      // 模拟「受击方弹窗已在进行中」
    b.reactionQueue = [];
    b.animQueue = [];
    const magic = (besta.stats?.magic || 0) + (besta.tempMagic || 0);
    window.GuestCharacterSkills?.resolveEndSpin?.(
      state, besta, foe, window.BattleSystem, ${count});
    return { magic, hpNow: foe.hp, locked: !!b.locked };
  })()`);
}

// ---------- 场景 2：复仇反击（times 段）----------
async function runRevenge(page, { times, popup }) {
  return page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    b.allies.forEach((a, i) => { if (i > 0) a.hp = 0; });
    const src = b.allies[0];
    // 注意：不可设 ref="gerlot"——格洛特的【爆头一击】会在 damage 内判定并置
    // locked（需 animQueue commit 才解锁），会把后续段全部挡掉，制造假阳性。
    src.skills = [{ name: "复仇反击", type: "passive" }];
    src.hp = 500; src.maxHp = 500;
    b.enemies.forEach((e, i) => { if (i > 0) e.hp = 0; });
    const foe = b.enemies[0];
    if (${popup}) {
      foe.ref = "hoshino_kaiichi";
      foe.skills = [{ name: "半魅魔血", type: "passive" }];
    }
    foe.hp = 999; foe.maxHp = 999;
    foe.hand = [];                       // 排空手牌，避免【闪】抵消干扰段数统计
    b.locked = ${popup};      // 模拟「受击方弹窗已在进行中」
    b.reactionQueue = [];
    b.animQueue = [];
    const atk = (src.stats?.attack || 0) + (src.tempAttack || 0);
    window.BertisGerlotSkills?.resolveRevengeTrigger?.(
      state, src, foe, ${times}, window.BattleSystem);
    return { atk, hpNow: foe.hp, locked: !!b.locked };
  })()`);
}

// ---------- 场景 3：疯狂屠戮 ----------
// 贝尔蒂丝视为使用 n 张虚拟机枪扫杀（n = 行动次数）。循环内调 ctx.useCard。
async function runSlaughter(page, { times, popup }) {
  return page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    b.allies.forEach((a, i) => { if (i > 0) a.hp = 0; });
    const bertis = b.allies[0];
    bertis.ref = "bertis";
    bertis.skills = [{ name: "疯狂屠戮", type: "active" }];
    bertis.actionCount = ${times};
    bertis.usedCrazySlaughter = false;
    bertis.hp = 500; bertis.maxHp = 500;
    b.enemies.forEach((e, i) => { if (i > 0) e.hp = 0; });
    const foe = b.enemies[0];
    foe.hp = 999; foe.maxHp = 999; foe.hand = [];
    b.locked = false;
    b.reactionQueue = []; b.animQueue = []; b.crazySlaughterResume = null;
    // popup=true：第一张扫杀结算后置 locked，精确模拟「受击方弹窗」
    let done = 0;
    const ctx = ${popup} ? Object.assign({}, window.BattleSystem, {
      useCard: (...a) => {
        const r = window.BattleSystem.useCard(...a);
        if (++done === 1 && window.state.battle) window.state.battle.locked = true;
        return r;
      },
    }) : window.BattleSystem;
    window.BertisGerlotSkills?.handleSpecialCard?.(
      state, bertis, bertis, { name: "疯狂屠戮", crazySlaughter: true },
      window.BattleSystem, ctx);
    return { hpNow: foe.hp, locked: !!window.state.battle?.locked,
      resume: JSON.stringify(window.state.battle?.crazySlaughterResume || null) };
  })()`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  // ---- 1a 终焉回旋斩：普通敌方（无弹窗），count = 3 ----
  const r1a = await runEndSpin(page, { count: 3, popup: false });
  await settle(page);
  const l1a = await logs(page);
  const seg1a = segCount(l1a, "终焉回旋斩");
  console.log("--- 场景1a 终焉回旋斩 普通目标 ---");
  console.log(`  魔力=${r1a.magic} 段数=${seg1a}`);
  hitLines(l1a, "终焉回旋斩").forEach(t => console.log("  " + t));
  check("1a 终焉回旋斩发动且多段发生（段数 ≥ 2）", seg1a >= 2, `段数 ${seg1a}`);
  check("1a count=3 段全部打出", seg1a === 3, `段数 ${seg1a}`);

  // ---- 1b 终焉回旋斩：调用前 locked（模拟受击方弹窗进行中），count = 3 ----
  await startRegressionBattle(page);
  const r1b = await runEndSpin(page, { count: 3, popup: true });
  console.log("--- 场景1b 终焉回旋斩 首段后置锁 ---");
  console.log(`  驱动返回瞬间 locked=${r1b.locked}`);
  await settle(page);
  const l1b = await logs(page);
  const seg1b = segCount(l1b, "终焉回旋斩");
  const hp1b = await page.evaluate(
    `(() => window.state.battle.enemies[0].hp)()`);
  const lost1b = 999 - hp1b;
  console.log(`  段数=${seg1b} 总掉血=${lost1b}（期望 ${3 * Math.ceil(r1b.magic)}）`);
  hitLines(l1b, "终焉回旋斩").forEach(t => console.log("  " + t));
  check("1b 弹窗场景下 count=3 段全部打出", seg1b === 3, `段数 ${seg1b}`);
  // 伤害逐段向上取整：期望 = 段数 × ceil(魔力)，不能直接用魔力原值
  const per1 = Math.ceil(r1b.magic);
  check("1b 弹窗场景下总伤害 = 3 × ceil(魔力)",
    lost1b === 3 * per1, `掉血 ${lost1b}，期望 ${3 * per1}`);

  // ---- 2a 复仇反击：普通目标，times = 2 ----
  await startRegressionBattle(page);
  const r2a = await runRevenge(page, { times: 2, popup: false });
  await settle(page);
  const l2a = await logs(page);
  const seg2a = segCount(l2a, "复仇反击");
  console.log("--- 场景2a 复仇反击 普通目标 ---");
  console.log(`  攻击力=${r2a.atk} 段数=${seg2a}`);
  hitLines(l2a, "复仇反击").forEach(t => console.log("  " + t));
  check("2a 复仇反击发动且多段发生（段数 ≥ 2）", seg2a >= 2, `段数 ${seg2a}`);

  // ---- 2b 复仇反击：调用前 locked（模拟受击方弹窗进行中），times = 2 ----
  await startRegressionBattle(page);
  const r2b = await runRevenge(page, { times: 2, popup: true });
  console.log("--- 场景2b 复仇反击 首段后置锁 ---");
  console.log(`  驱动返回瞬间 locked=${r2b.locked}`);
  await settle(page);
  const l2b = await logs(page);
  const seg2b = segCount(l2b, "复仇反击");
  const hp2b = await page.evaluate(
    `(() => window.state.battle.enemies[0].hp)()`);
  const lost2b = 999 - hp2b;
  console.log(`  段数=${seg2b} 总掉血=${lost2b}（期望 ${2 * Math.ceil(r2b.atk)}）`);
  hitLines(l2b, "复仇反击").forEach(t => console.log("  " + t));
  check("2b 弹窗场景下复仇反击 2 段全部打出", seg2b === 2, `段数 ${seg2b}`);
  const per2 = Math.ceil(r2b.atk);
  check("2b 弹窗场景下总伤害 = 2 × ceil(攻击力)",
    lost2b === 2 * per2, `掉血 ${lost2b}，期望 ${2 * per2}`);

  // ---- 3a 疯狂屠戮：普通目标，n = 3 ----
  await startRegressionBattle(page);
  await runSlaughter(page, { times: 3, popup: false });
  await settle(page);
  const l3a = await logs(page);
  const spin3a = l3a.filter(t => /疯狂屠戮/.test(t) && /机枪扫杀/.test(t)).length;
  const sweep3a = segCount(l3a, "机枪扫杀");
  console.log("--- 场景3a 疯狂屠戮 普通目标 ---");
  l3a.filter(t => /疯狂屠戮/.test(t)).forEach(t => console.log("  " + t));
  console.log(`  扫杀伤害行数=${sweep3a}`);
  check("3a 疯狂屠戮发动（日志声明使用3张虚拟机枪扫杀）", spin3a >= 1
    || l3a.some(t => /使用3张虚拟机枪扫杀/.test(t)), `匹配 ${spin3a}`);

  // ---- 3b 疯狂屠戮：调用前 locked（模拟受击方弹窗进行中），n = 3 ----
  await startRegressionBattle(page);
  const r3b = await runSlaughter(page, { times: 3, popup: true });
  console.log(`  驱动返回: locked=${r3b.locked} resume=${r3b.resume}`);
  await settle(page);
  const l3b = await logs(page);
  const sweep3b = segCount(l3b, "机枪扫杀");
  const hp3b = await page.evaluate(
    `(() => window.state.battle.enemies[0].hp)()`);
  console.log("--- 场景3b 疯狂屠戮 调用前置锁 ---");
  console.log(`  扫杀伤害行数=${sweep3b} 敌方剩余血量=${hp3b}`);
  check("3b 弹窗场景下疯狂屠戮 3 张扫杀均打出伤害",
    sweep3b === 3, `伤害行数 ${sweep3b}`);

  check("无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  await browser.close();
  console.log(`\n结果: ✅${pass} ❌${fail}`);
  process.exit(fail ? 1 : 0);
})();
