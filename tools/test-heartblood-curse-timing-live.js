// 专项：【心血之咒】触发时序严格检查
//
// 心血之咒（希特威·被动）：锁定技，当你受到伤害后，伤害来源须交给你一张
// ♥红桃牌。若其未交牌，你对其造成等同于你攻击力的伤害。
//
// 定稿口径：与狂战、复仇反击等受击类技能一致——挂到本段受击动画的浮字上，
// 等这一段的受击演完（damage/hp-loss 浮字 settle）再结算。
// 此前它在伤害结算的同步链里立刻执行，牌会在受击浮字播出前就换手，
// 玩家看到的是"血还没跳完，牌已经到手"。
//
// 判据（关键是可证伪，而不是只看"最终有没有生效"）：
//   · afterDamage 仍在伤害同步链里被调用（它是挂起点，不是执行点）
//   · 驱动返回那一刻：索牌/反击都还没发生，且浮字事件上已挂 onSettled
//   · 动画播完之后：索牌或反击才真正落地
//
// 防假通过：
//  1) 每个场景先断言「伤害确实发生（hpLoss > 0）」，再谈触发时序；
//  2) 触发快照必须能抓到（hits.length ≥ 1），抓不到说明没触发、不是"时序正确"；
//  3) 反击分支另行断言「反击伤害最终确已结算」，避免只验索牌分支；
//  4) 延后断言必须配"最终生效"断言，否则"根本没触发"会被误判成"时序正确"。
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

async function settle(page, maxMs = 20000) {
  const deadline = Date.now() + maxMs;
  let lastLen = -1, stable = 0;
  while (Date.now() < deadline) {
    await dismissPrompts(page);
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
    await page.waitForTimeout(300);
  }
  await dismissPrompts(page);
  await page.waitForTimeout(500);
}

// 战场结算态：用于「动画播完后」的最终断言
const snapshot = page => page.evaluate(`(() => {
  const b = window.state.battle;
  const actor = b.enemies[0], target = b.allies[0];
  return { foeHp: actor.hp, foeHand: (actor.hand || []).length,
    targetHand: (target.hand || []).length,
    anim: (b.animQueue || []).length, locked: !!b.locked };
})()`);

// 在 HitwellSkills.afterDamage 上包一层，抓取被调用瞬间的战场快照
async function hookCurse(page) {
  return page.evaluate(`(() => {
    window.__curseHits = [];
    const mod = window.HitwellSkills;
    if (!mod || typeof mod.afterDamage !== "function") return false;
    const orig = mod.afterDamage;
    mod.afterDamage = function (...args) {
      const state = args[0], b = state?.battle || {};
      const q = b.animQueue || [];
      window.__curseHits.push({
        animTypes: q.map(a => (a && a.type) || "?"),
        animLen: q.length,
        locked: !!b.locked,
        depth: b._damageDepth || 0,
      });
      return orig.apply(this, args);
    };
    return true;
  })()`);
}

// 驱动敌方对友方出一张实体【杀】；heart=true 给敌方塞一张红桃手牌
async function drive(page, { heart }) {
  return page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    window.__curseHits = [];
    const actor = b.enemies[0];
    actor.hp = 500; actor.maxHp = 500;
    actor.stats = actor.stats || {};
    actor.stats.attack = 10;
    actor.tempAttack = 0;
    b.allies.forEach((a, i) => {
      if (i > 0) a.hp = 0;
      a.hp = 999; a.maxHp = 999;
    });
    const target = b.allies[0];
    target.ref = "hitwell";
    target.skills = target.skills || [];
    if (!target.skills.some(s => s.name === "心血之咒"))
      target.skills.push({ name: "心血之咒", type: "passive" });
    target.stats = target.stats || {};
    target.stats.attack = 7;
    target.hand = [];
    // 敌方手牌：heart=true 时含一张红桃，否则全非红桃。
    // 实体牌数据只登记花色配比（suits），具体花色要显式写入；
    // 红桃用【愈魔瓶】（♥3♦3），它不会被自动响应打出，不会干扰结算。
    const filler = () => {
      const c = window.CardUtils.fromEntity("愈魔瓶", { virtual: false });
      c.suit = ${heart} ? "♥" : "♦";
      return c;
    };
    actor.hand = [filler()];
    const card = window.CardUtils.fromEntity("杀（普攻）", { virtual: false });
    b.locked = false; b.animQueue = []; b.reactionQueue = [];
    window.BattleLog.clear(state);
    const before = { hp: target.hp, foeHp: actor.hp, foeHand: actor.hand.length };
    window.BattleSystem.useCard(state, actor, target, card);
    const b2 = window.state.battle;
    const floats = (b2.animQueue || []).filter(e => e && e.type === "float");
    return {
      before,
      afterHp: target.hp,
      foeHpNow: actor.hp,
      foeHandNow: (actor.hand || []).length,
      targetHandNow: (target.hand || []).length,
      animAtReturn: (b2.animQueue || []).map(a => (a && a.type) || "?"),
      // 浮字上挂了 onSettled ⇒ 效果被推迟到本段受击动画播完之后
      floats: floats.length,
      floatsHooked: floats.filter(e => typeof e.onSettled === "function").length,
    };
  })()`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  // ---------- 场景 A：敌方有红桃 → 索牌分支 ----------
  const hooked = await hookCurse(page);
  check("0 已挂载心血之咒触发探针", hooked === true);
  const a = await drive(page, { heart: true });
  const hitA = await page.evaluate("(() => window.__curseHits || [])()");
  console.log("--- 场景A（有红桃，索牌）---");
  console.log(`  驱动返回：希特威 ${a.before.hp}→${a.afterHp}`
    + ` 敌方手牌 ${a.before.foeHand}→${a.foeHandNow}`
    + ` 希特威手牌 ${a.targetHandNow}`);
  console.log(`  触发瞬间动画队列：${JSON.stringify(hitA[0]?.animTypes || null)}`
    + ` depth=${hitA[0]?.depth}`);
  console.log(`  返回时浮字 ${a.floats} 个，其中挂 onSettled ${a.floatsHooked} 个`);

  check("A1 伤害确实发生（前置条件，防假通过）",
    a.before.hp - a.afterHp > 0, `掉血 ${a.before.hp - a.afterHp}`);
  check("A2 确实触发了心血之咒（探针抓到快照）",
    hitA.length >= 1, `抓到 ${hitA.length} 次`);
  check("A3 挂起发生在真实伤害结算栈内（_damageDepth > 0）",
    (hitA[0]?.depth || 0) > 0, `depth=${hitA[0]?.depth}`);
  check("A4 效果已挂到本段受击浮字上（onSettled）",
    a.floats > 0 && a.floatsHooked > 0,
    `浮字 ${a.floats}，挂回调 ${a.floatsHooked}`);
  check("A5 驱动返回瞬间尚未索牌（延后，不是同步执行）",
    a.foeHandNow === a.before.foeHand && a.targetHandNow === 0,
    `敌方 ${a.foeHandNow}，希特威 ${a.targetHandNow}`);

  await settle(page);
  const afterA = await snapshot(page);
  const lA = await logs(page);
  lA.filter(t => /心血之咒/.test(t)).forEach(t => console.log("  " + t));
  check("A6 动画播完后索牌生效：敌方少一张、希特威多一张",
    afterA.foeHand === a.before.foeHand - 1 && afterA.targetHand === 1,
    `敌方 ${a.before.foeHand}→${afterA.foeHand}，希特威 ${afterA.targetHand}`);
  check("A7 索牌分支不造成反击伤害",
    afterA.foeHp === a.before.foeHp, `敌方血量 ${afterA.foeHp}`);

  // ---------- 场景 B：敌方无红桃 → 反击分支 ----------
  await startRegressionBattle(page);
  await hookCurse(page);
  const bb = await drive(page, { heart: false });
  const hitB = await page.evaluate("(() => window.__curseHits || [])()");
  console.log("--- 场景B（无红桃，反击）---");
  console.log(`  驱动返回：希特威 ${bb.before.hp}→${bb.afterHp}`
    + ` 敌方 ${bb.before.foeHp}→${bb.foeHpNow}`);
  console.log(`  返回时浮字 ${bb.floats} 个，其中挂 onSettled ${bb.floatsHooked} 个`);

  check("B1 伤害确实发生（前置条件）",
    bb.before.hp - bb.afterHp > 0, `掉血 ${bb.before.hp - bb.afterHp}`);
  check("B2 确实触发了心血之咒", hitB.length >= 1, `抓到 ${hitB.length} 次`);
  check("B3 本段受击浮字存在且已挂回调",
    bb.floats > 0 && bb.floatsHooked > 0,
    `浮字 ${bb.floats}，挂回调 ${bb.floatsHooked}`);
  // 反击同样延后：入反应队列 + requestFlush（回调结束后重新驱动结算），
  // 既不会打断链锯等多段的剩余段，也不会滞留不落地。故与 A 同口径断言延后。
  check("B4 反击（伤害类）同样延后，驱动返回时未结算",
    bb.before.foeHp - bb.foeHpNow === 0,
    `驱动返回时敌方掉血 ${bb.before.foeHp - bb.foeHpNow}，期望 0`);

  await settle(page);
  const afterB = await snapshot(page);
  const lB = await logs(page);
  lB.filter(t => /心血之咒/.test(t)).forEach(t => console.log("  " + t));
  check("B5 动画播完后反击伤害确已结算（防『根本没触发』假通过）",
    bb.before.foeHp - afterB.foeHp === 7,
    `敌方掉血 ${bb.before.foeHp - afterB.foeHp}，期望 7`);

  // ---------- 场景 C：对照【半魅魔血】——同样不是"伤害前"同步跑完 ----------
  await startRegressionBattle(page);
  const c = await page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    const actor = b.enemies[0];
    actor.hp = 500; actor.maxHp = 500;
    actor.stats = Object.assign({}, actor.stats || {}, { attack: 10 });
    b.allies.forEach((x, i) => { if (i > 0) x.hp = 0; x.hp = 999; x.maxHp = 999; });
    const target = b.allies[0];
    target.ref = "hoshino_kaiichi";
    target.skills = target.skills || [];
    if (!target.skills.some(s => s.name === "半魅魔血"))
      target.skills.push({ name: "半魅魔血", type: "passive" });
    target.hand = [];
    actor.hand = [];
    const card = window.CardUtils.fromEntity("杀（普攻）", { virtual: false });
    b.locked = false; b.animQueue = []; b.reactionQueue = [];
    window.BattleLog.clear(state);
    window.BattleSystem.useCard(state, actor, target, card);
    return { hp: target.hp };
  })()`);
  await settle(page);
  const cAfter = await page.evaluate(`(() => {
    const t = window.state.battle.allies[0];
    return { hand: (t.hand || []).length };
  })()`);
  console.log("--- 场景C（对照：半魅魔血）---");
  console.log(`  结算后星野一手牌 ${cAfter.hand}`);
  // 只作回归护栏：半魅魔血这条受击链未被本次改动波及。
  // 不再断言 locked/队列的瞬时值——交牌弹窗是否开启取决于摸到的牌是否
  // 已脱离 _pendingDraw，随动画时序波动，用它会让对照组自己变成噪声源。
  check("C1 对照组：半魅魔血受击摸牌仍正常（未被本次改动波及）",
    cAfter.hand >= 2, `手牌 ${cAfter.hand}`);

  check("Z 无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));

  console.log(`\n总计：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
