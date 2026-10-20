// 米尔尤拉 · 无谋霸姬「她无法使用战术牌」实机回归
//
// 要确认的是：手牌区的战术牌是不是真的置灰不可用，而不是只在逻辑层判了一下。
//   A 组：canPlay 判定 + 手牌 DOM 的 disabled 类
//   B 组：真实点击战术牌，确认打不出去（不选中、不入弃牌堆、无战报）
//   C 组：对照组 —— 去掉「无谋霸姬」技能后战术牌恢复可用，证明置灰确实由它引起
//   D 组：技能牌（渴血杀戮 / 神奇怀表）本身是 tactic 类型，不能被这条规则误伤
//   E 组：敌方战术牌指定她时无效（锁定技的另一半）
//
// 注意：米尔尤拉的技能牌走 ui-common-skill-model 的 skillCard()，会补 _skill:true，
// 所以 blocksTactic 不该把它们也置灰 —— 这正是 D 组要守住的边界。
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
  m.tempAttack = 0; m.tempMagic = 0; m.block = 0; m.intent = 1;
  m.hp = m.maxHp = 52; m.bloodlust = 1; m.bloodlustMax = 1;
  m.mieryulaBloodthirstUsed = {};
  m.usedMieryulaTimeStop = false;
  m.skills = [
    { name: "无谋霸姬", type: "passive" },
    { name: "渴血杀戮", type: "active", card: { name: "渴血杀戮", type: "tactic",
      mieryulaBloodthirst: true, allyTarget: true, icon: "⚔️", text: "t" } },
    { name: "神奇怀表", type: "active", card: { name: "神奇怀表", type: "tactic",
      mieryulaTimeStop: true, targetless: true, icon: "🔺", text: "t" } },
  ];
  // 手牌：一张普通战术牌 + 一张实体杀牌（杀牌必须仍可打出）
  m.hand = [
    { name: "魅惑术", type: "tactic", suit: "♥", uid: "mt0", text: "战术牌" },
    { name: "杀（普攻）", type: "slash", suit: "♠", uid: "mb0", text: "实体杀" },
  ];
  male.name = "罗卡尔"; male.ref = "lokar"; male.id = "lokar"; male.gender = "male";
  male.hp = male.maxHp = 62; male.block = 0; male.intent = 1;
  male.hand = [{ name: "魅惑术", type: "tactic", suit: "♥", uid: "lt0", text: "战术牌" }];
  b.enemies.forEach((e, i) => {
    e.gender = "male"; e.hp = e.maxHp = 60; e.block = 0; e.statuses = [];
    e.hand = [{ name: "闪", type: "basic", suit: "♣", uid: "eh" + i }];
  });
  b.allies.concat(b.enemies).forEach(u =>
    u.hand.forEach(c => { delete c._pendingDraw; }));
  b.activeUid = m.uid;
  b.mieryulaBloodthirstPicker = null;
  b.mieryulaTimeStopOwner = null;
  b.selectedSkillCard = null; b.selectedCardIndex = null; b.pendingTargetUid = null;
  st.log = []; st.battleLog = [];
  window.render();
  window.BattleEffects.recover(st);
  return { ok: true, hand: m.hand.map(c => c.name) };
})()`;

// ── A 组：置灰判定 ────────────────────────────────────────
const probeTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0], male = b.allies[1];
  const tactic = m.hand.find(c => c.type === "tactic");
  const slash = m.hand.find(c => c.type === "slash");
  const skillCard = name => {
    const skill = (m.skills || []).find(s => s.name === name);
    return skill?.card ? { ...skill.card, _skill: true, skillName: name } : null;
  };
  const canPlay = (actor, card) =>
    !!window.BattleSystem?.canPlay?.(actor, card, b);
  const handCards = [...document.querySelectorAll(".play-card")];
  const domDisabled = name => {
    const el = handCards.find(el =>
      el.querySelector(".card-title b")?.textContent === name);
    return el ? el.classList.contains("disabled") : null;
  };
  const skillDom = [...document.querySelectorAll("[data-skill-index]")]
    .map(el => ({ name: el.textContent.trim().slice(0, 12), disabled: el.disabled === true
      || el.classList.contains("disabled") }));
  return {
    tacticCan: canPlay(m, tactic),
    slashCan: canPlay(m, slash),
    bloodthirstCan: canPlay(m, skillCard("渴血杀戮")),
    watchCan: canPlay(m, skillCard("神奇怀表")),
    tacticDom: domDisabled("魅惑术"),
    slashDom: domDisabled("杀（普攻）"),
    skillDom,
    hasRegistry: typeof window.MieryulaSkills?.blocksTactic === "function",
  };
})()`;

// ── B 组：真实点击战术牌 ──────────────────────────────────
const clickTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0];
  const idx = m.hand.findIndex(c => c.type === "tactic");
  const el = [...document.querySelectorAll(".play-card")]
    .find(el => el.querySelector(".card-title b")?.textContent === "魅惑术");
  if (!el) return { ok: false, reason: "no-dom" };
  el.click();
  return {
    handCount: m.hand.length,
    selected: b.selectedCardIndex,
    played: (b.played || []).map(c => c.name),
    log: (st.battleLog || []).slice(0, 3),
  };
})()`;

// ── C 组：去掉「无谋霸姬」后应恢复可用 ────────────────────
const controlTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0], male = b.allies[1];
  const keep = m.skills;
  m.skills = m.skills.filter(s => s.name !== "无谋霸姬");
  const tacticM = m.hand.find(c => c.type === "tactic");
  const tacticL = male.hand.find(c => c.type === "tactic");
  const out = {
    withoutSkill: !!window.BattleSystem?.canPlay?.(m, tacticM, b),
    otherTactic: !!window.BattleSystem?.canPlay?.(male, tacticL, b),
  };
  m.skills = keep;
  window.render();
  return out;
})()`;

// ── E 组：敌方战术牌指定她无效 ────────────────────────────
const immuneTpl = `(() => {
  const st = window.state, b = st.battle;
  const m = b.allies[0], foe = b.enemies[0];
  const before = m.hand.length;
  const ok = window.MieryulaSkills?.interceptTactic?.(st, foe, m,
    { name: "魅惑术", type: "tactic" });
  return { intercepted: ok === true, handAfter: m.hand.length, before,
    log: (st.battleLog || []).slice(0, 2) };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = collectErrors(page);
  await startRegressionBattle(page);
  await page.evaluate(setupTpl);

  const a = await page.evaluate(probeTpl);
  console.log("  探针:", JSON.stringify(a));

  T("A1 米尔尤拉手牌的战术牌：canPlay 判为不可打出", a.tacticCan === false, a);
  T("A2 战术牌在 DOM 上带 disabled 置灰样式", a.tacticDom === true, a);
  T("A3 同一手牌里的实体杀牌仍可打出（未被误伤）", a.slashCan === true, a);
  T("A4 实体杀牌 DOM 未置灰", a.slashDom === false, a);
  T("A5 blocksTactic 已装配（非跨包静默放行）", a.hasRegistry === true, a);

  const skillByName = name =>
    a.skillDom.find(s => s.name.includes(name));
  const bt = skillByName("渴血杀戮"), wt = skillByName("神奇怀表");
  T("D1 技能牌【渴血杀戮】不被战术牌禁令误伤", a.bloodthirstCan === true, a);
  T("D2 技能牌【神奇怀表】不被战术牌禁令误伤", a.watchCan === true, a);
  T("D3 技能按钮 DOM 未置灰", !!bt && bt.disabled === false && !!wt
    && wt.disabled === false, a.skillDom);

  const b = await page.evaluate(clickTpl);
  console.log("  点击:", JSON.stringify(b));
  T("B1 真实点击战术牌：牌没有出出去", b.played.length === 0, b);
  T("B2 点击后手牌数量不变", b.handCount === 2, b);
  T("B3 点击后没有进入选中态", !b.selected && b.selected !== 0, b);

  const c = await page.evaluate(controlTpl);
  console.log("  对照:", JSON.stringify(c));
  T("C1 去掉【无谋霸姬】后战术牌恢复可用（置灰确实由它引起）",
    c.withoutSkill === true, c);
  T("C2 其他角色的战术牌不受影响", c.otherTactic === true, c);

  await page.evaluate(setupTpl);
  const e = await page.evaluate(immuneTpl);
  console.log("  免疫:", JSON.stringify(e));
  T("E1 敌方战术牌指定她被拦截", e.intercepted === true, e);
  T("E2 拦截后她的手牌没有被弃掉", e.handAfter === e.before, e);

  const bad = relevantErrors(errors);
  T("无页面报错", bad.length === 0, bad.slice(0, 3));

  await browser.close();
  console.log(`\n通过 ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})();
