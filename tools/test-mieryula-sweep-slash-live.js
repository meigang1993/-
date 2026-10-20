// 米尔尤拉 · 渴血杀戮「多目标杀牌」结算确认
//
// 用户要确认：牌名池里有【机枪扫杀】这类 sweep（指定所有敌方角色）的杀牌，
// 选定它、再点一名敌人之后，到底只打这一个人，还是按牌本身的效果横扫全部敌人。
//
// 结论必须靠实测给出，不能靠读代码想当然：渴血杀戮走
// useBloodthirstVirtual → ctx.useCard(state, actor, target, card)，
// 而攻击流程里 card.sweep 会改走 sweepDamage（对全体存活敌方各结算一次），
// 单靠看代码无法确认「点选的那名敌人」会不会被重复打两次、
// 或者反过来被忽略。
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

const SWEEP = "机枪扫杀";
const ENEMY_HP = 60;

const setupTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.reactionQueue = []; b.locked = false; b.phase = 4;
  b.kaiichiShare = null; b.kaiichiShareQueue = [];
  while (b.enemies.length < 3) {
    const n = b.enemies.length;
    b.enemies.push({ uid: "efill" + n, name: "补敌" + n, ref: "fill_e" + n, id: "fill_e" + n,
      gender: "male", side: "enemy", hp: ${ENEMY_HP}, maxHp: ${ENEMY_HP}, block: 0,
      hand: [], skills: [], statuses: [], battleRelics: [],
      stats: { attack: 4, magic: 4, speed: 4 } });
  }
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
    e.gender = "male"; e.hp = e.maxHp = ${ENEMY_HP}; e.block = 0; e.statuses = [];
    e.hand = [];
  });
  b.allies.concat(b.enemies).forEach(u =>
    u.hand.forEach(c => { delete c._pendingDraw; }));
  b.activeUid = m.uid;
  b.mieryulaBloodthirstPicker = null;
  b.selectedSkillCard = null; b.selectedCardIndex = null; b.pendingTargetUid = null;
  window.render();
  window.BattleEffects.recover(st);
  return { m: m.uid, male: male.uid, foes: b.enemies.map(e => e.uid),
    pool: window.MieryulaSkills.slashPool(st).map(c => c.name),
    sweepMeta: (() => {
      const c = window.MieryulaSkills.slashPool(st).find(x => x.name === ${JSON.stringify(SWEEP)});
      return c ? { sweep: !!c.sweep, targetless: !!c.targetless, type: c.type } : null;
    })() };
})()`;

const clickSkill = () => `(() => {
  const el = [...document.querySelectorAll("[data-skill-index]")]
    .find(x => (x.getAttribute("title") || "").includes("渴血杀戮"));
  if (!el) return { clicked: false };
  el.click();
  return { clicked: true };
})()`;

const clickUnit = uid => `(() => {
  const el = document.querySelector('[data-target="${uid}"] .unit-art');
  if (!el) return { ok: false, reason: "no-dom" };
  el.click();
  return { ok: true };
})()`;

const clickSlash = name => `(() => {
  const el = document.querySelector('[data-mieryula-slash="' + ${JSON.stringify(name)} + '"]');
  if (!el) return { ok: false, reason: "no-button" };
  if (el.disabled) return { ok: false, reason: "disabled" };
  el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
  return { ok: true };
})()`;

const readResult = () => `(() => {
  const b = window.state.battle;
  const m = b.allies[0];
  return {
    bloodlust: m.bloodlust,
    picker: !!b.mieryulaBloodthirstPicker,
    locked: !!b.locked,
    used: Object.keys(m.mieryulaBloodthirstUsed || {}),
    foeHp: b.enemies.map(e => ({ uid: e.uid, hp: e.hp, loss: ${ENEMY_HP} - e.hp })),
    logs: (window.state.log || []).filter(x => String(x).includes("渴血杀戮")
      || String(x).includes(${JSON.stringify(SWEEP)})),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  await page.waitForTimeout(300);
  const info = await page.evaluate(setupTpl);
  console.log(`   setup: 敌方 ${info.foes.length} 名；杀牌池 ${info.pool.length} 项`);
  console.log(`   ${SWEEP} 元数据：${JSON.stringify(info.sweepMeta)}`);

  T("A0 牌池含【机枪扫杀】且标记为 sweep",
    !!info.sweepMeta && info.sweepMeta.sweep === true, info.sweepMeta);
  T("A1 场上至少 3 名敌方（能看出是单体还是横扫）", info.foes.length >= 3, info.foes);

  T("A2 技能按钮可点", (await page.evaluate(clickSkill())).clicked);
  await page.waitForTimeout(150);
  T("A3 我方男性单位可点击", (await page.evaluate(clickUnit(info.male))).ok);
  const popupShown = await page.waitForSelector("[data-mieryula-slash]", { timeout: 8000 })
    .then(() => true).catch(() => false);
  T("A4 牌名弹窗渲染出来", popupShown);

  const chose = await page.evaluate(clickSlash(SWEEP));
  T("A5 【机枪扫杀】按钮可点", chose.ok, chose);
  await page.waitForFunction(
    name => window.state?.battle?.mieryulaBloodthirstPicker?.cardName === name,
    SWEEP, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(300);

  // 关键一步：只点第一名敌人，看其余敌人会不会一起掉血。
  const foeClick = await page.evaluate(clickUnit(info.foes[0]));
  T("A6 第一名敌方单位 DOM 可点击", foeClick.ok, foeClick);
  await page.waitForTimeout(1200);
  const res = await page.evaluate(readResult());
  console.log(`   结果：${JSON.stringify(res.foeHp)}`);
  res.logs.forEach(line => console.log(`   log: ${line}`));

  const hurt = res.foeHp.filter(f => f.loss > 0);
  T("B1 被点击的那名敌人掉血", res.foeHp[0].loss > 0, res.foeHp);
  T("B2 其余敌人也掉血 → 确认是横扫（sweep 生效）",
    res.foeHp.slice(1).every(f => f.loss > 0), res.foeHp);
  T("B3 全体敌人掉血，不是只打一个", hurt.length === res.foeHp.length, res.foeHp);
  T("B4 每名敌人掉血相同（各一次，无重复结算）",
    new Set(res.foeHp.map(f => f.loss)).size === 1, res.foeHp);
  // 无谋霸姬：手上没有战术牌时伤害翻倍（4 → 8），故这里断言 8 而非 4。
  T("B5 掉血 = 攻击力 4 × 无谋霸姬翻倍 = 8",
    res.foeHp.every(f => f.loss === 8), res.foeHp);
  T("B6 杀意未消耗（虚拟牌不消耗杀意）", res.bloodlust === 1, res);
  T("B7 picker 已清空", !res.picker, res);
  T("B8 界面解锁", !res.locked, res);
  T("B9 该牌名记入本回合已用", res.used.includes(SWEEP), res);

  const bad = relevantErrors(errors);
  T("C0 无 JS 报错", bad.length === 0, bad.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
