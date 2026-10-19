// 米尔尤拉 · 渴血杀戮「选牌名 → 点敌人」全链路实机回归
//
// 用户反馈要确认两件事：
//   1. 能不能选牌（牌名弹窗是否正常出现、有哪些选项、已用过的牌名是否置灰）
//   2. 选定的杀牌能不能选择敌人（点敌方角色后虚拟牌是否真的打出、不消耗杀意）
//
// 本测试全程走真实 DOM：点技能按钮 → 点我方男性 → 弹窗出现 → 点牌名 →
// 弹窗消失、底部提示条出现、敌方被标成可选 → 真实点击敌方单位 → 结算。
// 之前的 test-mieryula-skills-live.js 是直接调 useBloodthirstVirtual()，
// 绕过了「点得到点不到」这一层，属于假绿。
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

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.phase = 4;
  while (b.allies.length < 2) {
    const n = b.allies.length;
    b.allies.push({ uid: "fill" + n, name: "补位" + n, ref: "fill" + n, id: "fill" + n,
      gender: "female", side: "ally", hp: 50, maxHp: 50, block: 0, hand: [], skills: [],
      stats: { attack: 4, magic: 4, speed: 4 } });
  }
  const m = b.allies[0], male = b.allies[1];
  m.name = "米尔尤拉"; m.ref = "mieryula"; m.id = "mieryula"; m.gender = "female";
  m.stats = { attack: 4, magic: 2, speed: 5 };
  m.tempAttack = 0; m.tempMagic = 0; m.block = 0;
  m.hp = m.maxHp = 52; m.bloodlust = 1; m.bloodlustMax = 1;
  m.mieryulaBloodthirstUsed = {};
  m.skills = [
    { name: "无谋霸姬", type: "passive" },
    { name: "渴血杀戮", type: "active", card: { name: "渴血杀戮", type: "tactic",
      mieryulaBloodthirst: true, allyTarget: true, icon: "⚔️", text: "t" } },
  ];
  m.hand = [];
  male.name = "罗卡尔"; male.ref = "lokar"; male.id = "lokar"; male.gender = "male";
  male.hp = male.maxHp = 62; male.block = 0; male.hand = [];
  b.enemies.forEach((e, i) => {
    e.gender = "male"; e.hp = e.maxHp = 60; e.block = 0; e.statuses = [];
    e.hand = [{ name: "闪", type: "basic", suit: "♣", uid: "eh" + i }];
  });
  b.allies.concat(b.enemies).forEach(u =>
    u.hand.forEach(c => { delete c._pendingDraw; }));
  b.activeUid = m.uid;
  b.mieryulaBloodthirstPicker = null;
  b.selectedSkillCard = null; b.selectedCardIndex = null; b.pendingTargetUid = null;
  window.render();
  window.BattleEffects.recover(st);
  return { m: m.uid, male: male.uid, foes: b.enemies.map(e => e.uid),
    pool: window.MieryulaSkills.slashPool(st).map(c => c.name) };
})()`;

const clickSkill = () => `(() => {
  const clickable = [...document.querySelectorAll("[data-skill-index]")]
    .find(el => (el.getAttribute("title") || "").includes("渴血杀戮"));
  if (!clickable) return { clicked: false,
    titles: [...document.querySelectorAll("button.skill")]
      .map(el => (el.getAttribute("title") || "").slice(0, 12)) };
  clickable.click();
  return { clicked: true };
})()`;

const clickUnit = uid => `(() => {
  const el = document.querySelector('[data-target="${uid}"] .unit-art');
  if (!el) return { ok: false, reason: "no-dom" };
  el.click();
  return { ok: true };
})()`;

const readPopup = () => `(() => {
  const b = window.state.battle;
  const buttons = [...document.querySelectorAll("[data-mieryula-slash]")];
  return {
    picker: !!b.mieryulaBloodthirstPicker,
    cardName: b.mieryulaBloodthirstPicker?.cardName || null,
    popupShown: !!document.querySelector(".armory-popup"),
    options: buttons.map(el => el.dataset.mieryulaSlash),
    enabled: buttons.filter(el => !el.disabled).map(el => el.dataset.mieryulaSlash),
    disabled: buttons.filter(el => el.disabled).map(el => el.dataset.mieryulaSlash),
    skip: !!document.querySelector("[data-mieryula-skip]"),
  };
})()`;

const clickSlash = name => `(() => {
  const el = document.querySelector(
    '[data-mieryula-slash="' + ${JSON.stringify(name)} + '"]');
  if (!el) return { ok: false, reason: "no-button",
    have: [...document.querySelectorAll("[data-mieryula-slash]")]
      .map(x => x.dataset.mieryulaSlash) };
  if (el.disabled) return { ok: false, reason: "disabled" };
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  return { ok: true };
})()`;

const readAfterChoose = () => `(() => {
  const b = window.state.battle;
  const foes = b.enemies.filter(e => e.hp > 0);
  return {
    cardName: b.mieryulaBloodthirstPicker?.cardName || null,
    popupShown: !!document.querySelector(".armory-popup"),
    bar: (document.querySelector(".discard-prompt")?.textContent || "").slice(0, 24),
    barShown: [...document.querySelectorAll(".discard-prompt")]
      .some(el => el.textContent.includes("渴血杀戮")),
    skip: !!document.querySelector("[data-mieryula-skip]"),
    locked: !!b.locked,
    enemyPickingClass: (document.querySelector(".battle-screen")?.className || "")
      .includes("enemy-picking"),
    foeSelectable: foes.map(e => ({
      uid: e.uid,
      selectable: !!document.querySelector(
        '[data-target="' + e.uid + '"].selectable-target'),
    })),
  };
})()`;

const readResult = () => `(() => {
  const b = window.state.battle;
  const m = b.allies[0], male = b.allies[1];
  const foe = b.enemies[0];
  return {
    maleHpLoss: 62 - male.hp,
    foeHp: foe.hp,
    foeHpLoss: 60 - foe.hp,
    bloodlust: m.bloodlust,
    picker: !!b.mieryulaBloodthirstPicker,
    locked: !!b.locked,
    used: Object.keys(m.mieryulaBloodthirstUsed || {}),
    log: (window.state.log || []).filter(x => String(x).includes("渴血杀戮")).length,
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(300);
  const info = await page.evaluate(setupTpl);
  console.log(`   setup: 杀牌牌池 ${info.pool.length} 项：${info.pool.join("/")}`);
  T("A0 牌池非空（能选牌的前提）", info.pool.length > 0, info.pool);

  // ── 第一段：点技能 → 点我方男性 ──────────────────────────────
  T("A1 技能按钮可点（未被置灰）", (await page.evaluate(clickSkill())).clicked);
  await page.waitForTimeout(150);
  const maleClick = await page.evaluate(clickUnit(info.male));
  T("A2 我方男性单位可点击", maleClick.ok, maleClick);
  // 技能结算走动画队列，渲染是异步的：必须等弹窗真的出现再断言，
  // 否则读到的是上一帧快照（第一次跑就是这样 6 项假红）。
  const popupShown = await page.waitForSelector("[data-mieryula-slash]",
    { timeout: 8000 }).then(() => true).catch(() => false);
  T("A2b 牌名弹窗最终渲染出来", popupShown);

  const popup = await page.evaluate(readPopup());
  T("A3 对友方男性造成伤害（=攻击力4）",
    (await page.evaluate(`(() => 62 - window.state.battle.allies[1].hp)()`)) === 4,
    await page.evaluate(`(() => ({ hp: window.state.battle.allies[1].hp }))()`));
  T("A4 牌名弹窗出现（从牌库选，保留弹窗）", popup.popupShown, popup);
  T("A5 弹窗列出全部杀牌牌名", popup.options.length === info.pool.length, popup);
  T("A6 首次进入时全部牌名可选", popup.enabled.length === info.pool.length, popup);
  T("A7 弹窗有「不发动」按钮", popup.skip, popup);

  // ── 第二段：选一个牌名 ─────────────────────────────────────
  const pick = popup.enabled[0];
  const chose = await page.evaluate(clickSlash(pick));
  T("B1 牌名按钮可点", chose.ok, chose);
  await page.waitForFunction(
    name => window.state?.battle?.mieryulaBloodthirstPicker?.cardName === name,
    pick, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);

  const after = await page.evaluate(readAfterChoose());
  console.log(`   选定牌名：${pick}`);
  T("B2 picker 记录了选定牌名", after.cardName === pick, after);
  T("B3 弹窗消失（不再弹第二层）", !after.popupShown, after);
  T("B4 手牌区底部提示条出现且写明牌名",
    after.barShown && after.bar.includes(pick), after);
  T("B5 底部提示条有「不发动」", after.skip, after);
  T("B6 战斗界面带 enemy-picking（放开敌方点击）", after.enemyPickingClass, after);
  T("B7 敌方单位被标成可选（点得到）",
    after.foeSelectable.length > 0 && after.foeSelectable.every(f => f.selectable), after);

  // ── 第三段：真实点击敌方角色 ──────────────────────────────
  const foeClick = await page.evaluate(clickUnit(info.foes[0]));
  T("B8 敌方单位 DOM 可点击", foeClick.ok, foeClick);
  await page.waitForTimeout(700);
  const res = await page.evaluate(readResult());
  console.log(`   结果：${JSON.stringify(res)}`);
  T("C1 敌方掉血（虚拟杀牌真的打出）", res.foeHpLoss > 0, res);
  T("C2 杀意未消耗（虚拟牌不消耗杀意）", res.bloodlust === 1, res);
  T("C3 picker 已清空", !res.picker, res);
  T("C4 界面解锁", !res.locked, res);
  T("C5 该牌名记入本回合已用", res.used.includes(pick), res);

  // ── 第四段：同回合再发动，已用牌名应置灰 ────────────────────
  const reset = `(() => {
    const st = window.state, b = st.battle;
    b.animQueue = []; b.locked = false; b.phase = 4;
    b.activeUid = b.allies[0].uid;
    b.selectedSkillCard = null; b.selectedCardIndex = null; b.pendingTargetUid = null;
    b.mieryulaBloodthirstPicker = null;
    const m = b.allies[0], male = b.allies[1];
    male.hp = 62; m.bloodlust = 1;
    b.enemies.forEach(e => { e.hp = e.maxHp = 60; e.statuses = []; });
    window.render();
    window.BattleEffects.recover(st);
    return { ok: true };
  })()`;
  await page.evaluate(reset);
  await page.waitForTimeout(200);
  T("D1 同回合可再次发动技能", (await page.evaluate(clickSkill())).clicked);
  await page.waitForTimeout(150);
  await page.evaluate(clickUnit(info.male));
  await page.waitForSelector("[data-mieryula-slash]", { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);
  const popup2 = await page.evaluate(readPopup());
  T("D2 已用过的牌名被置灰", popup2.disabled.includes(pick), popup2);
  T("D3 其余牌名仍可选", popup2.enabled.length === info.pool.length - 1, popup2);

  const bad = relevantErrors(errors);
  T("E1 页面无异常", bad.length === 0, bad.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error(err); process.exit(1); });
