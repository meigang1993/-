// 米尔尤拉 全技能 · 严格实战回归
//   ⚔️ 渴血杀戮：指定我方一名男性角色，对其造成等同于攻击力的伤害；之后选择一项「杀」牌的
//                牌名，视为使用一张该牌名的虚拟牌，此牌不消耗杀意。本回合每项限一次。
//   ⭐ 无谋霸姬：锁定技，战术牌对她无效，她无法使用战术牌；若手牌中没有战术牌，
//                使用实体牌或虚拟牌造成的伤害为 2 倍（技能伤害不翻倍）。
//   🔺 神奇怀表：限定技，指定所有敌方角色施加「时停」；被标记者跳过回合、不可响应、
//                技能失效；在她下一个回合开始时标记消失。
//
// 断言实际效果：血量真的掉、杀意真的不扣、伤害真的翻倍、时停真的让敌人跳回合。
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

// 把我方 0 号改造成米尔尤拉（攻击力固定 4），1 号改造成我方男性
const setupTpl = (handKind, bloodlust) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  b.mieryulaBloodthirstPicker = null; b.mieryulaTimeStopOwner = null;
  const m = b.allies[0], male = b.allies[1];
  m.name = "米尔尤拉"; m.ref = "mieryula"; m.id = "mieryula"; m.gender = "female";
  m.stats = { attack: 4, magic: 2, speed: 5 };
  m.tempAttack = 0; m.tempMagic = 0; m.block = 0;
  m.hp = m.maxHp = 52; m.bloodlust = ${bloodlust}; m.bloodlustMax = 1;
  m.skills = [
    { name: "无谋霸姬", type: "passive" },
    { name: "渴血杀戮", type: "active", card: { name: "渴血杀戮", type: "tactic", mieryulaBloodthirst: true, allyTarget: true, icon: "⚔️", text: "t" } },
    { name: "神奇怀表", type: "active", card: { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true, targetless: true, icon: "🔺", text: "t" } },
  ];
  m.usedMieryulaTimeStop = false;
  m.mieryulaBloodthirstUsed = {};
  m.hand = [];
  const kind = ${JSON.stringify(handKind)};
  if (kind === "tactic") m.hand.push({ name: "魅惑术", type: "tactic", suit: "♥", uid: "mt0" });
  else if (kind === "basic") m.hand.push({ name: "闪", type: "basic", suit: "♠", uid: "mb0" });
  male.name = "罗卡尔"; male.ref = "lokar"; male.id = "lokar"; male.gender = "male";
  male.hp = male.maxHp = 62; male.block = 0; male.hand = [];
  b.enemies.forEach(e => { e.hand = []; e.hp = e.maxHp = 60; e.statuses = []; });
  st.log = [];
  window.render();
  return { ok: true, allies: b.allies.length, foes: b.enemies.length };
})()`;

// ── 渴血杀戮 ──────────────────────────────────────────────
// 第一段：对友方男性造成等同攻击力的伤害（技能伤害，不被无谋霸姬翻倍）
const bloodthirstDamageTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0], male = b.allies[1];
  const before = male.hp;
  const card = { name: "渴血杀戮", type: "tactic", mieryulaBloodthirst: true, allyTarget: true, _skill: true, icon: "⚔️", text: "t" };
  m.hand.push(card);
  window.BattleSystem.useCard(st, m, male, card);
  return { before, after: male.hp, attack: m.stats.attack + (m.tempAttack || 0),
    picker: !!b.mieryulaBloodthirstPicker, locked: !!b.locked };
})()`;

// 第二段：选牌名 → 点敌人 → 虚拟牌生效且不消耗杀意
const bloodthirstVirtualTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0];
  const pool = window.MieryulaSkills.availableSlashNames(st, m);
  const pick = pool[0];
  const okChoose = window.MieryulaSkills.chooseBloodthirstCard(st, pick);
  const foe = b.enemies.find(e => e.hp > 0);
  const beforeHp = foe.hp, beforeBlood = m.bloodlust;
  const used = window.MieryulaSkills.useBloodthirstVirtual(st, foe.uid, {
    useCard: (s, actor, target, card) => window.BattleSystem.useCard(s, actor, target, card),
  });
  return { pick, poolCount: pool.length, okChoose, used,
    beforeHp, afterHp: foe.hp, beforeBlood, afterBlood: m.bloodlust,
    picker: !!b.mieryulaBloodthirstPicker, locked: !!b.locked,
    usedAgain: window.MieryulaSkills.availableSlashNames(st, m).includes(pick) };
})()`;

// ── 无谋霸姬 ──────────────────────────────────────────────
// 手牌无战术牌 → 实体牌伤害翻倍；有战术牌 → 不翻倍
const damageModifyTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0];
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", uid: "dmg" };
  const noTactic = window.MieryulaSkills.modifyOutgoingDamage(st, m, 5, card);
  m.hand.push({ name: "魅惑术", type: "tactic", suit: "♥", uid: "tk" });
  const withTactic = window.MieryulaSkills.modifyOutgoingDamage(st, m, 5, card);
  m.hand = m.hand.filter(c => c.uid !== "tk");
  const skillDmg = window.MieryulaSkills.modifyOutgoingDamage(st, m, 5,
    { name: "渴血杀戮", type: "skill", mieryulaBloodthirst: true });
  const virtual = window.MieryulaSkills.modifyOutgoingDamage(st, m, 5,
    { name: "杀（普攻）", type: "slash", virtual: true, uid: "v" });
  return { noTactic, withTactic, skillDmg, virtual };
})()`;

// 战术牌对她无效 + 她无法使用战术牌
const tacticGuardTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0], foe = b.enemies[0];
  const tactic = { name: "魅惑术", type: "tactic", suit: "♥", uid: "tg" };
  const blocked = window.MieryulaSkills.blocksTactic(m, tactic);
  // 注意：必须走 interceptTactic（真正接进结算链路的入口），
  // 直接调 immunizesTactic 是假绿 —— 它曾长期没有任何源码调用点。
  const immune = window.MieryulaSkills.interceptTactic(st, b.enemies[0], m, tactic);
  // 技能牌（渴血杀戮/神奇怀表）是 tactic 类型，但不受「无法使用战术牌」限制
  const skillCard = { name: "渴血杀戮", type: "tactic", mieryulaBloodthirst: true, _skill: true };
  const skillBlocked = window.MieryulaSkills.blocksTactic(m, skillCard);
  // 非米尔尤拉不受影响
  const otherBlocked = window.MieryulaSkills.blocksTactic(b.allies[1], tactic);
  // 实体杀牌不受限制
  const slash = { name: "杀（普攻）", type: "slash", suit: "♠", uid: "sl" };
  const slashBlocked = window.MieryulaSkills.blocksTactic(m, slash);
  return { blocked, immune, skillBlocked, otherBlocked, slashBlocked };
})()`;

// ── 神奇怀表 ──────────────────────────────────────────────
const timeStopTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0];
  const before = m.usedMieryulaTimeStop;
  const card = { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true, targetless: true, _skill: true, icon: "🔺", text: "t" };
  m.hand.push(card);
  window.BattleSystem.useCard(st, m, m, card);
  const stop = window.MieryulaTimeStop;
  const foes = b.enemies.filter(e => e.hp > 0);
  return {
    before, after: m.usedMieryulaTimeStop, owner: b.mieryulaTimeStopOwner, uid: m.uid,
    marked: foes.filter(e => stop.isStopped(e)).length, total: foes.length,
    skip: foes.every(e => stop.shouldSkipTurn(e)),
    disabled: foes.every(e => stop.isSkillDisabled(e)),
    noResponse: foes.every(e => stop.suppressesResponse(e)),
    allyStopped: b.allies.some(a => stop.isStopped(a)),
  };
})()`;

// 限定技：用过之后再点应被拦住
const timeStopTwiceTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0];
  const card = { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true, targetless: true, _skill: true, icon: "🔺", text: "t" };
  return window.MieryulaSkills.handleSpecialCard(st, m, m, card, {}, {});
})()`;

// 下个回合开始解除
const timeStopClearTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0];
  window.MieryulaSkills.onTurnStart(st, m);
  const stop = window.MieryulaTimeStop;
  return { remaining: b.enemies.filter(e => stop.isStopped(e)).length,
    owner: b.mieryulaTimeStopOwner,
    usedReset: Object.keys(m.mieryulaBloodthirstUsed || {}).length };
})()`;

// 敌方拿到怀表时自动完成，不锁界面
const enemyTimeStopTpl = `(() => {
  const st = window.state, b = st.battle;
  const foe = b.enemies[0];
  foe.ref = "mieryula"; foe.id = "mieryula"; foe.side = "enemy";
  foe.skills = [{ name: "神奇怀表", type: "active" }];
  foe.usedMieryulaTimeStop = false;
  const card = { name: "神奇怀表", type: "tactic", mieryulaTimeStop: true, targetless: true, _skill: true };
  const handled = window.MieryulaSkills.handleSpecialCard(st, foe, foe, card, {}, {});
  return { handled, locked: !!b.locked, used: foe.usedMieryulaTimeStop };
})()`;

// 渴血杀戮目标是女性 / 敌方 → 应被拒绝（不产生伤害、不开选牌）
const bloodthirstRejectTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0], female = b.allies[2] || b.allies[1], foe = b.enemies[0];
  female.gender = "female";
  const beforeF = female.hp, beforeE = foe.hp;
  const card = { name: "渴血杀戮", type: "tactic", mieryulaBloodthirst: true, allyTarget: true, _skill: true };
  const onFemale = window.MieryulaSkills.handleSpecialCard(st, m, female, card, {}, {});
  const onEnemy = window.MieryulaSkills.handleSpecialCard(st, m, foe, card, {}, {});
  return { onFemale, onEnemy, femaleHp: female.hp === beforeF, foeHp: foe.hp === beforeE,
    picker: !!b.mieryulaBloodthirstPicker };
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

  // ── 渴血杀戮 ──
  await page.evaluate(setupTpl("basic", 1));
  const dmg = await page.evaluate(bloodthirstDamageTpl);
  T("渴血杀戮：对友方男性造成等同攻击力的伤害", dmg.before - dmg.after === dmg.attack,
    { drop: dmg.before - dmg.after, attack: dmg.attack });
  T("渴血杀戮：伤害不被无谋霸姬翻倍（技能伤害）", dmg.before - dmg.after === 4, dmg);
  T("渴血杀戮：第一段后打开选牌界面", dmg.picker === true, dmg);

  const vt = await page.evaluate(bloodthirstVirtualTpl);
  T("渴血杀戮：可选牌名非空", vt.poolCount > 0 && !!vt.pick, vt);
  T("渴血杀戮：选择牌名成功", vt.okChoose === true, vt);
  T("渴血杀戮：虚拟牌对敌人造成伤害", vt.used === true && vt.afterHp < vt.beforeHp, vt);
  T("渴血杀戮：此牌不消耗杀意", vt.afterBlood === vt.beforeBlood, vt);
  T("渴血杀戮：结算后选牌界面关闭", vt.picker === false && vt.locked === false, vt);
  T("渴血杀戮：本回合该牌名不再可选", vt.usedAgain === false, vt);

  const rj = await page.evaluate(bloodthirstRejectTpl);
  T("渴血杀戮：指定女性不生效", rj.onFemale === true && rj.femaleHp === true, rj);
  T("渴血杀戮：指定敌方不生效", rj.onEnemy === true && rj.foeHp === true, rj);

  // ── 无谋霸姬 ──
  await page.evaluate(setupTpl("basic", 1));
  const mod = await page.evaluate(damageModifyTpl);
  T("无谋霸姬：无战术牌时实体牌伤害翻倍", mod.noTactic === 10, mod);
  T("无谋霸姬：无战术牌时虚拟牌伤害翻倍", mod.virtual === 10, mod);
  T("无谋霸姬：有战术牌时不翻倍", mod.withTactic === 5, mod);
  T("无谋霸姬：技能伤害不翻倍", mod.skillDmg === 5, mod);

  await page.evaluate(setupTpl("tactic", 1));
  const tg = await page.evaluate(tacticGuardTpl);
  T("无谋霸姬：她无法使用战术牌", tg.blocked === true, tg);
  T("无谋霸姬：战术牌对她无效", tg.immune === true, tg);
  T("无谋霸姬：技能牌不受「无法使用战术牌」限制", tg.skillBlocked === false, tg);
  T("无谋霸姬：实体杀牌不受限制", tg.slashBlocked === false, tg);
  T("无谋霸姬：其他角色不受限制", tg.otherBlocked === false, tg);

  // ── 神奇怀表 ──
  await page.evaluate(setupTpl("basic", 1));
  const ts = await page.evaluate(timeStopTpl);
  T("神奇怀表：所有存活敌人被标记时停", ts.marked === ts.total && ts.total > 0, ts);
  T("神奇怀表：记录的拥有者为本方米尔尤拉", ts.owner === ts.uid, ts);
  T("神奇怀表：被标记者跳过回合", ts.skip === true, ts);
  T("神奇怀表：被标记者技能失效", ts.disabled === true, ts);
  T("神奇怀表：被标记者不可响应", ts.noResponse === true, ts);
  T("神奇怀表：我方不被误标记", ts.allyStopped === false, ts);
  T("神奇怀表：限定技标记为已使用", ts.before === false && ts.after === true, ts);

  const twice = await page.evaluate(timeStopTwiceTpl);
  T("神奇怀表：用过之后再次发动被拦住", twice === true, { twice });

  const clr = await page.evaluate(timeStopClearTpl);
  T("神奇怀表：下个回合开始标记仍在（改为逐个敌人跳过其回合后消耗）",
    clr.remaining === 2 && !!clr.owner, clr);
  T("神奇怀表：回合开始清空「每项限一次」记录", clr.usedReset === 0, clr);

  const en = await page.evaluate(enemyTimeStopTpl);
  T("神奇怀表：敌方拿到时自动完成，不锁界面", en.handled === true && en.locked === false, en);

  const bad = relevantErrors(errors);
  T("页面无 JS 报错", bad.length === 0, bad.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  if (pass !== total) process.exit(1);
}

run().catch(e => { console.error(e); process.exit(1); });
