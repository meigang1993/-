// 米尔尤拉【神奇怀表】时停 · 怪物技能覆盖复查（回合外触发类）
//
// 背景：前几轮补的守卫集中在「杀牌前置链」与「受击/结束/回合开始」钩子，但仍有
// 一类怪物技能走的是**完全独立的入口**，与已有守卫不重合。本轮静态反查
// （tools/test-timestop-monster-skill-audit.js）扫出三条未覆盖的调用链：
//   1) 装甲运输车【坚硬装甲】· 无法恢复生命：EnemySkills.beforeHeal 链
//      （battle-card-specials / elrana-healing / hitwell / hoshino-kaiichi …）
//   2) 装甲运输车【坚硬装甲】· 免疫伤害：EnemySkills.modifyDamage 链
//      （battle-damage-resolution 里该调用没有 tsInStopped 包裹，
//        而同一技能的 immuneIncoming 分支却有 —— 同技能两条路覆盖不一致）
//   3) 樱羽丽莎【不死食尸鬼】免死：SakuraRisaSkills.preventDeath
//      （battle-damage-hit / battle-damage-lifecycle / battle-card-specials）
// 三者都在「被标记者回合之外」由我方行为触发，跳过回合挡不住。
//
// 每条断言都带「不施加时停」的对照组，确保断言不是恒真。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 布阵：我方米尔尤拉（持神奇怀表）；敌方装甲运输车 + 樱羽丽莎
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.phase = 4;
  b.kaiichiShare = null; b.kaiichiShareQueue = [];
  b.mieryulaTimeStopOwner = null; b.mieryulaBloodthirstPicker = null;
  while (b.allies.length < 3) {
    const n = b.allies.length;
    b.allies.push({ uid: "afill" + n, name: "补友" + n, ref: "fill_a" + n, id: "fill_a" + n,
      gender: "female", side: "ally", hp: 80, maxHp: 80, block: 0, hand: [], skills: [],
      statuses: [], battleRelics: [], stats: { attack: 4, magic: 4, speed: 4 } });
  }
  const m = b.allies[0];
  m.name = "米尔尤拉"; m.ref = "mieryula"; m.id = "mieryula"; m.gender = "female";
  m.stats = { attack: 4, magic: 2, speed: 5 }; m.tempAttack = 0;
  m.hp = m.maxHp = 52; m.bloodlust = 1; m.bloodlustMax = 1; m.hand = [];
  m.skills = [
    { name: "无谋霸姬", type: "passive" },
    { name: "神奇怀表", type: "active", card: { name: "神奇怀表", type: "tactic",
      mieryulaTimeStop: true, targetless: true, icon: "🔺", text: "t" } },
  ];
  m.usedMieryulaTimeStop = false;
  b.allies.slice(1).forEach(a => {
    a.hp = a.maxHp = 80; a.block = 0; a.hand = []; a.statuses = []; a.skills = [];
    a.stats = Object.assign({}, a.stats || {}, { attack: 6, magic: 4, speed: 4 });
  });

  while (b.enemies.length < 2) {
    const n = b.enemies.length;
    b.enemies.push({ uid: "efill" + n, name: "补敌" + n, ref: "fill_e" + n, id: "fill_e" + n,
      gender: "male", side: "enemy", hp: 100, maxHp: 100, block: 0, hand: [], skills: [],
      statuses: [], battleRelics: [], stats: { attack: 4, magic: 4, speed: 4 } });
  }
  // enemies[0] = 装甲运输车（坚硬装甲：免疫伤害 + 无法恢复生命）
  const carrier = b.enemies[0];
  carrier.name = "装甲运输车"; carrier.ref = "ruins_carrier"; carrier.id = "ruins_carrier";
  carrier.ai = "ruins_carrier"; carrier.gender = "male";
  carrier.hp = 60; carrier.maxHp = 100; carrier.block = 0; carrier.statuses = [];
  carrier.hand = []; carrier.battleRelics = [];
  carrier.stats = Object.assign({}, carrier.stats || {}, { attack: 4, magic: 3, speed: 3 });
  carrier.skills = [{ name: "坚硬装甲", type: "passive", icon: "⭐", text: "t" }];
  // enemies[1] = 樱羽丽莎（不死食尸鬼：有手牌时免死）
  const risa = b.enemies[1];
  risa.name = "樱羽丽莎"; risa.ref = "assassin_sakura_risa"; risa.id = "assassin_sakura_risa";
  risa.ai = "assassin_sakura_risa"; risa.gender = "female";
  risa.hp = 30; risa.maxHp = 30; risa.block = 0; risa.statuses = [];
  risa.risaRevivePending = false; risa.deathDiscarded = undefined;
  risa.hand = [{ name: "闪", type: "dodge", suit: "♦", uid: "rs" + Date.now() }];
  risa.battleRelics = [];
  risa.stats = Object.assign({}, risa.stats || {}, { attack: 4, magic: 3, speed: 5 });
  risa.skills = [{ name: "不死食尸鬼", type: "passive", icon: "⭐", text: "t" }];
  st.log = [];
  window.render();
  return { ok: true, allies: b.allies.length, foes: b.enemies.length };
})()`;

// 真实出牌施加时停（cast=false 为对照组）
const castTpl = cast => `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0];
  if (${cast}) {
    const card = { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true,
      targetless: true, icon: "🔺", text: "t", _skill: true };
    m.hand.push(card);
    window.BattleSystem.useCard(st, m, m, card);
  }
  return { marked: (b.enemies[0].statuses || []).includes("时停") };
})()`;

// A：治疗装甲运输车 → 走 EnemySkills.beforeHeal → 坚硬装甲「无法恢复生命」
const healCarrierTpl = `(() => {
  const st = window.state, b = st.battle;
  const healer = b.allies[1], carrier = b.enemies[0];
  b.animQueue = []; b.locked = false;
  st.log = [];
  carrier.hp = 60;
  const hpBefore = carrier.hp;
  const card = { name: "伤口处理", type: "tactic", healPct: 0.5, uid: "hc" + Date.now() };
  healer.hand.push(card);
  window.BattleSystem.useCard(st, healer, carrier, card);
  return { hpBefore };
})()`;

// B：实体【杀】打装甲运输车 → 走 EnemySkills.modifyDamage → 坚硬装甲免疫
const hitCarrierTpl = `(() => {
  const st = window.state, b = st.battle;
  const a1 = b.allies[1], carrier = b.enemies[0];
  b.animQueue = []; b.locked = false;
  st.log = [];
  carrier.hp = 60;
  const hpBefore = carrier.hp;
  const card = { name: "杀（普攻）", type: "slash", suit: "\\u2660", uid: "bk" + Date.now() };
  a1.hand.push(card);
  window.BattleSystem.useCard(st, a1, carrier, card);
  return { hpBefore };
})()`;

// C：实体【杀】打死樱羽丽莎 → 走 SakuraRisaSkills.preventDeath → 不死食尸鬼
// （浏览器里没有可直接调用的直伤 API，故把血量压到 1 再用实体杀收尾）
const killRisaTpl = `(() => {
  const st = window.state, b = st.battle;
  const a1 = b.allies[1], risa = b.enemies[1];
  b.animQueue = []; b.locked = false;
  st.log = [];
  risa.hp = 1; risa.maxHp = 30; risa.risaRevivePending = false;
  risa.statuses = (risa.statuses || []).filter(s => s !== "待复活" && s !== "时停");
  if ((b.enemies[0].statuses || []).includes("时停")) risa.statuses.push("时停");
  risa.hand = [{ name: "闪", type: "dodge", suit: "♦", uid: "rs" + Date.now() }];
  const before = risa.hp;
  const card = { name: "杀（普攻）", type: "slash", suit: "\\u2660", uid: "rk" + Date.now() };
  a1.hand.push(card);
  window.BattleSystem.useCard(st, a1, risa, card);
  return { before };
})()`;

const readTpl = () => `(() => {
  const st = window.state, b = st.battle;
  const logs = (st.log || []).map(String);
  return {
    carrierHp: b.enemies[0].hp,
    risaHp: b.enemies[1].hp,
    risaPending: !!b.enemies[1].risaRevivePending,
    revive: logs.filter(x => x.includes("不死食尸鬼")),
    markedCarrier: (b.enemies[0].statuses || []).includes("时停"),
    markedRisa: (b.enemies[1].statuses || []).includes("时停"),
    all: logs.slice(0, 8),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(300);

  // ── A 组：装甲运输车【坚硬装甲】· 无法恢复生命 ──
  const runHeal = async (cast) => {
    await page.evaluate(setupTpl);
    const c = await page.evaluate(castTpl(cast));
    await page.waitForTimeout(400);
    const before = await page.evaluate(healCarrierTpl);
    await page.waitForTimeout(2500);
    const r = await page.evaluate(readTpl());
    return { c, before, r };
  };

  console.log("\n── A 对照组：不施加时停 ──");
  const ctlA = await runHeal(false);
  console.log(`   装甲运输车 ${ctlA.before.hpBefore} → ${ctlA.r.carrierHp}（坚硬装甲应拦住治疗）`);
  console.log("\n── A 实验组：施加时停 ──");
  const expA = await runHeal(true);
  console.log(`   标记=${expA.c.marked}；装甲运输车 ${expA.before.hpBefore} → ${expA.r.carrierHp}（应回血）`);
  console.log(`   实验日志：${JSON.stringify(expA.r.all)}`);

  T("A0 对照组：未时停时【坚硬装甲】确实拦住治疗（断言非恒真）",
    ctlA.r.carrierHp === ctlA.before.hpBefore, ctlA);
  T("A1 时停标记已施加到装甲运输车身上", expA.c.marked === true, expA.c);
  T("A2 时停后【坚硬装甲】不再拦治疗，装甲运输车能回血",
    expA.r.carrierHp > expA.before.hpBefore, expA);

  // ── B 组：装甲运输车【坚硬装甲】· 免疫伤害（EnemySkills.modifyDamage 链）──
  const runHit = async (cast) => {
    await page.evaluate(setupTpl);
    const c = await page.evaluate(castTpl(cast));
    await page.waitForTimeout(400);
    const before = await page.evaluate(hitCarrierTpl);
    await page.waitForTimeout(2500);
    const r = await page.evaluate(readTpl());
    return { c, before, r };
  };

  console.log("\n── B 对照组：不施加时停 ──");
  const ctlB = await runHit(false);
  console.log(`   装甲运输车 ${ctlB.before.hpBefore} → ${ctlB.r.carrierHp}（坚硬装甲应免疫）`);
  console.log("\n── B 实验组：施加时停 ──");
  const expB = await runHit(true);
  console.log(`   标记=${expB.c.marked}；装甲运输车 ${expB.before.hpBefore} → ${expB.r.carrierHp}（应掉血）`);

  T("B0 对照组：未时停时【坚硬装甲】确实免疫实体杀（断言非恒真）",
    ctlB.r.carrierHp === ctlB.before.hpBefore, ctlB);
  T("B1 时停后【坚硬装甲】不再免疫，装甲运输车掉血",
    expB.r.carrierHp < expB.before.hpBefore, expB);

  // ── C 组：樱羽丽莎【不死食尸鬼】免死 ──
  const runRisa = async (cast) => {
    await page.evaluate(setupTpl);
    const c = await page.evaluate(castTpl(cast));
    await page.waitForTimeout(400);
    const before = await page.evaluate(killRisaTpl);
    await page.waitForTimeout(1500);
    const r = await page.evaluate(readTpl());
    return { c, before, r };
  };

  console.log("\n── C 对照组：不施加时停 ──");
  const ctlC = await runRisa(false);
  console.log(`   樱羽丽莎 ${ctlC.before.before} → ${ctlC.r.risaHp}，待复活=${ctlC.r.risaPending}，日志 ${ctlC.r.revive.length} 条`);
  console.log("\n── C 实验组：施加时停 ──");
  const expC = await runRisa(true);
  console.log(`   标记=${expC.r.markedRisa}；樱羽丽莎 ${expC.before.before} → ${expC.r.risaHp}，待复活=${expC.r.risaPending}`);
  console.log(`   实验日志：${JSON.stringify(expC.r.all)}`);

  T("C0 对照组：未时停时【不死食尸鬼】确实免死（断言非恒真）",
    ctlC.r.revive.length > 0 && ctlC.r.risaPending === true, ctlC.r);
  T("C1 时停标记已施加到樱羽丽莎身上", expC.r.markedRisa === true, expC.r);
  T("C2 时停后【不死食尸鬼】不再免死，樱羽丽莎不进入待复活",
    expC.r.revive.length === 0 && expC.r.risaPending === false, expC.r);

  const bad = relevantErrors(errors);
  T("Z0 无 JS 报错", bad.length === 0, bad.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
