// 米尔尤拉 · 渴血杀戮目标过滤 + 无谋霸姬 AOE 战术牌免疫 实机回归
//
// 用户反馈三件事：
//   1. 选中渴血杀戮后，提示文案不对（显示的是通用 allyTarget 的「选择我方角色；
//      双击或拖出手牌区可快速自疗」，与渴血杀戮完全无关）
//   2. 可以指定女性角色或敌方角色 —— 点了在 handleSpecialCard 里静默 return，
//      表现为「点了没反应」（与女王榨取、狙击目标同一类）
//   3. 无谋霸姬仍然会被 AOE 战术牌（【魔王军入侵】）打到
//
// 第 3 点的根因：魔王军入侵是 targetless 的 AOE，resolveCard 里的 interceptTactic
// 只认单体 target，AOE 在内部循环里直接对每个目标调 damage，完全绕过拦截。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// allies[0] 普通女队友 / allies[1] 米尔尤拉 / allies[2] 男队友
const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.phase = 4;
  while (b.allies.length < 3) {
    const n = b.allies.length;
    b.allies.push({ uid: "fill" + n, name: "补位" + n, ref: "fill" + n, id: "fill" + n,
      gender: "female", side: "ally", hp: 50, maxHp: 50, block: 0, hand: [], skills: [],
      stats: { attack: 4, magic: 4, speed: 4 } });
  }
  const female = b.allies[0], m = b.allies[1], male = b.allies[2];
  female.name = "曼妮"; female.ref = "manny"; female.id = "manny"; female.gender = "female";
  female.hp = female.maxHp = 50; female.block = 0; female.hand = []; female.skills = [];
  m.name = "米尔尤拉"; m.ref = "mieryula"; m.id = "mieryula"; m.gender = "female";
  m.stats = { attack: 4, magic: 2, speed: 5 };
  m.tempAttack = 0; m.tempMagic = 0; m.block = 0; m.intent = 1;
  m.hp = m.maxHp = 52; m.bloodlust = 1; m.bloodlustMax = 1;
  m.mieryulaBloodthirstUsed = {};
  m.usedMieryulaTimeStop = false;
  m.skills = [
    { name: "无谋霸姬", type: "passive" },
    { name: "渴血杀戮", type: "active", card: { name: "渴血杀戮", type: "tactic",
      mieryulaBloodthirst: true, allyTarget: true, icon: "⚔️", text: "t" } },
  ];
  m.hand = [];
  male.name = "罗卡尔"; male.ref = "lokar"; male.id = "lokar"; male.gender = "male";
  male.hp = male.maxHp = 62; male.block = 0; male.hand = []; male.skills = [];
  b.enemies.forEach((e, i) => {
    e.gender = "male"; e.hp = e.maxHp = 60; e.block = 0; e.statuses = [];
    e.hand = [{ name: "闪", type: "basic", suit: "♣", uid: "eh" + i }];
  });
  b.allies.concat(b.enemies).forEach(u =>
    u.hand.forEach(c => { delete c._pendingDraw; }));
  b.activeUid = m.uid;
  b.mieryulaBloodthirstPicker = null;
  b.mieryulaTimeStopOwner = null;
  b.demonInvasionResume = null;
  b.selectedSkillCard = null; b.selectedCardIndex = null; b.pendingTargetUid = null;
  st.log = []; st.battleLog = [];
  window.render();
  window.BattleEffects.recover(st);
  return { m: m.uid, male: male.uid, female: female.uid,
    foes: b.enemies.map(e => e.uid) };
})()`;

const clickSkill = () => `(() => {
  const clickable = [...document.querySelectorAll("[data-skill-index]")]
    .find(el => (el.getAttribute("title") || "").includes("渴血杀戮"));
  if (!clickable) return { clicked: false };
  clickable.click();
  return { clicked: true };
})()`;

const readTargets = uids => `(() => {
  const sel = uid => !!document.querySelector('[data-target="' + uid + '"].selectable-target');
  const muted = [...document.querySelectorAll(".muted")]
    .map(el => el.textContent || "").filter(Boolean);
  const b = window.state.battle;
  return {
    picked: !!b.selectedSkillCard,
    pickedName: b.selectedSkillCard?.name || null,
    sel: Object.entries(${JSON.stringify(uids)})
      .reduce((acc, [k, uid]) => (acc[k] = sel(uid), acc), {}),
    tips: muted,
  };
})()`;

// 敌方对米尔尤拉所在阵营打出【魔王军入侵】（targetless AOE）。
// target 传 allies[0]（不是米尔尤拉），复现「单体拦截看不到她」的真实场景。
const castInvasion = () => `(() => {
  const st = window.state, b = st.battle;
  const foe = b.enemies[0];
  b.activeUid = foe.uid;
  b.animQueue = []; b.reactionQueue = []; b.locked = false;
  const card = { name: "魔王军入侵", type: "tactic", attackType: "magic",
    hybridAttack: true, demonInvasion: true, targetless: true, suit: "♠",
    uid: "inv0", text: "t" };
  foe.hand = [card];
  const before = { m: b.allies[1].hp, other: b.allies[0].hp, male: b.allies[2].hp };
  window.BattleSystem.useCard(st, foe, b.allies[0], card);
  return { before,
    after: { m: b.allies[1].hp, other: b.allies[0].hp, male: b.allies[2].hp },
    log: (window.state.log || []).filter(x => String(x).includes("免疫战术牌")).length };
})()`;

// 底层兜底：直接以战术牌 / 杀牌 的名义对她造成伤害
const probeDamage = () => `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[1], foe = b.enemies[0];
  b.animQueue = []; b.reactionQueue = []; b.locked = false;
  const hp0 = m.hp;
  window.BattleSystem.damage(st, m, 7, "魔王军入侵", foe,
    { name: "魔王军入侵", type: "tactic" });
  const afterTactic = m.hp;
  window.BattleSystem.damage(st, m, 7, "杀（普攻）", foe,
    { name: "杀（普攻）", type: "slash" });
  const afterSlash = m.hp;
  return { hp0, afterTactic, afterSlash,
    tacticLoss: hp0 - afterTactic, slashLoss: afterTactic - afterSlash };
})()`;

const dropSkill = () => `(() => {
  const b = window.state.battle;
  b.allies[1].skills = b.allies[1].skills.filter(s => s.name !== "无谋霸姬");
  return { skills: b.allies[1].skills.map(s => s.name) };
})()`;

const resetHp = () => `(() => {
  const b = window.state.battle;
  b.allies.forEach(u => { u.hp = u.maxHp; });
  b.enemies.forEach(u => { u.hp = u.maxHp; });
  b.animQueue = []; b.reactionQueue = []; b.locked = false;
  window.render();
  return { ok: true };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(300);
  const info = await page.evaluate(setupTpl);
  console.log(`   setup: 米尔尤拉=${info.m} 男队友=${info.male} 女队友=${info.female}`);

  // ── A 组：选中渴血杀戮后的目标过滤 ──────────────────────────
  T("A1 渴血杀戮技能按钮可点", (await page.evaluate(clickSkill())).clicked);
  await page.waitForTimeout(400);
  const tg = await page.evaluate(readTargets({
    米尔尤拉: info.m, 男队友: info.male, 女队友: info.female,
    敌0: info.foes[0], 敌1: info.foes[1],
  }));
  console.log(`   可选状态：${JSON.stringify(tg.sel)}`);
  T("A2 技能牌已进入选中态", tg.picked && tg.pickedName === "渴血杀戮", tg);
  T("A3 我方男性角色可选", tg.sel["男队友"] === true, tg.sel);
  T("A4 我方女性角色不可选", tg.sel["女队友"] === false, tg.sel);
  T("A5 米尔尤拉自己不可选", tg.sel["米尔尤拉"] === false, tg.sel);
  T("A6 敌方角色不可选", tg.sel["敌0"] === false && tg.sel["敌1"] === false, tg.sel);

  // ── B 组：提示文案 ────────────────────────────────────────
  const joined = (tg.tips || []).join(" | ");
  console.log(`   提示文案：${joined}`);
  T("B1 提示写明「我方一名男性」", joined.includes("我方一名男性"), tg.tips);
  T("B2 不再出现与自疗有关的通用文案",
    !joined.includes("快速自疗"), tg.tips);

  await page.evaluate(`(() => { window.BattleSystem.cancelSelection(window.state); return 1; })()`);
  await page.waitForTimeout(200);

  // ── C 组：AOE 战术牌对米尔尤拉无效 ─────────────────────────
  const inv = await page.evaluate(castInvasion());
  console.log(`   魔王军入侵：${JSON.stringify(inv)}`);
  T("C1 米尔尤拉不掉血（无谋霸姬免疫 AOE 战术牌）",
    inv.after.m === inv.before.m, inv);
  T("C2 同阵营其他人正常掉血（免疫没有波及全队）",
    inv.after.other < inv.before.other || inv.after.male < inv.before.male, inv);
  T("C3 战报出现免疫说明", inv.log > 0, inv);

  // ── D 组：底层兜底 ────────────────────────────────────────
  await page.evaluate(resetHp());
  const dmg = await page.evaluate(probeDamage());
  console.log(`   直接伤害：${JSON.stringify(dmg)}`);
  T("D1 战术牌名义的伤害被拦下", dmg.tacticLoss === 0, dmg);
  T("D2 杀牌伤害正常生效（没有一刀切免疫）", dmg.slashLoss > 0, dmg);

  // ── E 组：对照组 —— 没有无谋霸姬时 AOE 能打到她 ──────────────
  await page.evaluate(resetHp());
  await page.evaluate(dropSkill());
  await page.evaluate(resetHp());
  const inv2 = await page.evaluate(castInvasion());
  console.log(`   去掉技能后：${JSON.stringify(inv2)}`);
  T("E1 去掉无谋霸姬后米尔尤拉会掉血（证明免疫确由该技能引起）",
    inv2.after.m < inv2.before.m, inv2);

  const bad = relevantErrors(errors);
  T("E2 页面无相关报错", bad.length === 0, bad.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
