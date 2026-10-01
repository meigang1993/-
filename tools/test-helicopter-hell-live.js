// 武装直升机 · 英雄级实战回归
//   与 test-helicopter-skills-live.js 的区别：
//   那里把敌人属性硬编码成普通级（9/8/12/210），这里走真实难度缩放路径
//   （DungeonEnemyGroups.fromIds + GameData.scaleEnemyStats），验证在英雄级
//   （生命245%/输出198%/速度158%，且精英与BOSS携带掉落饰品）下：
//     1. 缩放后的属性是否正确
//     2. 英雄级是否自动携带两个掉落饰品（螺旋桨 / 导弹发射器）
//     3. 三个技能与两个饰品在该难度下是否都能真正发动
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const FOE = 0;
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 用真实缩放路径生成英雄级直升机，替换敌方 0 号（保留 uid 以维持战斗结构）
const setupTpl = (opts) => `(() => {
  const st = window.state, b = st.battle;
  const o = ${JSON.stringify(opts || {})};
  const run = { missionId: "ruins_sand_city", difficultyId: "hell" };
  const made = window.DungeonEnemyGroups.fromIds(run, "elite", ["attack_helicopter"], st);
  const src = made?.[0];
  if (!src) return { err: "fromIds 未生成敌人" };
  b.animQueue = []; b.locked = false;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  b.counterTrigger = null; b.counterTriggerQueue = null;
  b.allies.forEach(a => { a.hp = 300; a.maxHp = 300; a.block = 0; a.intent = 5; a.hand = []; });
  b.enemies.forEach((u, i) => { if (i !== ${FOE}) { u.hp = 100; u.maxHp = 100; u.hand = []; } });
  const e = b.enemies[${FOE}];
  const uid = e.uid;
  Object.assign(e, src, { uid });
  // 伤害读的是 stats.attack 而非顶层 attack（battle-runtime-helpers.js:5）。
  // Object.assign 只覆盖顶层字段，若不按 battle-setup.js:32 的方式重建 stats，
  // stats.attack 会残留原战斗里该位置敌人的旧值（实测曾拿到 3）。
  e.stats = { attack: src.attack, magic: src.magic || 0, speed: src.speed,
    maxHp: src.hp, handLimit: src.handLimit || 5, drawPerTurn: src.drawPerTurn || 0,
    initialDraw: src.initialDraw || 0, bloodlust: src.bloodlust || 1 };
  e.block = 0;
  e.deck = [{ name: "闪", type: "response", suit: "♥" }, { name: "杀", type: "slash", suit: "♠" }];
  e.hand = o.hand || [
    { name: "杀", type: "slash", suit: "♠", scale: "attack" },
    { name: "闪", type: "response", suit: "♠" },
  ];
  e.hand.forEach(c => { delete c._pendingDraw; });
  st.log = [];
  window.render();
  // 摸牌字段是「加值」：实际每回合摸牌 = 2 + drawPerTurn，初始摸牌 = 4 + initialDraw
  // （battle-runtime-helpers.js:14-15）。此处同时取加值与折算后的实际值。
  const H = window.BattleRuntimeHelpers();
  return { ok: true, name: e.name, hp: e.hp, attack: e.attack, magic: e.magic,
    speed: e.speed, handLimit: e.handLimit, bloodlust: e.bloodlust,
    drawPerTurn: e.drawPerTurn, initialDraw: e.initialDraw,
    realTurnDraw: H.turnDrawCount(e), realInitialDraw: H.initialDrawCount(e),
    statsAttack: e.stats?.attack,
    relics: e.battleRelics || [], allyCount: b.allies.length };
})()`;

// 战场扫射：英雄级 AI 决策应优先返回该 move
const moveTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  b.activeUid = e.uid; b.phase = 4;
  const handBefore = e.hand.length;
  const mv = window.RuinsEnemySkills.aiMove(st, e, b.enemies, b.allies, e.hand,
    () => true, {});
  return { has: !!mv, name: mv?.card?.name, sweep: !!mv?.card?.sweep,
    allTargets: mv?.card?.allTargets || null, aoe: !!mv?.card?.aoeLineShown,
    type: mv?.card?.type || null, noIntent: !!mv?.card?.noIntentCost,
    handBefore, handAfter: e.hand.length };
})()`;

// 战场扫射端到端：真实打出，看 AOE 伤害是否等于英雄级攻击力
const playTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  b.activeUid = e.uid; b.phase = 4; b.locked = false; b.animQueue = [];
  const mv = window.RuinsEnemySkills.aiMove(st, e, b.enemies, b.allies, e.hand, () => true, {});
  if (!mv) return { err: "no move" };
  const before = b.allies.map(a => a.hp);
  const target = mv.target || b.allies[0];
  window.BattleSystem.useCard(st, e, target, mv.card);
  return { name: mv.card.name, attack: e.attack, before,
    after: b.allies.map(a => a.hp),
    dealt: b.allies.map((a, i) => before[i] - a.hp),
    logs: (st.log || []).slice(-6).map(String) };
})()`;

// 战场扫射：英雄级也不受限次
const multiTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  b.activeUid = e.uid; b.phase = 4;
  e.hand = [
    { name: "杀", type: "slash", suit: "♠", scale: "attack" },
    { name: "杀", type: "slash", suit: "♠", scale: "attack" },
    { name: "闪", type: "response", suit: "♠" },
    { name: "闪", type: "response", suit: "♠" },
  ];
  e.hand.forEach(c => { delete c._pendingDraw; });
  const h0 = e.hand.length;
  const m1 = window.RuinsEnemySkills.aiMove(st, e, b.enemies, b.allies, e.hand, () => true, {});
  const h1 = e.hand.length;
  const m2 = window.RuinsEnemySkills.aiMove(st, e, b.enemies, b.allies, e.hand, () => true, {});
  const h2 = e.hand.length;
  const m3 = window.RuinsEnemySkills.aiMove(st, e, b.enemies, b.allies, e.hand, () => true, {});
  return { first: !!m1, second: !!m2, third: !!m3, h0, h1, h2,
    name1: m1?.card?.name, name2: m2?.card?.name };
})()`;

// 继续压制：英雄级杀被闪抵消后摸 1 张
const suppressTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  const before = e.hand.length;
  window.RuinsEliteSkills.afterDodged(st, e, b.allies[0],
    { name: "杀", type: "slash", suit: "♠" });
  return { before, after: e.hand.length,
    logs: (st.log || []).slice(-3).map(String) };
})()`;

// 螺旋桨：英雄级敌人携带时自动发动（AI 侧无可点玩家），伤害应为英雄级攻击力
const propEnemyTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  b.phase = 4; b.activeUid = e.uid; b.animQueue = []; b.locked = false;
  b.counterTrigger = null; b.counterTriggerQueue = null;
  b.allies.forEach(a => { a.hp = 300; a.maxHp = 300; a.hand = []; a.block = 0; });
  const before = b.allies.map(u => u.hp);
  const drawFn = (unit, count) => {
    const got = [];
    for (let i = 0; i < count; i++) got.push({ name: "闪", type: "response", suit: "♥" });
    unit.hand = (unit.hand || []).concat(got);
    return got;
  };
  window.RuinsRelicEffects.afterDraw(st, e,
    [{ name: "闪", type: "response", suit: "♥" }], drawFn, {});
  return { before, attack: e.attack, prompt: b.counterTrigger?.skill || null,
    dealt: b.allies.map((u, i) => before[i] - u.hp),
    logs: (st.log || []).slice(-4).map(String) };
})()`;

// 导弹发射器：英雄级敌人携带时，我方无额外杀牌则响应失败
const missileTpl = (targetHand) => `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}], a = b.allies[0];
  // 不手动赋值：用英雄级自动携带的饰品（enemyRelics），才是在验证「难度携带」本身
  a.hand = ${JSON.stringify(targetHand)};
  a.hand.forEach(c => { delete c._pendingDraw; });
  const handBefore = a.hand.length;
  const resp = { name: "闪", type: "response", suit: "♥" };
  const allowed = window.RuinsRelicEffects.missileLauncherBlock(
    st, e, a, { name: "杀", type: "slash", suit: "♠" }, [resp], resp);
  return { allowed, handBefore, handAfter: a.hand.length,
    logs: (st.log || []).slice(-3).map(String) };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  // ===== 英雄级缩放属性 =====
  const s = await page.evaluate(setupTpl({}));
  if (s.err) { console.log(`❌ 生成失败: ${JSON.stringify(s)}`); process.exit(1); }
  console.log(`[英雄级属性] ${s.name} hp=${s.hp} 攻击=${s.attack} 魔力=${s.magic} ` +
    `速度=${s.speed} 手牌上限=${s.handLimit} 杀意=${s.bloodlust} ` +
    `每回合摸牌=${s.drawPerTurn} 初始摸牌=${s.initialDraw}`);
  console.log(`[英雄级饰品] ${JSON.stringify(s.relics)}`);
  T("英雄级：生命值 = ceil(240 × 2.45) = 588", s.hp === 588, s);
  T("英雄级：攻击力 = round(11 × 1.98) = 22", s.attack === 22, s);
  T("英雄级：魔力 = round(10 × 1.98) = 20", s.magic === 20, s);
  T("英雄级：速度 = round(14 × 1.58) = 22", s.speed === 22, s);
  T("英雄级：手牌上限不参与缩放，仍为 5", s.handLimit === 5, s);
  T("英雄级：杀意上限不参与缩放，仍为 1", s.bloodlust === 1, s);
  T("英雄级：stats.attack 已同步为 22（伤害实际读取的字段）", s.statsAttack === 22, s);
  T("英雄级：每回合摸牌加值不参与缩放，仍为 3", s.drawPerTurn === 3, s);
  T("英雄级：初始摸牌加值不参与缩放，仍为 2", s.initialDraw === 2, s);
  T("英雄级：实际每回合摸牌 = 2 + 3 = 5", s.realTurnDraw === 5, s);
  T("英雄级：实际初始摸牌 = 4 + 2 = 6", s.realInitialDraw === 6, s);
  T("英雄级：自动携带掉落饰品【螺旋桨】", (s.relics || []).includes("螺旋桨"), s);
  T("英雄级：自动携带掉落饰品【导弹发射器】", (s.relics || []).includes("导弹发射器"), s);

  // ===== 战场扫射：move 形态 =====
  await page.evaluate(setupTpl({}));
  const mv = await page.evaluate(moveTpl);
  console.log(`[战场扫射·move] name=${mv.name} type=${mv.type} sweep=${mv.sweep} ` +
    `allTargets=${JSON.stringify(mv.allTargets)} aoe=${mv.aoe} 手牌 ${mv.handBefore}→${mv.handAfter}`);
  T("战场扫射（英雄级）：AI 优先返回战场扫射", mv.has === true, mv);
  T("战场扫射（英雄级）：产物牌名为【机枪扫杀】", mv.name === "机枪扫杀", mv);
  T("战场扫射（英雄级）：产物是真正的杀牌（type=slash）", mv.type === "slash", mv);
  T("战场扫射（英雄级）：带全体目标与 AOE 线",
    Array.isArray(mv.allTargets) && mv.allTargets.length >= 2 && mv.aoe === true, mv);
  T("战场扫射（英雄级）：消耗 2 张同花色手牌", mv.handBefore - mv.handAfter === 2, mv);
  T("战场扫射（英雄级）：不消耗杀意", mv.noIntent === true, mv);

  // ===== 战场扫射端到端：伤害应等于英雄级攻击力 22 =====
  await page.evaluate(setupTpl({}));
  const play = await page.evaluate(playTpl);
  await page.waitForTimeout(1200);
  console.log(`[战场扫射·打出] name=${play.name} 攻击力=${play.attack} 伤害=${JSON.stringify(play.dealt)}`);
  console.log(`  日志: ${JSON.stringify((play.logs || []).slice(-3))}`);
  T("战场扫射（英雄级）：对所有我方角色造成伤害",
    Array.isArray(play.dealt) && play.dealt.length >= 2 && play.dealt.every(d => d > 0), play);
  // 不能写死 14：断言应验证「伤害随难度缩放」，否则难度写错时 all() 对空结果恒真
  const dealtNonZero = (play.dealt || []).filter(d => d > 0);
  T("战场扫射（英雄级）：伤害量等于该难度下的攻击力（随缩放变化）",
    dealtNonZero.length === (play.dealt || []).length
    && dealtNonZero.every(d => d === play.attack), play);
  T("战场扫射（英雄级）：英雄级攻击力为 22（非普通级 11）", play.attack === 22, play);

  // ===== 战场扫射：英雄级也不受限次 =====
  await page.evaluate(setupTpl({}));
  const multi = await page.evaluate(multiTpl);
  console.log(`[战场扫射·多次] 第1次=${multi.first} 第2次=${multi.second} 第3次=${multi.third} ` +
    `手牌 ${multi.h0}→${multi.h1}→${multi.h2}`);
  T("战场扫射（英雄级）：不受每回合限一次约束", multi.first && multi.second, multi);
  T("战场扫射（英雄级）：手牌不足时停止", multi.third === false && multi.h2 === 0, multi);

  // ===== 继续压制 =====
  await page.evaluate(setupTpl({}));
  const sup = await page.evaluate(suppressTpl);
  console.log(`[继续压制] 手牌 ${sup.before}→${sup.after}`);
  console.log(`  日志: ${JSON.stringify(sup.logs)}`);
  T("继续压制（英雄级）：杀被闪抵消后摸 1 张牌", sup.after - sup.before === 1, sup);

  // ===== 螺旋桨：英雄级敌人携带 → 自动发动 =====
  await page.evaluate(setupTpl({}));
  const propE = await page.evaluate(propEnemyTpl);
  await page.waitForTimeout(1200);
  console.log(`[螺旋桨·英雄级敌方] 攻击力=${propE.attack} 我方掉血=${JSON.stringify(propE.dealt)} prompt=${propE.prompt}`);
  console.log(`  日志: ${JSON.stringify(propE.logs)}`);
  T("螺旋桨（英雄级敌方）：自动发动，不弹玩家面板", propE.prompt === null, propE);
  T("螺旋桨（英雄级敌方）：对随机一名造成虚拟杀伤害",
    (propE.dealt || []).some(d => d > 0), propE);
  // 同上：空结果的 every() 恒真，必须先断言「确实有人受伤」
  const propNonZero = (propE.dealt || []).filter(d => d > 0);
  T("螺旋桨（英雄级敌方）：伤害等于该难度下的攻击力（随缩放变化）",
    propNonZero.length === 1 && propNonZero.every(d => d === propE.attack), propE);
  T("螺旋桨（英雄级敌方）：英雄级攻击力为 22（非普通级 11）", propE.attack === 22, propE);

  // ===== 导弹发射器：英雄级敌人携带 =====
  await page.evaluate(setupTpl({}));
  const m1 = await page.evaluate(missileTpl([{ name: "闪", type: "response", suit: "♥" }]));
  console.log(`[导弹发射器·英雄级无额外杀] allowed=${m1.allowed}`);
  console.log(`  日志: ${JSON.stringify(m1.logs)}`);
  T("导弹发射器（英雄级）：目标无额外【杀】牌时响应失败", m1.allowed === false, m1);

  await page.evaluate(setupTpl({}));
  const m2 = await page.evaluate(missileTpl([
    { name: "闪", type: "response", suit: "♥" },
    { name: "杀", type: "slash", suit: "♠" }]));
  console.log(`[导弹发射器·英雄级有额外杀] allowed=${m2.allowed} 手牌 ${m2.handBefore}→${m2.handAfter}`);
  T("导弹发射器（英雄级）：目标额外弃置 1 张【杀】后可响应",
    m2.allowed === true && m2.handBefore - m2.handAfter === 1, m2);

  await page.close();
  await browser.close();
  console.log(`\n页面错误: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})();
