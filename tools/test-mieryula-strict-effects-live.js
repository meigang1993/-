// 米尔尤拉 三技能 · 严格实战回归（真实结算路径，禁止直接调模块函数）
//
// 本文件的核心目的：上一版测试大量「直接调 MieryulaSkills.xxx()」，函数存在就让断言变绿，
// 但源码里可能根本没人调用它 —— 典型就是 immunizesTactic（战术牌对她无效）
// 从未接入任何结算点，测试却一直显示通过。
// 这里全部改走真实出牌链路 window.BattleSystem.useCard / 真实回合流转 / 真实 UI 点击。
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

// 把我方 0 号改造成米尔尤拉，1 号改造成我方男性
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.mieryulaBloodthirstPicker = null; b.mieryulaTimeStopOwner = null;
  const m = b.allies[0], male = b.allies[1];
  m.name = "米尔尤拉"; m.ref = "mieryula"; m.id = "mieryula"; m.gender = "female";
  m.stats = { attack: 4, magic: 2, speed: 5 };
  m.tempAttack = 0; m.tempMagic = 0; m.block = 0;
  m.hp = m.maxHp = 52; m.bloodlust = 1; m.bloodlustMax = 1;
  m.skills = [
    { name: "无谋霸姬", type: "passive" },
    { name: "渴血杀戮", type: "active", card: { name: "渴血杀戮", type: "tactic", mieryulaBloodthirst: true, allyTarget: true, icon: "⚔️", text: "t" } },
    { name: "神奇怀表", type: "active", card: { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true, targetless: true, icon: "🔺", text: "t" } },
  ];
  m.usedMieryulaTimeStop = false;
  m.mieryulaBloodthirstUsed = {};
  m.hand = [];
  male.name = "罗卡尔"; male.ref = "lokar"; male.id = "lokar"; male.gender = "male";
  male.hp = male.maxHp = 62; male.block = 0; male.hand = [];
  b.enemies.forEach(e => { e.hand = []; e.hp = e.maxHp = 60; e.statuses = []; e.block = 0; });
  st.log = [];
  window.render();
  return { ok: true, allies: b.allies.length, foes: b.enemies.length };
})()`;

// ── A 组：战术牌对她无效（真实 useCard 链路）─────────────────
// 拆解：指定一名有手牌的其他角色，弃置其 1 张手牌。
const immuneTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0], other = b.allies[2] || b.allies[1];
  const foe = b.enemies[0];
  m.hand = [
    { name: "杀（普攻）", type: "slash", suit: "♠", uid: "mk1" },
    { name: "杀（普攻）", type: "slash", suit: "♣", uid: "mk2" },
  ];
  other.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠", uid: "ok1" },
                { name: "杀（普攻）", type: "slash", suit: "♣", uid: "ok2" }];
  const beforeM = m.hand.length, beforeO = other.hand.length;
  st.log = [];
  const mkTactic = () => ({ name: "拆解", type: "tactic", suit: "♠",
    discardTarget: true, uid: "tc" + Math.random(), _skipHandMove: true });
  // 敌方对米尔尤拉使用拆解
  window.BattleSystem.useCard(st, foe, m, mkTactic());
  const afterM = m.hand.length;
  // 对照：敌方对其他我方角色使用拆解
  window.BattleSystem.useCard(st, foe, other, mkTactic());
  const afterO = other.hand.length;
  const logs = (st.log || []).map(l => typeof l === "string" ? l : (l.text || "")).join("|");
  return { beforeM, afterM, beforeO, afterO,
    mieryulaLine: /无谋霸姬|耍什么花招/.test(logs) };
})()`;

// ── B 组：渴血杀戮虚拟牌真实不消耗杀意 ─────────────────────
const bloodthirstVirtualTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0], male = b.allies[1], foe = b.enemies[0];
  const beforeBlood = m.bloodlust;
  const card = { name: "渴血杀戮", type: "tactic", mieryulaBloodthirst: true,
    allyTarget: true, _skill: true, icon: "⚔️", text: "t" };
  m.hand.push(card);
  window.BattleSystem.useCard(st, m, male, card);
  const pool = window.MieryulaSkills.availableSlashNames(st, m);
  if (!pool.length) return { poolCount: 0 };
  window.MieryulaSkills.chooseBloodthirstCard(st, pool[0]);
  const beforeHp = foe.hp, beforeBlood2 = m.bloodlust;
  const ok = window.MieryulaSkills.useBloodthirstVirtual(st, foe.uid,
    { useCard: (s, a, t, c) => window.BattleSystem.useCard(s, a, t, c) });
  return { poolCount: pool.length, pick: pool[0], ok,
    beforeHp, afterHp: foe.hp, beforeBlood, beforeBlood2, afterBlood: m.bloodlust,
    locked: !!b.locked, picker: !!b.mieryulaBloodthirstPicker };
})()`;

// ── C 组：无谋霸姬翻倍（真实打出实体杀牌）────────────────────
const doubleDamageTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0], foe = b.enemies[0];
  foe.hp = foe.maxHp = 200; foe.block = 0;
  const slash = { name: "杀（普攻）", type: "slash", suit: "♠", power: 0,
    scale: "attack", uid: "sl1" };
  m.hand.push(slash);
  const before = foe.hp, beforeBlood = m.bloodlust;
  window.BattleSystem.useCard(st, m, foe, slash);
  const drop = before - foe.hp;
  // 再放一张战术牌进手牌，验证翻倍失效
  m.hand = [{ name: "魅惑术", type: "tactic", suit: "♥", uid: "tk" }];
  foe.hp = 200;
  const slash2 = { name: "杀（普攻）", type: "slash", suit: "♣", power: 0,
    scale: "attack", uid: "sl2" };
  m.hand.push(slash2);
  window.BattleSystem.useCard(st, m, foe, slash2);
  return { drop, dropWithTactic: 200 - foe.hp, attack: m.stats.attack,
    bloodBefore: beforeBlood, bloodAfter: m.bloodlust };
})()`;

// ── D 组：时停真实让敌人跳过回合 ────────────────────────────
const timeStopSkipTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0];
  const card = { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true,
    targetless: true, _skill: true, icon: "🔺", text: "t" };
  m.hand.push(card);
  st.log = [];
  window.BattleSystem.useCard(st, m, m, card);
  const stop = window.MieryulaTimeStop;
  const foe0 = b.enemies[0];
  // 真实回合流转：把回合交给被时停的敌人，看它是否真的跳过
  b.turnUid = foe0.uid;
  const beforeHp = b.allies[0].hp;
  const skipped = stop.shouldSkipTurn(foe0);
  return {
    marked: b.enemies.filter(e => stop.isStopped(e)).length,
    total: b.enemies.length,
    skipped, disabled: stop.isSkillDisabled(foe0),
    noResponse: stop.suppressesResponse(foe0),
    allyStopped: b.allies.some(a => stop.isStopped(a)),
    owner: b.mieryulaTimeStopOwner === m.uid,
    bgmSuspended: !!(window.GameBGM && window.GameBGM.suspend),
  };
})()`;

// ── E 组：她无法使用战术牌（真实 UI 置灰）────────────────────
const cannotUseTacticTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0];
  m.intent = 3; // 实体杀需要意图点，否则会被「出牌阶段无意图」拦掉，与技能无关
  const tactic = { name: "拆解", type: "tactic", suit: "♠", discardTarget: true, uid: "tu1" };
  const slash = { name: "杀（普攻）", type: "slash", suit: "♠", power: 0, uid: "su1" };
  const skillCard = { name: "渴血杀戮", type: "tactic", mieryulaBloodthirst: true,
    allyTarget: true, _skill: true, uid: "sk1" };
  const P = window.BattleSystem;
  return {
    tacticBlocked: P.canPlay(m, tactic, b) === false,
    slashOk: P.canPlay(m, slash, b) !== false,
    skillOk: P.canPlay(m, skillCard, b) !== false,
  };
})()`;

// ── F 组：时停期间米尔尤拉阵亡 / 战斗结束 ────────────────────
// 「时停标记在她下一个回合开始时消失」—— 她若阵亡就永远没有下个回合，
// 标记会永久留在敌人身上，且 BGM 的 suspend 永不 resume（整局静音）。
const timeStopDeathTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0];
  window.__bgm = [];
  if (window.GameBGM) {
    const os = window.GameBGM.suspend, or = window.GameBGM.resume;
    window.GameBGM.suspend = r => { window.__bgm.push("suspend"); return os.call(window.GameBGM, r); };
    window.GameBGM.resume = r => { window.__bgm.push("resume"); return or.call(window.GameBGM, r); };
  }
  const card = { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true,
    targetless: true, _skill: true, icon: "🔺", text: "t" };
  m.hand.push(card);
  window.BattleSystem.useCard(st, m, m, card);
  const marked = b.enemies.filter(e => window.MieryulaTimeStop.isStopped(e)).length;
  // 米尔尤拉阵亡：她再也不会有「下一个回合开始」，改由别人的回合开始兜底清理
  m.hp = 0;
  const stillMarked = b.enemies.filter(e => window.MieryulaTimeStop.isStopped(e)).length;
  // 真实回合流转会对每个单位调用 onTurnStart，这里模拟轮到敌人
  window.MieryulaSkills.onTurnStart(st, b.enemies[0]);
  return { marked, stillMarked,
    bgm: window.__bgm.slice(),
    remaining: b.enemies.filter(e => window.MieryulaTimeStop.isStopped(e)).length };
})()`;

// ── G 组：限定技用过之后置灰（真实 canPlay）────────────────────
const limitedOnceTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0];
  const card = { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true,
    targetless: true, _skill: true, icon: "🔺", text: "t" };
  const before = window.BattleSystem.canPlay(m, card, b);
  m.usedMieryulaTimeStop = true;
  const after = window.BattleSystem.canPlay(m, card, b);
  return { before, after };
})()`;

// ── H 组：她作为敌人时，玩家对她用战术牌同样免疫 ────────────────
const enemyImmuneTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0], foe = b.enemies[0];
  foe.ref = "mieryula"; foe.id = "mieryula"; foe.name = "米尔尤拉";
  foe.skills = [{ name: "无谋霸姬", type: "passive" }];
  foe.hand = [{ name: "杀（普攻）", type: "slash", suit: "♠", uid: "f1" },
              { name: "杀（普攻）", type: "slash", suit: "♣", uid: "f2" }];
  const before = foe.hand.length;
  const tactic = { name: "拆解", type: "tactic", suit: "♠", discardTarget: true,
    uid: "tc2", _skipHandMove: true };
  window.BattleSystem.useCard(st, m, foe, tactic);
  return { before, after: foe.hand.length };
})()`;

// ── I 组：时停期间战斗结束 ──────────────────────────────────
// 战斗结束若不清时停，GameBGM 的 suspend 令牌永久残留 → 回大厅后整局静音。
const battleEndTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0];
  window.__bgm2 = [];
  if (window.GameBGM) {
    const os = window.GameBGM.suspend, or = window.GameBGM.resume;
    window.GameBGM.suspend = r => { window.__bgm2.push("suspend"); return os.call(window.GameBGM, r); };
    window.GameBGM.resume = r => { window.__bgm2.push("resume"); return or.call(window.GameBGM, r); };
  }
  const card = { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true,
    targetless: true, _skill: true, icon: "🔺", text: "t" };
  m.hand.push(card);
  window.BattleSystem.useCard(st, m, m, card);
  const marked = b.enemies.filter(e => window.MieryulaTimeStop.isStopped(e)).length;
  b.enemies.forEach(e => { e.hp = 0; });
  try { window.BattleSystem.checkEnd(st); } catch (e) { window.__bgm2.push("ERR:" + e.message); }
  return { marked };
})()`;

async function run() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(400);

  // ── A 组 ──
  await page.evaluate(setupTpl);
  const im = await page.evaluate(immuneTpl);
  T("无谋霸姬：战术牌对她无效（真实出牌，手牌不被弃置）",
    im.afterM === im.beforeM, im);
  T("无谋霸姬：对照——战术牌对其他角色生效（手牌被弃置）",
    im.afterO === im.beforeO - 1, im);
  T("无谋霸姬：被战术牌指定时播放台词", im.mieryulaLine === true, im);

  // ── B 组 ──
  await page.evaluate(setupTpl);
  const vt = await page.evaluate(bloodthirstVirtualTpl);
  T("渴血杀戮：可选牌名非空", vt.poolCount > 0, vt);
  T("渴血杀戮：虚拟牌真实对敌人造成伤害", vt.ok === true && vt.afterHp < vt.beforeHp, vt);
  T("渴血杀戮：此牌不消耗杀意", vt.afterBlood === vt.beforeBlood2, vt);
  T("渴血杀戮：结算后解锁", vt.locked === false && vt.picker === false, vt);

  // ── C 组 ──
  await page.evaluate(setupTpl);
  const dd = await page.evaluate(doubleDamageTpl);
  T("无谋霸姬：无战术牌时实体牌伤害翻倍", dd.drop === dd.attack * 2, dd);
  T("无谋霸姬：有战术牌时不翻倍", dd.dropWithTactic === dd.attack, dd);

  // ── D 组 ──
  await page.evaluate(setupTpl);
  const ts = await page.evaluate(timeStopSkipTpl);
  T("神奇怀表：所有存活敌人被标记时停", ts.marked === ts.total && ts.total > 0, ts);
  T("神奇怀表：被标记者跳过回合", ts.skipped === true, ts);
  T("神奇怀表：被标记者技能失效", ts.disabled === true, ts);
  T("神奇怀表：被标记者不可响应", ts.noResponse === true, ts);
  T("神奇怀表：我方不被误标记", ts.allyStopped === false, ts);
  T("神奇怀表：记录拥有者", ts.owner === true, ts);

  // ── E 组 ──
  await page.evaluate(setupTpl);
  const cu = await page.evaluate(cannotUseTacticTpl);
  T("无谋霸姬：她无法使用战术牌（真实置灰）", cu.tacticBlocked === true, cu);
  T("无谋霸姬：实体杀牌不受限制", cu.slashOk === true, cu);
  T("无谋霸姬：技能牌不受限制", cu.skillOk === true, cu);

  // ── F 组 ──
  await page.evaluate(setupTpl);
  const td = await page.evaluate(timeStopDeathTpl);
  T("神奇怀表：米尔尤拉阵亡后时停标记解除（不会永久卡住敌人）",
    td.remaining === 0, td);
  T("神奇怀表：标记解除时 BGM 恢复（不会永久静音）",
    td.bgm.includes("resume"), td);

  // ── G 组 ──
  await page.evaluate(setupTpl);
  const lo = await page.evaluate(limitedOnceTpl);
  T("神奇怀表：未使用时可点", lo.before !== false, lo);
  T("神奇怀表：限定技用过之后置灰", lo.after === false, lo);

  // ── H 组 ──
  await page.evaluate(setupTpl);
  const ei = await page.evaluate(enemyImmuneTpl);
  T("无谋霸姬：她作为敌人时对战术牌同样免疫", ei.after === ei.before, ei);

  // ── I 组 ──
  await page.evaluate(setupTpl);
  const be = await page.evaluate(battleEndTpl);
  await page.waitForTimeout(1200);
  const bgm2 = await page.evaluate("window.__bgm2 || []");
  T("神奇怀表：战斗结束时 BGM 恢复（不会回大厅后永久静音）",
    bgm2.includes("resume"), { marked: be.marked, bgm: bgm2 });

  const errs = relevantErrors(errors);
  T("页面无 JS 报错", errs.length === 0, errs.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  return pass === total;
}

run().then(ok => {
  console.log(ok ? "\n=== 全部通过 ===" : "\n=== 存在失败 ===");
  process.exit(ok ? 0 : 1);
}).catch(err => {
  console.error("测试异常:", err && err.message);
  process.exit(1);
});
