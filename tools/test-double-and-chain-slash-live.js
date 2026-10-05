// 专项：【双重打杀】与【魔之连杀】是否也存在「多段被受击弹窗截断」的同类缺陷
//
// 背景：疯狂刺刀 / 幻影剑舞曾因裸 for 循环直调 damage 而丢段——
// 第一段伤害触发受击类弹窗（半魅魔血交牌）后置 battle.locked，
// 而 battle-damage-resolution.js 的伤害入口在 locked 时直接 return {hpLoss:0}，
// 剩余段被整段吞掉。修法是走 BattleReactionQueue.captureHitContinuation 入队。
//
// 本用例核查另两张多段/连击杀牌：
//  1) 双重打杀（fixedRepeats:2）→ 走 hitTarget，已有 captureHitContinuation。
//  2) 魔之连杀（chainBySlash）→ ruins-card-skills.chainExtraTargets 用
//     picks.forEach(damage) 裸循环，无任何入队保护，属高危。
//
// 判据：弹窗目标存在时，剩余段 / 额外目标是否仍然结算。
// 防假通过：每个场景先跑无弹窗对照，证明链路本身会结算，再比对弹窗场景。
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

// 交牌弹窗（星野一 kaiichiShare）/ 次元转移等会置 locked
async function dismissPrompts(page) {
  return page.evaluate(`(() => {
    const el = document.querySelector(
      "[data-kaiichi-share-skip], [data-dimension-transfer-skip]");
    if (!el) return false;
    el.click();
    return true;
  })()`);
}

// 交牌窗（kaiichiShare）的跳过按钮要等动画队列排空后才挂载，
// 且每段各弹一次（2 段 = 2 次交牌）。旧版只等 locked/anim/queue 归零，
// 按钮未挂载时会提前判定“已静默”并退出，剩余段随之漏计（表现为随机失败）。
// 现把 share / manualDodgeResume 也纳入“未完成”判据，并放宽总时限。
async function settle(page, maxMs = 60000) {
  const deadline = Date.now() + maxMs;
  let lastLen = -1, stable = 0, ticks = 0, seenPrompt = 0;
  while (Date.now() < deadline) {
    // 交牌窗要等动画队列排空后才挂载按钮：开局若干轮内即使“静默”也不得
    // 判定完成，否则按钮尚未出现就退出，剩余段在弹窗关闭后才结算 →
    // 日志读早了，表现为间歇「只结算 1 段」的假失败（非游戏缺陷）。
    const MIN_TICKS = 8;
    if (await dismissPrompts(page)) seenPrompt += 1;
    ticks += 1;
    const s = await page.evaluate(`(() => {
      const b = window.state.battle || {};
      return { locked: !!b.locked, anim: (b.animQueue || []).length,
        queue: (b.reactionQueue || b.pendingActions || []).length,
        share: !!b.kaiichiShare,
        resume: !!b.manualDodgeResume,
        len: (window.state.log || []).length };
    })()`);
    const pending = s.share || s.resume;
    const quiet = !s.locked && !s.anim && !s.queue && !pending;
    // 退出前还要求：至少走过 MIN_TICKS 轮，且若中途出现过弹窗则必须已被关闭
    if (quiet && s.len === lastLen && ticks >= MIN_TICKS && !s.share) {
      stable += 1;
      if (stable >= 3) break;
    } else stable = 0;
    lastLen = s.len;
    await page.waitForTimeout(400);
  }
  await dismissPrompts(page);
  await page.waitForTimeout(300);
}

// actor = 敌方 0 号；主目标 = 友方 0 号；额外目标池 = 友方 1 号
async function play(page, { cardName, extraHand = [],
  targetRef = null, targetSkills = [], poolSkills = [] }) {
  return page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    const actor = b.enemies[0];
    actor.hp = 500; actor.maxHp = 500; actor.intent = 9;
    actor.stats = actor.stats || {};
    actor.stats.attack = 10; actor.stats.magic = 10;
    actor.tempAttack = 0; actor.tempMagic = 0;
    const target = b.allies[0];
    const pool = b.allies[1];
    // 清空友方手牌：避免【闪】自动响应把伤害抵消，干扰段数判定
    b.allies.forEach(a => {
      a.hand = []; a.hp = 999; a.maxHp = 999;
      a.pileStats = a.pileStats || {};
      a.pileStats.discard = [];
      // 半魅魔血受击后要摸 2 张牌，摸牌堆是随机的：一旦摸到【闪】，
      // 自动响应会把后续段抵消，段数随机变成 1 —— 这正是本用例过去
      // 间歇失败的真正原因（非游戏缺陷）。摸牌堆剔除响应牌，判据才稳定。
      const deck = a.pileStats.deck || a.deck || [];
      const kept = deck.filter(c => c && c.type !== "response"
        && c.name !== "闪");
      if (a.pileStats.deck) a.pileStats.deck = kept;
      if (a.deck) a.deck = kept;
    });
    ${targetRef ? `target.ref = "${targetRef}";` : ""}
    ${JSON.stringify(targetSkills)}.forEach(name => {
      target.skills = target.skills || [];
      if (!target.skills.some(s => s.name === name))
        target.skills.push({ name, type: "passive" });
    });
    ${JSON.stringify(poolSkills)}.forEach(name => {
      pool.skills = pool.skills || [];
      if (!pool.skills.some(s => s.name === name))
        pool.skills.push({ name, type: "passive" });
    });
    // fromEntity 默认 virtual:true，而 spendIntent（fixedRepeats → gatlingRepeats 的转换点）
    // 只处理非虚拟杀牌；用虚拟牌驱动会让双重打杀只打 1 段，属测试构造缺陷而非游戏缺陷。
    const card = window.CardUtils.fromEntity("${cardName}", { virtual: false });
    actor.hand = [card].concat(${JSON.stringify(extraHand)}
      .map(n => window.CardUtils.fromEntity(n, { virtual: false })));
    b.locked = false; b.animQueue = []; b.reactionQueue = [];
    window.BattleLog.clear(state);
    const before = { targetHp: target.hp, poolHp: pool.hp };
    window.BattleSystem.useCard(state, actor, target, card);
    const b2 = window.state.battle;
    return { before, lockedNow: !!b2.locked, poolHpAfter: pool.hp };
  })()`);
}

const hpOf = (page, i) => page.evaluate(
  `(() => window.state.battle.allies[${i}].hp)()`);
const hitLines = (all, src) => all.filter(t =>
  t.includes(src) && /造成\d+伤害/.test(t));

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));

  // ================= 魔之连杀 =================
  // 对照：主目标无弹窗技能 → 额外目标应正常结算（证明链路本身可用）
  await startRegressionBattle(page);
  const c1 = await play(page, { cardName: "魔之连杀" });
  await settle(page);
  const l1 = await logs(page);
  const chain1 = l1.filter(t => /魔之连杀触发/.test(t));
  const poolHp1 = await hpOf(page, 1);
  const poolLost1 = c1.before.poolHp - poolHp1;
  console.log(`[对照-魔之连杀] 触发行=${chain1.length} 额外目标掉血=${poolLost1}`
    + ` 期望魔力=10`);
  chain1.forEach(t => console.log("  " + t));
  check("对照 魔之连杀确实触发额外指定", chain1.length === 1,
    `触发 ${chain1.length} 次`);
  check("对照 额外目标正常结算伤害", poolLost1 === 10,
    `掉血 ${poolLost1}，期望 10`);

  // 实验：主目标带半魅魔血（受击弹交牌窗）→ 额外目标是否仍结算
  await startRegressionBattle(page);
  const c2 = await play(page, { cardName: "魔之连杀",
    targetRef: "hoshino_kaiichi", targetSkills: ["半魅魔血"] });
  console.log(`[实验-魔之连杀] 驱动返回瞬间 locked=${c2.lockedNow}`);
  await settle(page);
  const l2 = await logs(page);
  const chain2 = l2.filter(t => /魔之连杀触发/.test(t));
  const blood2 = l2.filter(t => /半魅魔血令其摸/.test(t));
  const poolHp2 = await hpOf(page, 1);
  const poolLost2 = c2.before.poolHp - poolHp2;
  console.log(`[实验-魔之连杀] 触发行=${chain2.length} 半魅魔血=${blood2.length}`
    + ` 额外目标掉血=${poolLost2} 期望 10`);
  chain2.forEach(t => console.log("  " + t));
  check("魔之连杀 主目标弹窗时仍触发额外指定", chain2.length === 1,
    `触发 ${chain2.length} 次`);
  check("魔之连杀 主目标弹窗时额外目标不被吞", poolLost2 === 10,
    `额外目标掉血 ${poolLost2}，期望 10（0 表示被 locked 吞掉）`);

  // ================= 双重打杀 =================
  // 对照：目标无弹窗 → 2 段全打出
  await startRegressionBattle(page);
  const d1 = await play(page, { cardName: "双重打杀" });
  await settle(page);
  const l3 = await logs(page);
  const seg3 = hitLines(l3, "双重打杀").length;
  const tgtHp3 = await hpOf(page, 0);
  const lost3 = d1.before.targetHp - tgtHp3;
  console.log(`[对照-双重打杀] 段数=${seg3} 总掉血=${lost3} 期望 ${2 * 10}`);
  check("对照 双重打杀打出 2 段", seg3 === 2, `段数 ${seg3}`);
  check("对照 双重打杀总伤害 = 2 × 攻击力", lost3 === 20, `掉血 ${lost3}`);

  // 实验：目标带半魅魔血（弹窗）→ 2 段是否仍全打出
  await startRegressionBattle(page);
  const d2 = await play(page, { cardName: "双重打杀",
    targetRef: "hoshino_kaiichi", targetSkills: ["半魅魔血"] });
  console.log(`[实验-双重打杀] 驱动返回瞬间 locked=${d2.lockedNow}`);
  await settle(page);
  const l4 = await logs(page);
  const seg4 = hitLines(l4, "双重打杀").length;
  const blood4 = l4.filter(t => /半魅魔血令其摸/.test(t));
  const tgtHp4 = await hpOf(page, 0);
  const lost4 = d2.before.targetHp - tgtHp4;
  console.log(`[实验-双重打杀] 段数=${seg4} 半魅魔血=${blood4.length}`
    + ` 总掉血=${lost4} 期望 ${2 * 10}`);
  hitLines(l4, "双重打杀").forEach(t => console.log("  " + t));
  check("双重打杀 弹窗时 2 段全部打出（不被截断）", seg4 === 2, `段数 ${seg4}`);
  check("双重打杀 弹窗时半魅魔血逐段触发 2 次", blood4.length === 2,
    `触发 ${blood4.length} 次`);
  check("双重打杀 弹窗时总伤害 = 2 × 攻击力", lost4 === 20, `掉血 ${lost4}`);

  check("无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));

  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
