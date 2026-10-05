// 专项：卡洛斯【疯狂刺刀】× 受击 / 弹窗类技能的交互严格检查
//
// 疯狂刺刀：锁定技，当你使用的单体【杀】未被【闪】抵消并造成伤害后
// （造成护甲值伤害也算），你对目标追加 X 次等同于你攻击力的无视护甲伤害
// （X 为你当前手牌中的【杀】数）。
//
// 关注点：
//  实现里是裸 for 循环直接调 api.directDamage，既没有 BattleReactionQueue
//  入队，也没有 greenGatlingResume / comboAttackResume 那样的挂起机制。
//  电钻火花的注释明确指出：「直接调 directDamage 会被 locked 分支整段吞掉」。
//  所以第一段伤害若触发受击方的弹窗类技能（星野一【半魅魔血】交牌），
//  battle.locked 置真后，剩余追加段很可能整段丢失。
//
// 对照：电钻火花 / 伊迪斯链锯走 BattleReactionQueue.enqueue；
//       格林机枪有 greenGatlingResume；组合进攻有 comboAttackResume。
//
// 防假通过：先断言「追加段确实发生（段数 ≥ 2）」，再比对总伤害与触发次数。
// 期望段数按实战攻击力实时计算，不写死数值。
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
    // 真实游戏由生命周期自动 flush；本环境动画驱动不到，故手动 flush，
    // 否则入队的追加段会一直挂着不结算（伊迪斯 / 电钻火花属此类）。
    await page.evaluate(`(() => {
      const st = window.state, b = st.battle || {};
      if (window.BattleReactionQueue?.pending?.(b)) {
        window.BattleReactionQueue.flush(st, window.BattleSystem.damage);
      }
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

// 构造卡洛斯的单体杀命中并驱动疯狂刺刀（直接调用真实触发点）
async function runBayonet(page, { killCount = 3, skills = [], ref = null }) {
  return page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    const carlos = b.enemies[0];
    carlos.ref = "carlos";
    carlos.name = "卡洛斯";
    carlos.hp = 500; carlos.maxHp = 500;
    // 手牌只放杀，数量即追加段数 X
    carlos.hand = Array.from({ length: ${killCount} }, () =>
      window.CardUtils.fromEntity("杀（普攻）", {}));
    b.allies.forEach((a, i) => { if (i > 0) a.hp = 0; });
    const target = b.allies[0];
    ${ref ? `target.ref = "${ref}";` : ""}
    ${JSON.stringify(skills)}.forEach(name => {
      target.skills = target.skills || [];
      if (!target.skills.some(s => s.name === name))
        target.skills.push({ name, type: "passive" });
    });
    target.hp = 999; target.maxHp = 999;
    b.locked = false;
    b.animQueue = [];
    const atk = (carlos.stats?.attack || 0) + (carlos.tempAttack || 0);
    const card = window.CardUtils.fromEntity("杀（普攻）", {});
    const before = { hp: target.hp, atk };
    window.FloraCarlosSkills.afterSlashDamage(state, carlos, target, card, 5,
      { damage: window.BattleSystem.damage,
        directDamage: window.BattleSystem.damage.directDamage, blockLoss: 0 });
    const b2 = window.state.battle;
    return { before, locked: !!b2.locked,
      kaiichiShare: !!b2.kaiichiShare };
  })()`);
}

// 入队后伤害异步结算，须在 settle 之后再读血量，同步读会漏算未 flush 的段
const hpOf = page => page.evaluate(
  `window.state.battle.allies[0].hp`);

const hitLines = (all, src) => all.filter(t =>
  t.includes(src) && /造成\d+点/.test(t));
const segCount = (all, src) => hitLines(all, src).length;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  // ---- 场景 1：普通目标（无受击技能），X = 3 ----
  const s1 = await runBayonet(page, { killCount: 3 });
  await settle(page);
  s1.afterHp = await hpOf(page);
  const l1 = await logs(page);
  const seg1 = segCount(l1, "疯狂刺刀");
  console.log("--- 场景1 普通目标 ---");
  console.log(`  攻击力=${s1.before.atk} 段数=${seg1} 掉血=${s1.before.hp - s1.afterHp}`);
  hitLines(l1, "疯狂刺刀").forEach(t => console.log("  " + t));
  check("1 疯狂刺刀发动且多段发生（段数 ≥ 2）", seg1 >= 2, `段数 ${seg1}`);
  check("1 X=3 段追加伤害全部打出（段数 = 3）", seg1 === 3, `段数 ${seg1}`);
  check("1 总伤害 = 3 × 攻击力",
    s1.before.hp - s1.afterHp === 3 * s1.before.atk,
    `掉血 ${s1.before.hp - s1.afterHp}，期望 ${3 * s1.before.atk}`);

  // ---- 场景 2：目标 = 星野一（半魅魔血，受击摸牌 + 弹交牌窗）----
  await startRegressionBattle(page);
  const s2 = await runBayonet(page, {
    killCount: 3, ref: "hoshino_kaiichi", skills: ["半魅魔血"],
  });
  console.log("--- 场景2 半魅魔血 首段后 ---");
  console.log(`  locked=${s2.locked} kaiichiShare=${s2.kaiichiShare}`);
  await settle(page);
  s2.afterHp = await hpOf(page);
  const l2 = await logs(page);
  const seg2 = segCount(l2, "疯狂刺刀");
  const kaiichi2 = l2.filter(t => t.includes("半魅魔血")).length;
  console.log(`  段数=${seg2} 掉血=${s2.before.hp - s2.afterHp} 半魅魔血相关日志=${kaiichi2}`);
  hitLines(l2, "疯狂刺刀").forEach(t => console.log("  " + t));
  check("2 半魅魔血：追加段不被交牌弹窗截断（段数 = 3）", seg2 === 3,
    `段数 ${seg2}`);
  check("2 半魅魔血：总伤害 = 3 × 攻击力",
    s2.before.hp - s2.afterHp === 3 * s2.before.atk,
    `掉血 ${s2.before.hp - s2.afterHp}，期望 ${3 * s2.before.atk}`);
  check("2 半魅魔血：逐段触发（受击技能触发 3 次）", kaiichi2 >= 3,
    `触发相关日志 ${kaiichi2} 行`);

  // ---- 场景 3：X = 5，目标带半魅魔血（放大段数以暴露截断）----
  await startRegressionBattle(page);
  const s3 = await runBayonet(page, {
    killCount: 5, ref: "hoshino_kaiichi", skills: ["半魅魔血"],
  });
  await settle(page);
  s3.afterHp = await hpOf(page);
  const l3 = await logs(page);
  const seg3 = segCount(l3, "疯狂刺刀");
  console.log("--- 场景3 半魅魔血 X=5 ---");
  console.log(`  段数=${seg3} 掉血=${s3.before.hp - s3.afterHp}`);
  check("3 X=5：追加段不被截断（段数 = 5）", seg3 === 5, `段数 ${seg3}`);
  check("3 X=5：总伤害 = 5 × 攻击力",
    s3.before.hp - s3.afterHp === 5 * s3.before.atk,
    `掉血 ${s3.before.hp - s3.afterHp}，期望 ${5 * s3.before.atk}`);

  // ---- 场景 4：对照 —— 电钻火花（已有入队机制）应不丢段 ----
  await startRegressionBattle(page);
  const s4 = await page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    const dragon = b.enemies[0];
    dragon.ai = "ruins_dragon"; dragon.name = "机械AI龙";
    dragon.hp = 500; dragon.maxHp = 500;
    b.allies.forEach((a, i) => { if (i > 0) a.hp = 0; });
    const target = b.allies[0];
    target.ref = "hoshino_kaiichi";
    target.skills = [{ name: "半魅魔血", type: "passive" }];
    target.hp = 999; target.maxHp = 999;
    b.locked = false; b.animQueue = [];
    const atk = (dragon.stats?.attack || 0) + (dragon.tempAttack || 0);
    const card = window.CardUtils.fromEntity("杀（普攻）", {});
    const before = { hp: target.hp, atk };
    window.RuinsDragonSkills.afterDamage(state, dragon, target, card, 5,
      window.BattleSystem.damage, window.BattleSystem.damage.directDamage);
    // 电钻火花只 enqueue、不自行 flush（依赖生命周期自动 flush），
    // 本环境动画队列驱动不到，故手动 flush 一次以验证入队内容。
    if (window.BattleReactionQueue?.pending?.(state.battle || state)) {
      window.BattleReactionQueue.flush(state, window.BattleSystem.damage);
    }
    return { before };
  })()`);
  await settle(page);
  s4.afterHp = await hpOf(page);
  const l4 = await logs(page);
  const seg4 = segCount(l4, "电钻火花");
  const rollLine = l4.find(t => t.includes("骰子点数"));
  console.log("--- 场景4 对照：电钻火花 ---");
  console.log(`  ${rollLine || ""}`);
  console.log(`  段数=${seg4} 掉血=${s4.before.hp - s4.afterHp}`);
  const rollMatch = rollLine && rollLine.match(/骰子点数(\d+)/);
  const roll = rollMatch ? Number(rollMatch[1]) : null;
  check("4 对照：电钻火花段数 = 骰子点数（入队机制有效）",
    roll !== null && seg4 === roll, `骰子 ${roll}，段数 ${seg4}`);

  // ---- 场景 5：对照 —— 伊迪斯【狂暴链锯】追加段（同样有入队机制）----
  await startRegressionBattle(page);
  const s5 = await page.evaluate(`(() => {
    const state = window.state, b = state.battle;
    const e = b.enemies[0];
    e.ai = "pursuer_edis"; e.name = "伊迪斯";
    e.hp = 500; e.maxHp = 500;
    e.stats = e.stats || {}; e.stats.handLimit = 5;
    // 手牌 8 张 > 上限 5 → 追加 3 段
    e.hand = Array.from({ length: 8 }, () =>
      window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
    b.allies.forEach((a, i) => { if (i > 0) a.hp = 0; });
    const target = b.allies[0];
    target.ref = "hoshino_kaiichi";
    target.skills = [{ name: "半魅魔血", type: "passive" }];
    target.hp = 999; target.maxHp = 999;
    // 伊迪斯追加段走可被响应的 damage（非 directDamage），友方手牌里的闪会
    // 自动抵消追加段，段数因此不足——测"是否被弹窗截断"须先排除响应干扰
    b.allies.forEach(a => { a.hand = []; a.block = 0; });
    // 追加段会落到其他存活友方，全员装备半魅魔血才能按触发次数判定逐段
    b.allies.forEach(a => { a.ref = "hoshino_kaiichi";
      a.skills = [{ name: "半魅魔血", type: "passive" }];
      a.hp = 999; a.maxHp = 999; });
    b.locked = false; b.animQueue = [];
    const atk = (e.stats?.attack || 0) + (e.tempAttack || 0);
    // 伊迪斯要求实体牌：fromEntity 默认 virtual:true 会被 repeatActions 跳过
    const card = window.CardUtils.fromEntity("杀（普攻）", { virtual: false });
    card.edisChain = true; card._edisPrePlayHand = 8;
    const before = { hp: target.hp, atk };
    window.EdisSkills.afterDamage(state, e, target, card, 5,
      window.BattleSystem.damage, 0);
    const b3 = window.state.battle;
    return { before,
      diag: { ai: e.ai, handLen: e.hand.length, handLimit: e.stats?.handLimit,
        isEntity: window.CardUtils.isEntitySingleKill?.(card) ?? "n/a",
        cardVirtual: !!card.virtual, edisChain: !!card.edisChain,
        pend: window.BattleReactionQueue?.pending?.(b3) || false,
        edisFn: typeof window.EdisSkills?.afterDamage } };
  })()`);
  await settle(page);
  s5.afterHp = await hpOf(page);
  const l5 = await logs(page);
  const seg5 = l5.filter(t => /造成\d+点|造成\d+伤害/.test(t)
    && !t.includes("疯狂刺刀") && !t.includes("电钻火花")).length;
  const chainLine = l5.find(t => t.includes("额外结算"));
  console.log("--- 场景5 对照：伊迪斯狂暴链锯 ---");
  console.log("  诊断: " + JSON.stringify(s5.diag));
  console.log(`  ${chainLine || ""}`);
  console.log(`  段数=${seg5} 掉血=${s5.before.hp - s5.afterHp} 攻击力=${s5.before.atk}`);
  console.log("  段数按日志命中行数计（含落到其他友方的追加段）");
  check("5 对照：伊迪斯追加段不被交牌弹窗截断（段数 ≥ 3）", seg5 >= 3,
    `段数 ${seg5}`);
  // 追加段可被闪响应、且会落到其他存活友方，掉血不适合做判据；
  // 改按受击技能触发次数判定（与伊迪斯专项测试同口径）
  const extra5m = l5.map(t => t.match(/额外结算(\d+)次/)).find(Boolean);
  const extra5 = extra5m ? +extra5m[1] : 0;
  const kaiichi5 = l5.filter(t => t.includes("半魅魔血令其摸")).length;
  check("5 对照：伊迪斯追加段确实发生（多段非空转）", extra5 >= 1,
    `额外结算 ${extra5} 次`);
  check("5 对照：半魅魔血随追加段逐段触发",
    kaiichi5 >= extra5 && kaiichi5 > 1,
    `触发 ${kaiichi5} 次，额外结算 ${extra5} 次（合并时应为 1）`);

  check("无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})();
