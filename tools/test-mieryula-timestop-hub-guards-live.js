// 米尔尤拉【神奇怀表】时停 · 派发中枢（hub）级守卫是否覆盖全部技能类型
//
// 背景：时停的「禁用技能」原先只挂在少数几个点：
//   · battle-card-playability.js（canPlay）—— 仅覆盖手牌主动技牌
//   · ruins-witherer-skills.js —— 仅覆盖凋零者自己的被动/结束阶段技
// 但项目里技能按 type 分 active / passive / trigger 三类，且大量被动并不走 canPlay，
// 而是由「派发中枢」统一转发：
//   · battle-damage-triggers.js  afterDamage / afterDodged（受击被动、反击触发）
//   · battle-end-phase.js        endTurn（结束阶段技）
//   · battle-card-resume-hooks.js afterCardPlayed（出牌后的技能钩子）
//   · battle-damage-resolution.js modifyOutgoing/IncomingDamage（增减伤被动、免疫被动）
//   · battle-turn-start.js       beginTurn（回合开始技）
// 本文件实测「结束阶段技」这条中枢，并静态校验其余中枢均已加判。
require("./repository-toolchain");
const fs = require("fs");
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

const ROOT = path.join(__dirname, "..");
const read = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");

// 场景：我方米尔尤拉 + 敌方 0 号（作为「被时停单位」）
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.phase = 4;
  b.kaiichiShare = null; b.kaiichiShareQueue = [];
  b.mieryulaTimeStopOwner = null; b.mieryulaBloodthirstPicker = null;
  delete b.endPhaseStep; delete b.endPhaseUnitUid;
  const m = b.allies[0];
  m.name = "米尔尤拉"; m.ref = "mieryula"; m.id = "mieryula"; m.gender = "female";
  m.stats = { attack: 4, magic: 2, speed: 5 }; m.hp = m.maxHp = 52; m.hand = [];
  m.usedMieryulaTimeStop = false;
  m.skills = [
    { name: "无谋霸姬", type: "passive" },
    { name: "神奇怀表", type: "active", card: { name: "神奇怀表", type: "tactic",
      mieryulaTimeStop: true, targetless: true, icon: "🔺", text: "t" } },
  ];
  b.allies.slice(1).forEach(a => { a.hp = a.maxHp = 80; a.block = 0; a.statuses = []; });
  const w = b.enemies[0];
  w.ref = "ts_foe"; w.id = "ts_foe"; w.gender = "male"; w.ai = "ruins_grunt";
  w.hp = w.maxHp = 200; w.block = 0; w.statuses = []; w.hand = [];
  b.enemies.slice(1).forEach(e => { e.hp = e.maxHp = 60; e.block = 0; e.statuses = []; });
  // 探针：只要中枢真的转发了结束阶段，就能数到。
  window.__spy = { endTurn: 0 };
  const hs = window.HoshinoSkills || (window.HoshinoSkills = {});
  if (!hs.__tsSpied) {
    const orig = hs.endTurn;
    hs.endTurn = (...args) => { window.__spy.endTurn += 1; return orig ? orig(...args) : undefined; };
    hs.__tsSpied = true;
  }
  st.log = [];
  window.render();
  return { ok: true, spy: typeof hs.endTurn };
})()`;

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

// 驱动一次「结束阶段」：直接调派发中枢（与回合结束走同一入口）
const endPhaseTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  delete b.endPhaseStep; delete b.endPhaseUnitUid;
  window.__spy.endTurn = 0;
  const allUnits = bb => (bb.allies || []).concat(bb.enemies || []);
  const EP = window.BattleEndPhase({
    allUnits,
    combat: { damage: () => {}, pushFloat: () => {} },
    draw: (unit, n) => n,
  });
  const ret = EP.run(st, b.enemies[0]);
  return { ret, endTurn: window.__spy.endTurn };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(300);

  const run = async cast => {
    await page.evaluate(setupTpl);
    const c = await page.evaluate(castTpl(cast));
    await page.waitForTimeout(500);
    const e = await page.evaluate(endPhaseTpl);
    await page.waitForTimeout(300);
    return { c, e };
  };

  const ctl = await run(false);
  const exp = await run(true);
  console.log(`   对照：标记=${ctl.c.marked} 结束阶段转发=${ctl.e.endTurn}`);
  console.log(`   实验：标记=${exp.c.marked} 结束阶段转发=${exp.e.endTurn}`);

  T("C1 对照组：未时停时结束阶段中枢正常转发（探针能数到）", ctl.e.endTurn >= 1, ctl.e);
  T("A1 时停标记已施加到敌方 0 号", exp.c.marked === true, exp.c);
  T("A2 时停后：结束阶段技全部被禁用（中枢不再转发）", exp.e.endTurn === 0, exp.e);
  T("A3 时停后：回合清理仍照常完成（未提前 return 卡住流程）", exp.e.ret === true, exp.e);

  // 静态校验：其余派发中枢均已按「归属方」加判
  const trig = read("src/original/battle-damage-triggers.js");
  const res = read("src/original/battle-damage-resolution.js");
  const hook = read("src/original/battle-card-resume-hooks.js");
  const turn = read("src/original/battle-turn-start.js");
  T("S1 afterDamage 中枢：受击类被动按归属方加判",
    trig.includes("tsStopped(target)") && trig.includes("tsStopped(actor)"), {});
  T("S2 afterDodged 中枢：反击/触发类按归属方加判",
    (trig.match(/tsStopped\(actor\)/g) || []).length >= 2, {});
  T("S3 伤害增减益中枢：施术方被时停则加成失效", res.includes("const tsBlocked ="), {});
  T("S4 伤害增减益中枢：受术方被时停则减伤/免疫失效", res.includes("const tsInStopped ="), {});
  T("S5 出牌后钩子中枢：出牌者被时停则不触发", hook.includes("actorStopped"), {});
  T("S6 回合开始技：单位被时停则不触发", turn.includes("isSkillDisabled?.(unit)"), {});

  const bad = relevantErrors(errors);
  T("Z0 无 JS 报错", bad.length === 0, bad.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
