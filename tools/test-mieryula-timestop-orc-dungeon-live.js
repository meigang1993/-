// 米尔尤拉【神奇怀表】时停 · 兽人地下城全部技能入口是否都被压制
//
// 背景：此前逐轮补齐时停守卫时，是按「已发现的调用点」逐个补的，兽人地下城
// （data-future-orc-enemies.js / data-orc-bondi.js）这一族没有被单独扫过。
// 本轮逐个核对其全部技能入口：
//
//   魔王军自杀式无人机 无人机采精(active, AI 决策) / 自爆倒计时(passive, endTurn)
//   魔王军猛兽部队     火力压制(passive, beforeKillTargeted)
//   魔王军魔女         魔法巡飞弹(active, AI 决策)
//   魔王军机械三头犬   三头齐攻(passive, beforeKillTargeted)
//   兽人王邦迪         兽王之吼(passive, beforeKillTargeted)
//                      以牙还牙(passive, afterDamage)
//
// 查出真 BUG：【以牙还牙】有三处调用点，只有 battle-damage-triggers.js 那处
// 有守卫；battle-damage-hit.js 与 battle-damage-lifecycle.js 是 noAfterDamageTriggers
// 分支，绕过通用触发链单独调用，完全没判时停 —— 被时停的邦迪在这两条伤害路径下
// 仍会发动【以牙还牙】。已在这两处补判。
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

// 布阵：我方米尔尤拉（持神奇怀表）；敌方 0 号 = 兽人王邦迪
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.phase = 4;
  b.kaiichiShare = null; b.kaiichiShareQueue = [];
  b.mieryulaTimeStopOwner = null; b.mieryulaBloodthirstPicker = null;
  while (b.allies.length < 2) {
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
  });

  while (b.enemies.length < 2) {
    const n = b.enemies.length;
    b.enemies.push({ uid: "efill" + n, name: "补敌" + n, ref: "fill_e" + n, id: "fill_e" + n,
      gender: "male", side: "enemy", hp: 100, maxHp: 100, block: 0, hand: [], skills: [],
      statuses: [], battleRelics: [], stats: { attack: 4, magic: 4, speed: 4 } });
  }
  // enemies[0] = 兽人王邦迪（以牙还牙归属 target，即受伤方）
  const foe = b.enemies[0];
  foe.name = "兽人王邦迪"; foe.ref = "orc_king_bondi"; foe.id = "orc_king_bondi";
  foe.ai = "orc_king_bondi"; foe.gender = "male";
  foe.hp = foe.maxHp = 200; foe.block = 0;
  foe.statuses = []; foe.hand = []; foe.intent = 3;
  foe.stats = Object.assign({}, foe.stats || {}, { attack: 4, magic: 3, speed: 5 });
  foe.skills = [
    { name: "兽王之吼", type: "passive", icon: "⭐", text: "t" },
    { name: "以牙还牙", type: "passive", icon: "⭐", text: "t" },
  ];
  b.enemies[1].hp = b.enemies[1].maxHp = 100;
  b.enemies[1].statuses = []; b.enemies[1].hand = []; b.enemies[1].skills = [];
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

// 我方米尔尤拉对邦迪打出实体【杀】。
// noTrig=true 时给牌打上 noAfterDamageTriggers，走绕过通用触发链的备用分支
// （battle-damage-hit.js / battle-damage-lifecycle.js），正是本轮查出漏判的两条路径。
const slashTpl = noTrig => `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0], foe = b.enemies[0];
  b.animQueue = []; b.locked = false;
  st.log = [];
  const card = { name: "杀（普攻）", type: "slash", suit: "\\u2660",
    uid: "bd" + Date.now(), power: 4 };
  if (${noTrig}) card.noAfterDamageTriggers = true;
  m.hand.push(card);
  window.BattleSystem.useCard(st, m, foe, card);
  return { foeHp: foe.hp };
})()`;

const readTpl = `(() => {
  const st = window.state, b = st.battle;
  return {
    marked: (b.enemies[0].statuses || []).includes("时停"),
    foeHp: b.enemies[0].hp,
    logs: (st.log || []).map(String).filter(x => x.includes("以牙还牙")),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(300);

  const runOnce = async (cast, noTrig) => {
    await page.evaluate(setupTpl);
    const c = await page.evaluate(castTpl(cast));
    await page.evaluate(slashTpl(noTrig));
    await page.waitForTimeout(600);
    const r = await page.evaluate(readTpl);
    return { ...r, castMarked: c.marked };
  };

  // ── A 组：通用触发链（不带 noAfterDamageTriggers）──
  {
    console.log("\n── A 组：通用触发链 ──");
    const base = await runOnce(false, false);
    console.log(`   对照 以牙还牙日志=${JSON.stringify(base.logs)}`);
    T("A0 对照组：未时停时【以牙还牙】确实发动（断言非恒真）", base.logs.length > 0, base);
    const stop = await runOnce(true, false);
    console.log(`   时停 以牙还牙日志=${JSON.stringify(stop.logs)}`);
    T("A1 时停已施加到邦迪", stop.castMarked === true && stop.marked === true, stop);
    T("A2 时停后：通用触发链不再发动【以牙还牙】", stop.logs.length === 0, stop);
  }

  // ── B 组：noAfterDamageTriggers 备用分支（本轮查出漏判的两条路径）──
  {
    console.log("\n── B 组：noAfterDamageTriggers 备用分支 ──");
    const base = await runOnce(false, true);
    console.log(`   对照 以牙还牙日志=${JSON.stringify(base.logs)}`);
    T("B0 对照组：未时停时备用分支确实发动【以牙还牙】（断言非恒真）",
      base.logs.length > 0, base);
    const stop = await runOnce(true, true);
    console.log(`   时停 以牙还牙日志=${JSON.stringify(stop.logs)}`);
    T("B1 时停已施加到邦迪", stop.castMarked === true && stop.marked === true, stop);
    T("B2 时停后：备用分支不再发动【以牙还牙】", stop.logs.length === 0, stop);
  }

  const errs = relevantErrors(errors);
  T("Z0 无 JS 报错", errs.length === 0, errs.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  if (pass !== total) process.exit(1);
})();
