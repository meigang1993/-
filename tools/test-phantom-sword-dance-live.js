// 专项：安倍麦克【幻影剑舞】× 受击 / 反击类技能的交互严格检查
//
// 幻影剑舞：锁定技，结束阶段，你随机选择一名敌方角色，视为对其使用 X 张
// 不可被响应的虚拟【杀（普攻）】（X 为你本回合使用的实体【杀】数）。
//
// 关注点：
//  1) X 段伤害是否全部打出。实现里循环条件含 `!state.battle?.locked`，
//     而第一段伤害触发受击类弹窗（半魅魔血交牌）会置 locked，
//     理论上会把剩余段截断——这正是本用例要验的核心。
//  2) 受击类（半魅魔血摸牌）是否逐段触发。
//  3) 反击类（心血之咒索取红桃 / 失败反击）是否逐段触发。
//  4) 不可被响应：目标持有【闪】时不应弹响应窗口。
//
// 防假通过：每个场景先断言「多段确实发生（段数 ≥ 2）」，再比对触发次数。
// 期望段数一律按实战攻击力实时计算，不写死数值。
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
    await page.waitForTimeout(400);
  }
  await dismissPrompts(page);
  await page.waitForTimeout(300);
}

// 构造安倍麦克的结束阶段并直接驱动（敌方 AI 回合不推进，必须直接驱动）
// skills: 注入给目标的技能名数组；ref: 覆盖角色标识
async function runDance(page, { times, ref = null, skills = [], giveDodge = false }) {
  return page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    const mike = b.enemies[0];
    mike.ai = "abe_mike";
    mike.name = "鱼人武士安倍麦克";
    mike.hp = 500; mike.maxHp = 500;
    mike.abeMikeDanceTurn = null;
    mike.entitySlashThisTurn = ${times};
    // 只留一名存活友方，保证随机指定必然命中它
    b.allies.forEach((a, i) => { if (i > 0) { a.hp = 0; } });
    const target = b.allies[0];
    ${ref ? `target.ref = "${ref}";` : ""}
    ${JSON.stringify(skills)}.forEach(name => {
      target.skills = target.skills || [];
      if (!target.skills.some(s => s.name === name))
        target.skills.push({ name, type: "passive" });
    });
    if (${giveDodge}) {
      target.hand = [1, 2, 3].map(() => window.CardUtils.fromEntity("闪", {}));
    }
    target.hp = 999; target.maxHp = 999;
    b.locked = false;
    b.animQueue = [];
    const atk = (mike.stats?.attack || 0) + (mike.tempAttack || 0);
    const before = { hp: target.hp, atk };
    window.AbeMikeSkills.endTurn(state, mike, window.BattleSystem.damage);
    const b2 = window.state.battle;
    return {
      before,
      afterHp: target.hp,
      locked: !!b2.locked,
      kaiichiShare: !!b2.kaiichiShare,
      counter: !!b2.counterTrigger,
      manualDodge: !!b2.manualDodge,
    };
  })()`);
}

const hitLines = (all, src) => all.filter(t =>
  t.includes(src) && /造成\d+伤害/.test(t));
const segCount = (all, src) => hitLines(all, src).length;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  // ---- 场景 1：普通目标（无受击/反击技能），X = 3 ----
  const s1 = await runDance(page, { times: 3 });
  await settle(page);
  const l1 = await logs(page);
  const seg1 = segCount(l1, "幻影剑舞");
  console.log("--- 场景1 ---");
  console.log(`  攻击力=${s1.before.atk} 段数=${seg1} 掉血=${s1.before.hp - s1.afterHp}`);
  hitLines(l1, "幻影剑舞").forEach(t => console.log("  " + t));
  check("1 幻影剑舞发动且多段发生（段数 ≥ 2）", seg1 >= 2, `段数 ${seg1}`);
  check("1 X=3 段伤害全部打出（段数 = 3）", seg1 === 3, `段数 ${seg1}`);
  check("1 总伤害 = 3 × 攻击力",
    s1.before.hp - s1.afterHp === 3 * s1.before.atk,
    `掉血 ${s1.before.hp - s1.afterHp}，期望 ${3 * s1.before.atk}`);

  // ---- 场景 2：目标 = 星野一（半魅魔血，受击摸牌 + 弹交牌窗）----
  await startRegressionBattle(page);
  const s2 = await runDance(page, {
    times: 3, ref: "hoshino_kaiichi", skills: ["半魅魔血"],
  });
  console.log("--- 场景2 首段后 ---");
  console.log(`  locked=${s2.locked} kaiichiShare=${s2.kaiichiShare}`);
  await settle(page);
  const l2 = await logs(page);
  const seg2 = segCount(l2, "幻影剑舞");
  // 每次触发会写「发动技能【半魅魔血】」+「半魅魔血令其摸2张牌」两行，
  // 只按后者计数才是真实触发次数；前者会把 1 次触发数成 2 次。
  const blood2 = l2.filter(t => /半魅魔血令其摸/.test(t));
  // 驱动返回时后续段还压在反应队列里（交牌窗未处理），此时读到的是中间值，
  // 必须等 settle 之后再读总掉血，否则会把「段已结算」误读成「伤害丢失」。
  const hp2 = await page.evaluate(`(() => window.state.battle.allies[0].hp)()`);
  const lost2 = 999 - hp2;
  console.log(`  段数=${seg2} 半魅魔血触发=${blood2.length} 总掉血=${lost2}`
    + `（驱动返回瞬间 ${s2.before.hp - s2.afterHp}，中间值）`);
  blood2.forEach(t => console.log("  " + t));
  check("2 半魅魔血逐段触发（期望 3 次）", blood2.length === 3,
    `实际 ${blood2.length} 次`);
  check("2 X=3 段伤害全部打出（不被交牌窗截断）", seg2 === 3, `段数 ${seg2}`);
  check("2 三段总伤害 = 3 × 攻击力", lost2 === 3 * s2.before.atk,
    `总掉血 ${lost2}，期望 ${3 * s2.before.atk}`);

  // ---- 场景 3：目标 = 希特威（心血之咒，受击索取红桃；无红桃则反击）----
  await startRegressionBattle(page);
  const s3 = await runDance(page, {
    times: 3, ref: "hitwell", skills: ["心血之咒"],
  });
  console.log("--- 场景3 首段后 ---");
  console.log(`  locked=${s3.locked}`);
  await settle(page);
  const l3 = await logs(page);
  const seg3 = segCount(l3, "幻影剑舞");
  // 每次触发写「触发心血之咒…」一行，反击成功另写「的心血之咒对…造成伤害」，
  // 只按「触发心血之咒」计数才是真实触发次数。
  const curse3 = l3.filter(t => /触发心血之咒/.test(t));
  console.log(`  段数=${seg3} 心血之咒触发=${curse3.length} 掉血=${s3.before.hp - s3.afterHp}`);
  curse3.forEach(t => console.log("  " + t));
  check("3 心血之咒逐段触发（期望 3 次）", curse3.length === 3,
    `实际 ${curse3.length} 次`);
  check("3 X=3 段伤害全部打出", seg3 === 3, `段数 ${seg3}`);

  // ---- 场景 4：不可被响应（目标满手【闪】）----
  await startRegressionBattle(page);
  const s4 = await runDance(page, { times: 3, giveDodge: true });
  await settle(page);
  const l4 = await logs(page);
  const seg4 = segCount(l4, "幻影剑舞");
  const dodge4 = l4.filter(t => /闪/.test(t));
  console.log("--- 场景4 ---");
  console.log(`  manualDodge=${s4.manualDodge} 段数=${seg4} 掉血=${s4.before.hp - s4.afterHp}`);
  dodge4.forEach(t => console.log("  " + t));
  check("4 不可被响应：未弹出闪响应窗口", !s4.manualDodge);
  check("4 不可被响应：闪未被消耗（响应牌不触发）",
    dodge4.filter(t => /打出|使用/.test(t)).length === 0,
    JSON.stringify(dodge4.slice(0, 2)));
  check("4 X=3 段伤害全部打出", seg4 === 3, `段数 ${seg4}`);

  check("无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));

  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("崩溃:", e); process.exit(1); });
