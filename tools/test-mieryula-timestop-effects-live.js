// 米尔尤拉【神奇怀表】时停标记的 3 个负面效果 · 严格实战回归
//
// 背景：此前的测试只断言「敌人身上出现了时停标记」，却从未验证标记带来的
// 三个负面效果（跳过回合 / 不可响应 / 禁用技能）是否真的生效 —— 与「无谋霸姬」
// 的 immunizesTactic 是同一类盲区：函数写在模块里、调用点也许存在，
// 但走真实链路时可能根本没被触发。
//
// 本文件全部走真实链路：
//   施加时停 → window.BattleSystem.useCard（真实出牌）
//   跳过回合 → window.BattleTurnStart.beginTurn（真实回合流转）
//   不可响应 → 真实 useCard 出杀，看目标的【闪】是否被消耗
//   禁用技能 → window.BattleCardPlayability.canPlay（真实可打出判定）
// 每组都带「不施加时停」的对照组，证明断言不是恒真。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startFreshGame, startRegressionBattle, dismissOpeningStory,
  collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 把我方 0 号改造成米尔尤拉（带神奇怀表），敌人 0 号作为被时停对象。
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.mieryulaTimeStopOwner = null; b.phase = 4; b.mieryulaBloodthirstPicker = null;
  const m = b.allies[0];
  m.name = "米尔尤拉"; m.ref = "mieryula"; m.id = "mieryula"; m.gender = "female";
  m.stats = { attack: 4, magic: 2, speed: 5 };
  m.hp = m.maxHp = 52; m.bloodlust = 1; m.bloodlustMax = 1;
  b.activeUid = m.uid;
  m.skills = [
    { name: "无谋霸姬", type: "passive" },
    { name: "神奇怀表", type: "active", card: { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true, targetless: true, icon: "🔺", text: "t" } },
  ];
  m.usedMieryulaTimeStop = false;
  m.hand = [];
  const foe = b.enemies[0];
  foe.hp = foe.maxHp = 60; foe.statuses = []; foe.block = 0;
  foe.hand = [];
  st.log = [];
  window.render();
  return { ok: true, allies: b.allies.length, foes: b.enemies.length };
})()`;

// 施加时停（真实 useCard 链路），或跳过（对照组）
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

// ── A 组：跳过回合（玩家真实点「结束回合」，由引擎自己推进）────
// 打包后 window.BattleTurnStart 只暴露工厂、拿不到实例，改走玩家真实操作：
// endPlay → 引擎依次推进每个单位的回合 → 观察引擎自己写的战报。
// 判定依据：battle-turn-start.js 只有真的走到 shouldSkipTurn 分支才会
// record「处于时停状态，跳过其回合」，这条日志是跳过真实发生的直接证据。
const skipTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0], foe = b.enemies[0];
  b.animQueue = []; b.locked = false;
  b.mieryulaTimeStopOwner = null; b.phase = 4;
  foe.hp = foe.maxHp = 60; foe.statuses = []; foe.block = 0;
  b.enemies.forEach(e => { e.statuses = []; });
  foe.hand = [{ name: "杀（普攻）", type: "slash", suit: "\u2660", uid: "fk1" }];
  m.usedMieryulaTimeStop = false;
  m.hp = m.maxHp = 52;
  m.hand = [];
  st.log = [];
  const tsc = { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true,
    targetless: true, icon: "\u1F53A", text: "t", _skill: true };
  m.hand.push(tsc);
  window.BattleSystem.useCard(st, m, m, tsc);
  const marked = (foe.statuses || []).includes("\u65f6\u505c");
  // 出牌后清空手牌并放宽上限：否则会卡在「手牌超过上限，需要弃置」阶段，
  // 回合根本推进不到敌人 —— 那样「我方血量不变」就成了恒真的假绿。
  m.hand = []; m.handLimit = 99;
  m.intent = 0;
  const allyHpBefore = b.allies.reduce((s, u) => s + u.hp, 0);
  b.locked = false; b.animQueue = [];
  b.phase = 4;
  window.BattleSystem.endPlay(st);
  return { marked, allyHpBefore };
})()`;

const readSkipLogTpl = `(() => {
  const st = window.state, b = st.battle;
  const logs = (st.log || []).map(l => typeof l === "string" ? l : (l.text || "")).join(" | ");
  return { skipped: /\u5904\u4e8e\u65f6\u505c\u72b6\u6001\uff0c\u8df3\u8fc7\u5176\u56de\u5408/.test(logs),
    allyHpAfter: b.allies.reduce((s, u) => s + u.hp, 0),
    logs: logs.slice(0, 400) };
})()`;

// 对照组：不施加时停，同样点结束回合
const skipCtrlTpl = `(() => {
  const st = window.state, b = st.battle;
  const foe = b.enemies[0];
  b.animQueue = []; b.locked = false;
  b.mieryulaTimeStopOwner = null; b.phase = 4;
  b.enemies.forEach(e => { e.statuses = []; });
  foe.hp = foe.maxHp = 60; foe.block = 0;
  foe.hand = [{ name: "杀（普攻）", type: "slash", suit: "\u2660", uid: "fk1" }];
  b.allies.forEach(u => { u.hand = []; u.handLimit = 99; u.intent = 0; });
  st.log = [];
  b.locked = false; b.animQueue = [];
  b.phase = 4;
  window.BattleSystem.endPlay(st);
  return { marked: (foe.statuses || []).includes("\u65f6\u505c") };
})()`;

// ── B 组：不可响应（目标手握【闪】，真实出杀 + 真实等待响应结算）────
// 响应走动画队列异步结算，同步 evaluate 里读到的是未结算快照，必须分步等待。
const respTpl = cast => `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0], foe = b.enemies[0];
  b.animQueue = []; b.locked = false;
  b.mieryulaTimeStopOwner = null; b.phase = 4;
  b.enemies.forEach(e => { e.statuses = []; e.hp = e.maxHp = 60; e.block = 0; });
  foe.hand = [{ name: "闪", type: "dodge", suit: "\u2660", uid: "dg1" }];
  m.hand = []; m.handLimit = 99;
  m.intent = 1; m.usedMieryulaTimeStop = false;
  m.hp = m.maxHp = 52;
  st.log = [];
  if (${cast}) {
    const tsc = { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true,
      targetless: true, icon: "\u1F53A", text: "t", _skill: true };
    m.hand.push(tsc);
    const canResolve = window.CharacterSkillAccess?.canResolve
      ? window.CharacterSkillAccess.canResolve(st, m, m, tsc, window.BattleSystem.canPlay) : "no-module";
    const canPlayTs = window.BattleSystem.canPlay ? window.BattleSystem.canPlay(m, tsc, b) : "no-canplay";
    const ret = window.BattleSystem.useCard(st, m, m, tsc);
    window.__tsDbg = { canResolve, canPlayTs, ret: String(ret), phase: b.phase, used: m.usedMieryulaTimeStop,
      skills: (m.skills||[]).map(x => x.name) };
    m.hand = [];
  }
  const marked = (foe.statuses || []).includes("\u65f6\u505c");
  const slash = { name: "杀（普攻）", type: "slash", suit: "\u2660", power: 0, uid: "sk1" };
  m.hand.push(slash);
  window.BattleSystem.useCard(st, m, foe, slash);
  // 响应日志由战斗结算同步写入，必须在同一次 evaluate 内读取，
  // 否则会被后续 render 循环覆盖。
  const logs = (st.log || []).map(l => typeof l === "string" ? l : (l.text || "")).join(" | ");
  return { marked, foeHp: foe.hp,
    dodgesLeft: (foe.hand || []).filter(c => c.type === "dodge").length,
    noRespLine: /\u65e0\u6cd5\u4f7f\u7528\u54cd\u5e94\u724c\u54cd\u5e94/.test(logs),
    logs: logs.slice(0, 400) };
})()`;

// ── C 组：禁用技能（真实 canPlay，入口是 BattleSystem.canPlay）──────
const skillTpl = cast => `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0], foe = b.enemies[0];
  b.animQueue = []; b.locked = false;
  b.mieryulaTimeStopOwner = null; b.phase = 4;
  b.enemies.forEach(e => { e.statuses = []; });
  foe.hp = foe.maxHp = 60; foe.block = 0;
  foe.hand = [{ name: "杀（普攻）", type: "slash", suit: "\u2660", uid: "fk1" }];
  m.usedMieryulaTimeStop = false; m.hand = []; m.handLimit = 99;
  m.intent = 1;
  m.hp = m.maxHp = 52; m.block = 0;
  st.log = [];
  if (${cast}) {
    const tsc = { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true,
      targetless: true, icon: "\u1F53A", text: "t", _skill: true };
    m.hand.push(tsc);
    window.BattleSystem.useCard(st, m, m, tsc);
    m.hand = [];
  }
  // 一个需要目标、无条件成立的敌方技能卡
  const skillCard = { name: "索敌雷达", type: "tactic", ruinsRadarScan: true,
    target: true, _skill: true, icon: "\uD83D\uDCE1", text: "t" };
  const foeCan = window.BattleSystem.canPlay(foe, skillCard, b);
  const marked = (foe.statuses || []).includes("\u65f6\u505c");
  return { marked, foeCan };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await startRegressionBattle(page);

  const setup = await page.evaluate(setupTpl);
  T("环境就绪（战斗已开启）", setup.ok && setup.allies >= 2 && setup.foes >= 1, setup);

  console.log("---- A 组：跳过回合（真实结束回合，引擎自己推进）----");
  await page.evaluate(setupTpl);
  const aSetup = await page.evaluate(skipTpl);
  T("A1 时停标记已施加到敌人身上", aSetup.marked === true, aSetup);
  // 我方可能不止一名角色，需要多轮 endPlay 才能推进到敌人回合
  const endPlayTpl = `(() => {
    const st = window.state, b = st.battle;
    b.allies.forEach(u => { u.hand = []; u.handLimit = 99; u.intent = 0; });
    b.locked = false; b.animQueue = [];
    window.BattleSystem.endPlay(st);
    return 1;
  })()`;
  let a = null;
  for (let i = 0; i < 6; i++) {
    await page.evaluate(endPlayTpl);
    await page.waitForTimeout(1600);
    a = await page.evaluate(readSkipLogTpl);
    if (a.skipped) break;
  }
  T("A2 引擎战报写明「处于时停状态，跳过其回合」", a && a.skipped === true, a);
  T("A3 被时停的敌人没有出手（我方总血量未变）",
    aSetup.allyHpBefore === (a && a.allyHpAfter),
    { before: aSetup.allyHpBefore, after: a && a.allyHpAfter });

  await page.evaluate(setupTpl);
  await page.evaluate(skipCtrlTpl);
  let aCtrl = null;
  for (let i = 0; i < 6; i++) {
    await page.evaluate(endPlayTpl);
    await page.waitForTimeout(1600);
    aCtrl = await page.evaluate(readSkipLogTpl);
    if (aCtrl.skipped) break;
  }
  T("A4 对照组：未施加时停时引擎不会写跳过日志", aCtrl && aCtrl.skipped === false, aCtrl);

  console.log("---- B 组：不可响应 ----");
  await page.evaluate(setupTpl);
  const b1 = await page.evaluate(respTpl(true));
  T("B1 时停时：标记已施加", b1.marked === true, b1);
  T("B2 时停时：目标受到了伤害", b1.foeHp < 60, b1);
  T("B3 时停时：目标的【闪】没有被消耗（无法响应）", b1.dodgesLeft === 1, b1);
  T("B4 时停时：战报写明「无法使用响应牌响应本次杀」", b1.noRespLine === true, b1);

  await page.evaluate(setupTpl);
  const b0 = await page.evaluate(respTpl(false));
  T("B5 对照组：未时停时无时停标记", b0.marked === false, b0);
  T("B6 对照组：未时停时战报不写「无法响应」", b0.noRespLine === false, b0);

  console.log("---- C 组：禁用技能 ----");
  await page.evaluate(setupTpl);
  const c1 = await page.evaluate(skillTpl(true));
  T("C1 时停时：标记已施加", c1.marked === true, c1);
  T("C2 时停时：敌人技能被判定为不可发动", c1.foeCan === false, c1);
  await page.evaluate(setupTpl);
  const c0 = await page.evaluate(skillTpl(false));
  T("C3 对照组：未时停时同一技能可以发动", c0.foeCan === true, c0);

  const bad = relevantErrors(errors);
  T("E0 页面无 JS 报错", bad.length === 0, bad.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
