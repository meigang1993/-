// 武装直升机 · 实战回归
//   ⚔️ 战场扫射：出牌阶段，将2张同花色牌当做【机枪扫杀】使用，不消耗淫气
//   ⭐ 继续压制：锁定技，当你使用的【杀】牌被【闪】抵消时，你摸1张牌
//   ⭐ 螺旋桨（锁定技）：出牌阶段，当你摸牌时，自动随机对敌方一名角色视为使用一张虚拟【杀（普攻）】
//   导弹发射器（被动）：你使用的【杀】牌指定目标时，目标角色需要额外弃置1张【杀】牌才能响应【闪】
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const FOE = 0;
// 面板不存在时不让 page.click 等 30 秒炸掉脚本：超时视为点击失败，交由断言判红
const clickIfPresent = async (page, sel) => {
  try { await page.click(sel, { timeout: 5000 }); return true; }
  catch { return false; }
};
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
};

// 把敌方 0 号改造成武装直升机
const setupTpl = (opts) => `(() => {
  const st = window.state, b = st.battle;
  const o = ${JSON.stringify(opts || {})};
  b.animQueue = []; b.locked = false;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  // 清空我方手牌：【机枪扫杀】可被【闪】响应，留牌会让 AOE 伤害断言随机失败
  b.allies.forEach(a => { a.hp = 300; a.maxHp = 300; a.block = 0; a.intent = 5; a.hand = []; });
  const e = b.enemies[${FOE}];
  e.ai = "ruins_helicopter"; e.name = "武装直升机";
  e.hp = 210; e.maxHp = 210; e.block = 0;
  e.stats = { attack: 9, magic: 8, speed: 12 };
  e.handLimit = 5; e.ruinsSuppressDraws = 0;
  e.deck = [{ name: "闪", type: "response", suit: "♥" }, { name: "杀", type: "slash", suit: "♠" }];
  e.hand = o.hand || [
    { name: "杀", type: "slash", suit: "♠", scale: "attack" },
    { name: "闪", type: "response", suit: "♠" },
  ];
  e.hand.forEach(c => { delete c._pendingDraw; });
  b.enemies.forEach((u, i) => { if (i !== ${FOE}) { u.hp = 100; u.maxHp = 100; } });
  st.log = [];
  window.render();
  return { ok: true, allyCount: b.allies.length };
})()`;

// 战场扫射：AI 决策应优先返回该 move
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
    handBefore, handAfter: e.hand.length,
    discard: (b.discard || e.discard || []).map(c => c.name) };
})()`;

// 战场扫射端到端：真实打出，看是否对所有我方造成伤害
const playTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  b.activeUid = e.uid; b.phase = 4; b.locked = false; b.animQueue = [];
  const mv = window.RuinsEnemySkills.aiMove(st, e, b.enemies, b.allies, e.hand, () => true, {});
  if (!mv) return { err: "no move" };
  const before = b.allies.map(a => a.hp);
  const target = mv.target || b.allies[0];
  window.BattleSystem.useCard(st, e, target, mv.card);
  return { name: mv.card.name, before,
    after: b.allies.map(a => a.hp),
    dealt: b.allies.map((a, i) => before[i] - a.hp),
    logs: (st.log || []).slice(-6).map(String) };
})()`;

// 战场扫射：无「每回合限一次」——给 4 张同花色牌，应能连续发动 2 次
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

// 螺旋桨标签：290 起改为锁定类（⭐ + 锁定），满足条件自动生效，不再询问玩家。
const propTagTpl = `(() => {
  const R = window.RelicSystem;
  return { icon: R?.skillIcon?.("螺旋桨"), type: R?.typeName?.("螺旋桨"),
    hint: R?.useHint?.("螺旋桨") };
})()`;

// 回归护栏：普通单体【杀】不应被自动改成群体（历史实现在 beforeKillTargeted 里
// 就地改写 card.name / card.sweep，既免费获得 AOE，又把原牌永久改名污染牌库）
const singleKillTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  b.activeUid = e.uid; b.phase = 4; b.locked = false; b.animQueue = [];
  const kill = { name: "杀", type: "slash", suit: "♠", scale: "attack" };
  const before = b.allies.map(a => a.hp);
  window.RuinsEnemySkills.beforeKillTargeted(st, e, b.allies[0], kill);
  window.BattleSystem.useCard(st, e, b.allies[0], kill);
  return { name: kill.name, sweep: !!kill.sweep,
    dealt: b.allies.map((a, i) => before[i] - a.hp) };
})()`;

// 继续压制：杀被闪抵消后摸 1 张
const suppressTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  const before = e.hand.length;
  window.RuinsEliteSkills.afterDodged(st, e, b.allies[0],
    { name: "杀", type: "slash", suit: "♠" });
  return { before, after: e.hand.length,
    logs: (st.log || []).slice(-3).map(String) };
})()`;

// 螺旋桨：锁定技 → 我方佩戴在出牌阶段摸牌时自动触发，不弹面板、不锁定战斗
const propPromptTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  a.battleRelics = ["螺旋桨"];
  b.phase = 4; b.activeUid = a.uid; b.animQueue = []; b.locked = false;
  b.counterTrigger = null; b.counterTriggerQueue = null;
  b.enemies.forEach(u => { u.hp = 300; u.maxHp = 300; u.hand = []; });
  const before = b.enemies.map(u => u.hp);
  const drawFn = (unit, count) => {
    const got = [];
    for (let i = 0; i < count; i++) got.push({ name: "闪", type: "response", suit: "♥" });
    unit.hand = (unit.hand || []).concat(got);
    return got;
  };
  window.RuinsRelicEffects.afterDraw(st, a,
    [{ name: "闪", type: "response", suit: "♥" }], drawFn, {});
  window.render();
  return { before, dealt: b.enemies.map((u, i) => before[i] - u.hp),
    prompt: b.counterTrigger?.skill || null, locked: !!b.locked,
    logs: (st.log || []).slice(-3).map(String) };
})()`;

// 螺旋桨：敌方佩戴（AI）时没有玩家可点，应自动发动
const propEnemyTpl = `(() => {
  const st = window.state, b = st.battle;
  const e = b.enemies[${FOE}];
  e.battleRelics = ["螺旋桨"];
  b.phase = 4; b.activeUid = e.uid; b.animQueue = []; b.locked = false;
  b.counterTrigger = null; b.counterTriggerQueue = null;
  b.allies.forEach(a => { a.hp = 300; a.maxHp = 300; a.hand = []; });
  const before = b.allies.map(u => u.hp);
  const drawFn = (unit, count) => {
    const got = [];
    for (let i = 0; i < count; i++) got.push({ name: "闪", type: "response", suit: "♥" });
    unit.hand = (unit.hand || []).concat(got);
    return got;
  };
  window.RuinsRelicEffects.afterDraw(st, e,
    [{ name: "闪", type: "response", suit: "♥" }], drawFn, {});
  return { before, dealt: b.allies.map((u, i) => before[i] - u.hp),
    prompt: b.counterTrigger?.skill || null,
    logs: (st.log || []).slice(-4).map(String) };
})()`;

// 自动触发后采样：基线是模板里设的 300 血
const propDealtTpl = `(() => {
  const b = window.state.battle;
  return { dealt: b.enemies.map(u => 300 - u.hp),
    prompt: b.counterTrigger?.skill || null, locked: !!b.locked,
    logs: (window.state.log || []).slice(-4).map(String) };
})()`;

const propPanelTpl = `(() => {
  const el = document.querySelector(".counter-trigger-panel");
  return { exists: !!el, text: el?.innerText || "",
    hasUse: !!document.querySelector("[data-counter-trigger-use]"),
    hasSkip: !!document.querySelector("[data-counter-trigger-skip]") };
})()`;

// 290 前旧存档可能残留 skill="螺旋桨" 的 counterTrigger：通用面板的执行器仍须可用。
const propLegacyTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0];
  a.battleRelics = ["螺旋桨"];
  b.phase = 4; b.activeUid = a.uid; b.animQueue = []; b.locked = false;
  b.enemies.forEach(u => { u.hp = 300; u.maxHp = 300; u.hand = []; });
  const before = b.enemies.map(u => u.hp);
  const resolvers = window.BattleCounterTriggers;
  b.counterTrigger = { skill: "螺旋桨", unitUid: a.uid, sourceUid: a.uid,
    targetUid: b.enemies[0].uid, count: 1 };
  st.log = [];
  const resolver = typeof resolvers?.resolve === "function";
  if (resolver) resolvers.resolve(st, true, {});
  return { resolver, dealt: b.enemies.map((u, i) => before[i] - u.hp),
    prompt: b.counterTrigger?.skill || null,
    logs: (st.log || []).slice(-4).map(String) };
})()`;

// 导弹发射器：目标无额外杀牌时响应失败；有额外杀牌时被弃置
const missileTpl = (targetHand) => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], e = b.enemies[${FOE}];
  a.battleRelics = ["导弹发射器"];
  e.hand = ${JSON.stringify(targetHand)};
  e.hand.forEach(c => { delete c._pendingDraw; });
  const handBefore = e.hand.length;
  const resp = { name: "闪", type: "response", suit: "♥" };
  const allowed = window.RuinsRelicEffects.missileLauncherBlock(
    st, a, e, { name: "杀", type: "slash", suit: "♠" }, [resp], resp);
  return { allowed, handBefore, handAfter: e.hand.length,
    logs: (st.log || []).slice(-3).map(String) };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  // ===== 战场扫射：move 形态 =====
  await page.evaluate(setupTpl({}));
  const mv = await page.evaluate(moveTpl);
  console.log(`[战场扫射·move] name=${mv.name} type=${mv.type} sweep=${mv.sweep} ` +
    `allTargets=${JSON.stringify(mv.allTargets)} aoe=${mv.aoe} 手牌 ${mv.handBefore}→${mv.handAfter}`);
  T("战场扫射：AI 优先返回战场扫射", mv.has === true, mv);
  T("战场扫射：产物牌名为【机枪扫杀】", mv.name === "机枪扫杀", mv);
  T("战场扫射：产物是真正的杀牌（type=slash）", mv.type === "slash", mv);
  T("战场扫射：产物带全体目标（allTargets）", Array.isArray(mv.allTargets) && mv.allTargets.length >= 2, mv);
  T("战场扫射：产物绘制全体目标线（aoeLineShown）", mv.aoe === true, mv);
  T("战场扫射：消耗 2 张同花色手牌", mv.handBefore - mv.handAfter === 2, mv);
  T("战场扫射：不消耗淫气", mv.noIntent === true, mv);

  // ===== 战场扫射端到端 =====
  await page.evaluate(setupTpl({}));
  const play = await page.evaluate(playTpl);
  await page.waitForTimeout(1200);
  console.log(`[战场扫射·打出] name=${play.name} 伤害=${JSON.stringify(play.dealt)}`);
  console.log(`  日志: ${JSON.stringify((play.logs || []).slice(-3))}`);
  T("战场扫射：对所有我方角色造成伤害（真 AOE）",
    Array.isArray(play.dealt) && play.dealt.length >= 2 && play.dealt.every(d => d > 0), play);

  // ===== 战场扫射：无每回合限一次 =====
  await page.evaluate(setupTpl({}));
  const multi = await page.evaluate(multiTpl);
  console.log(`[战场扫射·多次] 第1次=${multi.first} 第2次=${multi.second} 第3次=${multi.third} ` +
    `手牌 ${multi.h0}→${multi.h1}→${multi.h2}`);
  T("战场扫射：不受每回合限一次约束（可连续发动 2 次）",
    multi.first === true && multi.second === true, multi);
  T("战场扫射：手牌不足 2 张同花色时停止（不会无限发动）",
    multi.third === false && multi.h2 === 0, multi);

  // ===== 普通单体杀不应被自动改成群体 =====
  await page.evaluate(setupTpl({ hand: [] }));
  const single = await page.evaluate(singleKillTpl);
  await page.waitForTimeout(1000);
  const hitCount = (single.dealt || []).filter(d => d > 0).length;
  console.log(`[单体杀回归] name=${single.name} sweep=${single.sweep} 受击人数=${hitCount}`);
  T("回归护栏：普通单体【杀】仍只打 1 人（不被自动改成群体）",
    single.sweep === false && single.name === "杀" && hitCount === 1, single);

  // ===== 继续压制 =====
  await page.evaluate(setupTpl({}));
  const sup = await page.evaluate(suppressTpl);
  console.log(`[继续压制] 手牌 ${sup.before}→${sup.after}`);
  console.log(`  日志: ${JSON.stringify(sup.logs)}`);
  T("继续压制：杀被闪抵消后摸 1 张牌", sup.after - sup.before === 1, sup);

  // ===== 螺旋桨：锁定技（标签 ⭐） =====
  await page.evaluate(setupTpl({}));
  const tag = await page.evaluate(propTagTpl);
  console.log(`[螺旋桨·标签] ${JSON.stringify(tag)}`);
  T("螺旋桨：标签为 ⭐ 锁定饰品（不再是 🔵 触发）",
    tag.icon === "⭐" && tag.type === "锁定", tag);
  T("螺旋桨：提示为「装备后生效」，不再提示玩家响应选择",
    !String(tag.hint || "").includes("响应选择"), tag);

  await page.evaluate(setupTpl({}));
  const prop = await page.evaluate(propPromptTpl);
  await page.waitForTimeout(1200);
  const auto = await page.evaluate(propDealtTpl);
  console.log(`[螺旋桨·我方自动] 立即=${JSON.stringify(prop.dealt)} 最终=${JSON.stringify(auto.dealt)} prompt=${prop.prompt} locked=${prop.locked}`);
  console.log(`  日志: ${JSON.stringify(prop.logs)}`);
  T("螺旋桨：锁定技自动触发，对敌方随机一名造成虚拟杀伤害",
    auto.dealt.some(d => d > 0), auto);
  T("螺旋桨：不弹触发面板、不锁定战斗",
    prop.prompt === null && prop.locked === false && auto.prompt === null && auto.locked === false,
    { prop, auto });
  const panel = await page.evaluate(propPanelTpl);
  console.log(`[螺旋桨·面板] ${JSON.stringify(panel)}`);
  T("螺旋桨：无「发动 / 跳过」入口（锁定技不可放弃）",
    !panel.exists && !panel.hasUse && !panel.hasSkip, panel);
  T("螺旋桨：日志写「触发」而非「可以发动」",
    prop.logs.some(x => String(x).includes("螺旋桨触发"))
    && !prop.logs.some(x => String(x).includes("可以发动螺旋桨")), prop.logs);

  // 旧存档兼容：290 前残留的「螺旋桨」触发面板仍可被消费，不会卡死或报「暂无执行器」
  await page.evaluate(setupTpl({}));
  const legacy = await page.evaluate(propLegacyTpl);
  await page.waitForTimeout(1200);
  console.log(`[螺旋桨·旧存档兼容] ${JSON.stringify(legacy)}`);
  T("螺旋桨：旧存档残留面板有可用执行器且能自动结算",
    legacy.resolver === true && legacy.dealt.some(d => d > 0), legacy);

  // ===== 螺旋桨：敌方佩戴同样自动发动（锁定技无阵营差异） =====
  await page.evaluate(setupTpl({}));
  const propE = await page.evaluate(propEnemyTpl);
  await page.waitForTimeout(1200);
  console.log(`[螺旋桨·敌方] 我方掉血=${JSON.stringify(propE.dealt)} prompt=${propE.prompt}`);
  console.log(`  日志: ${JSON.stringify(propE.logs)}`);
  T("螺旋桨：敌方佩戴时自动发动（不弹玩家面板）",
    propE.dealt.some(d => d > 0) && propE.prompt === null, propE);

  // ===== 导弹发射器：目标无额外杀牌 → 响应失败 =====
  await page.evaluate(setupTpl({}));
  const m1 = await page.evaluate(missileTpl([{ name: "闪", type: "response", suit: "♥" }]));
  console.log(`[导弹发射器·无额外杀] allowed=${m1.allowed}`);
  T("导弹发射器：目标无额外【杀】牌时响应失败", m1.allowed === false, m1);

  // ===== 导弹发射器：目标有额外杀牌 → 弃置后允许响应 =====
  await page.evaluate(setupTpl({}));
  const m2 = await page.evaluate(missileTpl([
    { name: "闪", type: "response", suit: "♥" },
    { name: "杀", type: "slash", suit: "♠" }]));
  console.log(`[导弹发射器·有额外杀] allowed=${m2.allowed} 手牌 ${m2.handBefore}→${m2.handAfter}`);
  T("导弹发射器：目标额外弃置 1 张【杀】后可响应",
    m2.allowed === true && m2.handBefore - m2.handAfter === 1, m2);

  await page.close();
  await browser.close();
  console.log(`\n页面错误: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})();
