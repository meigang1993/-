// 普雷希 · 技能「实际效果」严格检查（补齐旧测试只验标记未验效果的部分）
//
//   ⭐ 女王威压：①手牌多于目标 → 不可响应（旧测试只验 card.ignoreResponse 标记，
//                此处验「敌方手里有【闪】也照常掉血、闪没被消耗」）
//                ②手牌全场最多 → 造成/受到伤害 2 倍（并列最多也算）
//   ⚔️ 女王榨取：伤害 = 魔力值；只对我方男性生效（女性/敌方/自己均不生效且不消耗次数）
//
// 另验：角色表属性（生命56/杀意1/手牌4/每回合摸牌3/初始摸牌5）与四条台词。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startFreshGame, startRegressionBattle, dismissOpeningStory,
  collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}`
    + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// ── 角色表属性与台词 ────────────────────────────────────
const dataTpl = `(() => {
  const chars = window.GameData?.characters || [];
  const p = chars.find(c => c.id === "preshi") || {};
  const s = p.stats || {};
  const lines = window.BattleLineData?.skillLines?.preshi || {};
  const intro = window.BattleLineData?.allyIntroLines?.preshi || "";
  return {
    maxHp: s.maxHp, bloodlust: s.bloodlust, handLimit: s.handLimit,
    turnDraw: 2 + (s.drawPerTurn || 0), initialDraw: 4 + (s.initialDraw || 0),
    intro,
    suppress: lines["女王威压"] || "",
    outLine: lines["女王威压造成伤害"] || "",
    inLine: lines["女王威压受到伤害"] || "",
    drainLine: lines["女王榨取"] || "",
  };
})()`;

// ── 女王威压 · 不可响应的实际效果 ──────────────────────
// foeHands：敌方手牌数（含一张♥闪）；preshiHands 为普雷希手牌数
const suppressRealTpl = (preshiHands, foeHands) => `(() => {
  const st = window.state, b = st.battle;
  st.settings = st.settings || {};
  st.settings.manualResponse = false;
  b.animQueue = []; b.locked = false;
  if (b.reactionQueue) b.reactionQueue = [];
  const p = b.allies[0], foe = b.enemies[0];
  p.name = "普雷希"; p.ref = "preshi"; p.id = "preshi"; p.gender = "female";
  p.stats = { attack: 4.8, magic: 5, speed: 5.5 };
  p.hp = p.maxHp = 56; p.block = 0;
  p.skills = [{ name: "女王威压", type: "passive" }];
  p.hand = [];
  for (let i = 0; i < ${preshiHands}; i++)
    p.hand.push({ name: "闪", type: "basic", suit: "♠", uid: "ph" + i });
  foe.hp = foe.maxHp = 60; foe.block = 0; foe.skills = []; foe.ai = null;
  // 【闪】必须是 response 类型：canRespondTo 只认 type === "response"，
  // 用 basic 的话对照组里敌方压根无法响应，实验组两条断言就成了恒绿。
  foe.hand = [{ name: "闪", type: "response", suit: "♥", uid: "foe-dodge" }];
  for (let i = 1; i < ${foeHands}; i++)
    foe.hand.push({ name: "闪", type: "response", suit: "♣", uid: "fh" + i });
  st.log = [];
  const card = window.CardUtils.cloneEntity("杀");
  p.hand.push(card);
  window.BattleSystem.useCard(st, p, foe, card);
  return {
    // 女王威压的压制改为响应判定时逐目标实时计算，不再写成牌上的 ignoreResponse，
    // 故此处断言判据返回值，实际效果由上面两条（掉血、闪未被消耗）证验。
    suppressed: window.PreshiSkills.suppressesResponse(st, p, foe, card),
    foeHpLoss: 60 - foe.hp,
    dodgeLeft: foe.hand.filter(c => c.uid === "foe-dodge").length,
  };
})()`;

// ── 女王威压 · 并列最多也算全场最多 ────────────────────
const tieTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  const p = b.allies[0], mate = b.allies[1], foe = b.enemies[0];
  const set = (u, n) => { u.hand = []; for (let i = 0; i < n; i++)
    u.hand.push({ name: "闪", type: "basic", suit: "♠", uid: u.uid + "-h" + i }); };
  // 回归战斗里其余单位仍带着初始手牌，不清空会盖过并列值
  b.allies.forEach(u => { if (u !== p && u !== mate) u.hand = []; });
  b.enemies.forEach(u => { u.hand = []; });
  set(p, 3); set(mate, 3); set(foe, 1);
  p.name = "普雷希"; p.ref = "preshi"; p.id = "preshi";
  p.stats = { attack: 4.8, magic: 5, speed: 5.5 };
  p.hp = p.maxHp = 56;
  p.skills = [{ name: "女王威压", type: "passive" }];
  const top = window.PreshiSkills.topHand(st, p);
  foe.hp = foe.maxHp = 60; foe.block = 0;
  const card = { name: "杀（普攻）", type: "slash", suit: "♠", ignoreResponse: true };
  window.BattleSystem.damage(st, foe, 10, "测试", p, card);
  return { top, out: 60 - foe.hp };
})()`;

// ── 女王榨取 · 目标限制 ────────────────────────────────
// kind: female(我方女性) / enemy(敌方男性) / self(自己)
const drainTargetTpl = kind => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  const p = b.allies[0], m = b.allies[1], foe = b.enemies[0];
  p.name = "普雷希"; p.ref = "preshi"; p.id = "preshi"; p.gender = "female";
  p.stats = { attack: 4.8, magic: 5, speed: 5.5 };
  p.hp = p.maxHp = 56; p.block = 0; p.hand = [];
  p.skills = [
    { name: "女王威压", type: "passive" },
    { name: "女王榨取", type: "active", card: { name: "女王榨取", type: "tactic", preshiDrain: true, allyTarget: true, icon: "⚔️", text: "指定我方一名男性角色。" } },
  ];
  p.usedPreshiDrain = false;
  m.name = "贝尔蒂丝"; m.ref = "bertis"; m.id = "bertis"; m.gender = "female";
  m.hp = m.maxHp = 60; m.block = 0;
  m.hand = [{ name: "闪", type: "basic", suit: "♥", uid: "mh0" }];
  foe.name = "敌人"; foe.gender = "male"; foe.hp = foe.maxHp = 60; foe.block = 0;
  foe.hand = [{ name: "闪", type: "basic", suit: "♥", uid: "eh0" }];
  const target = ${kind === "female" ? "m" : kind === "enemy" ? "foe" : "p"};
  if (${kind === "self"}) { p.gender = "female"; }
  const before = target.hp;
  const card = { name: "女王榨取", type: "tactic", preshiDrain: true,
    allyTarget: true, icon: "⚔️", text: "t", _skill: true };
  p.hand.push(card);
  window.BattleSystem.useCard(st, p, target, card);
  return {
    hpLoss: before - target.hp,
    used: !!p.usedPreshiDrain,
    left: (target.hand || []).filter(c => !c._pendingDraw).length,
  };
})()`;

// ── 女王榨取 · 伤害 = 魔力值（且不被威压翻倍）──────────
const drainMagicTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  const p = b.allies[0], m = b.allies[1];
  p.name = "普雷希"; p.ref = "preshi"; p.id = "preshi"; p.gender = "female";
  p.stats = { attack: 4.8, magic: 5, speed: 5.5 };
  p.hp = p.maxHp = 56; p.block = 0;
  p.skills = [
    { name: "女王威压", type: "passive" },
    { name: "女王榨取", type: "active", card: { name: "女王榨取", type: "tactic", preshiDrain: true, allyTarget: true, icon: "⚔️", text: "指定我方一名男性角色。" } },
  ];
  p.usedPreshiDrain = false;
  p.hand = [];
  for (let i = 0; i < 5; i++)
    p.hand.push({ name: "闪", type: "basic", suit: "♠", uid: "ph" + i });
  m.name = "罗卡尔"; m.ref = "lokar"; m.id = "lokar"; m.gender = "male";
  m.hp = m.maxHp = 62; m.block = 0;
  m.hand = [{ name: "闪", type: "basic", suit: "♥", uid: "mh0" },
            { name: "闪", type: "basic", suit: "♠", uid: "mh1" }];
  b.enemies.forEach(e => { e.hand = []; });
  b.allies.forEach(u => { if (u !== p && u !== m) u.hand = []; });
  const before = m.hp;
  const card = { name: "女王榨取", type: "tactic", preshiDrain: true,
    allyTarget: true, icon: "⚔️", text: "t", _skill: true };
  p.hand.push(card);
  window.BattleSystem.useCard(st, p, m, card);
  return { magic: p.stats.magic, hpLoss: before - m.hp,
    top: window.PreshiSkills.topHand(st, p) };
})()`;

// ── 台词：运行时确实调用了台词钩子 ─────────────────────
const lineHookTpl = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false;
  const p = b.allies[0], foe = b.enemies[0];
  p.name = "普雷希"; p.ref = "preshi"; p.id = "preshi"; p.gender = "female";
  p.stats = { attack: 4.8, magic: 5, speed: 5.5 };
  p.hp = p.maxHp = 56; p.block = 0;
  p.skills = [
    { name: "女王威压", type: "passive" },
    { name: "女王榨取", type: "active", card: { name: "女王榨取", type: "tactic", preshiDrain: true, allyTarget: true, icon: "⚔️", text: "指定我方一名男性角色。" } },
  ];
  p.usedPreshiDrain = false;
  p.hand = [];
  for (let i = 0; i < 5; i++)
    p.hand.push({ name: "闪", type: "basic", suit: "♠", uid: "ph" + i });
  b.enemies.forEach(e => { e.hand = []; e.hp = e.maxHp = 60; e.block = 0; });
  const names = [];
  const real = window.BattleLines.skill;
  window.BattleLines.skill = (s, u, n, t) => { names.push(n); return real(s, u, n, t); };
  // 造成伤害
  const kill = { name: "杀（普攻）", type: "slash", suit: "♠", ignoreResponse: true };
  window.BattleSystem.damage(st, foe, 10, "测试", p, kill);
  // 受到伤害
  b.animQueue = []; b.locked = false; p.hp = p.maxHp = 56;
  window.BattleSystem.damage(st, p, 10, "测试", foe, { ...kill });
  // 女王榨取
  const m = b.allies[1];
  m.gender = "male"; m.hp = m.maxHp = 62; m.block = 0;
  m.hand = [{ name: "闪", type: "basic", suit: "♥", uid: "mh0" }];
  b.animQueue = []; b.locked = false;
  const drain = { name: "女王榨取", type: "tactic", preshiDrain: true,
    allyTarget: true, icon: "⚔️", text: "t", _skill: true };
  p.hand.push(drain);
  window.BattleSystem.useCard(st, p, m, drain);
  window.BattleLines.skill = real;
  return { names };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);

  const d = await page.evaluate(dataTpl);
  T("① 生命值 56", d.maxHp === 56, d);
  T("① 杀意上限 1", d.bloodlust === 1, d);
  T("① 手牌上限 4", d.handLimit === 4, d);
  T("① 每回合摸牌 基础2+1 = 3", d.turnDraw === 3, d);
  T("① 初始摸牌 基础4+1 = 5", d.initialDraw === 5, d);
  T("① 登场台词已录入", d.intro === "休想抢走我的特殊加油机。", d);
  T("① 造成伤害台词已录入",
    d.outLine === "这就是魅魔女王力量，我不会把罗卡尔交给你们。", d);
  T("① 受到伤害台词已录入",
    d.inLine === "啊……我大意了……要不要使用那个？不过还不行！", d);
  T("① 女王榨取台词已录入",
    d.drainLine === "男人，在魅魔族眼里就是加油机罢了。", d);

  await startRegressionBattle(page);

  // ② 不可响应的实际效果：普雷希 5 张 > 敌方 1 张
  const sup = await page.evaluate(suppressRealTpl(5, 1));
  T("② 手牌多于目标：敌方持【闪】仍照常掉血", sup.foeHpLoss > 0, sup);
  T("② 手牌多于目标：敌方的【闪】未被消耗", sup.dodgeLeft === 1, sup);
  T("② 手牌多于目标：判据返回不可响应", sup.suppressed === true, sup);

  // 对照组：普雷希 1 张 ≤ 敌方 3 张
  const sup2 = await page.evaluate(suppressRealTpl(1, 3));
  T("② 对照组：手牌不多于目标时不置不可响应", sup2.suppressed === false, sup2);
  // 对照组必须真的响应掉——否则上面「掉血 / 闪未被消耗」两条就是恒绿，
  // 只能证明敌方没响应，证明不了压制生效。
  T("② 对照组：敌方确实用【闪】响应了（闪被消耗、未掉血）",
    sup2.dodgeLeft === 0 && sup2.foeHpLoss === 0, sup2);

  // ③ 并列最多也算全场最多
  const tie = await page.evaluate(tieTpl);
  T("③ 并列最多仍算全场最多", tie.top === true, tie);
  T("③ 并列最多时伤害翻倍（10 → 20）", tie.out === 20, tie);

  // ④ 女王榨取的目标限制
  const female = await page.evaluate(drainTargetTpl("female"));
  T("④ 对我方女性不生效", female.hpLoss === 0 && female.used === false, female);
  const enemy = await page.evaluate(drainTargetTpl("enemy"));
  T("④ 对敌方男性不生效", enemy.hpLoss === 0 && enemy.used === false, enemy);
  const self = await page.evaluate(drainTargetTpl("self"));
  T("④ 对自己不生效", self.hpLoss === 0 && self.used === false, self);

  // ⑤ 伤害 = 魔力值，且不被威压翻倍（此时手牌全场最多）
  const dm = await page.evaluate(drainMagicTpl);
  T("⑤ 女王榨取伤害 = 魔力值（5）", dm.hpLoss === dm.magic && dm.magic === 5, dm);
  T("⑤ 手牌全场最多的前提下仍未翻倍", dm.top === true && dm.hpLoss === 5, dm);

  // ⑥ 台词运行时确实触发
  const lh = await page.evaluate(lineHookTpl);
  T("⑥ 造成伤害时触发台词", lh.names.includes("女王威压造成伤害"), lh);
  T("⑥ 受到伤害时触发台词", lh.names.includes("女王威压受到伤害"), lh);
  T("⑥ 女王榨取时触发台词", lh.names.includes("女王榨取"), lh);

  const bad = relevantErrors(errors);
  T("页面无 JS 错误", bad.length === 0, bad.slice(0, 3));

  console.log(`\n通过 ${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})().catch(err => { console.error("FATAL", err); process.exit(1); });
