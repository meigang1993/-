// 专项实战：地雷猜拳小游戏（真实浏览器 + 真实出牌流程）
// 验证 5 种结果：holder赢(拆除) / source赢(掉血+消耗) / 平局(重猜,地雷保留) / skip / AI侧自动出手
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 埋雷：让玩家 ally 手牌区出现一张地雷（landmineSourceUid = 敌人贵族军士兵）
const injectTpl = `(() => {
  const st = window.state, b = st.battle;
  const holder = b.allies[0];
  const src = b.enemies[0];
  src.stats = src.stats || {};
  src.stats.attack = 11;
  // 构造地雷状态牌放进持有者手牌
  const mine = { name: "地雷", type: "status", suit: "♠",
    landmine: true, landmineSourceUid: src.uid, landmineAttack: 11 };
  holder.hand = [mine];
  holder.hp = 80;
  window.__log = [];
  const origLog = window.BattleLog?.push;
  if (window.BattleLog && origLog) {
    window.BattleLog.push = function (...a) { window.__log.push(String(a[0] ?? "")); return origLog.apply(this, a); };
  }
  window.__state = st;
  window.__holder = holder;
  window.__src = src;
  window.render();
  return { holder: holder.name, src: src.name, hp: holder.hp,
    hasMine: !!(holder.hand||[]).some(c => c.landmine) };
})()`;

// 点击手牌区地雷牌 → landmineRps.open（点击入口调用的函数）→ 应弹窗
const triggerPromptTpl = `(() => {
  const st = window.state, b = st.battle;
  const holder = b.allies[0];
  const ok = window.RuinsEnemySkills?.landmineRps?.open?.(st, holder);
  window.render();
  const p = b.landmineRpsPrompt;
  return { prompt: !!p, locked: !!b.locked, amount: p?.amount ?? null, openOk: ok };
})()`;

// 摆到玩家出牌阶段：active = 持有者，phase = 4
const setPlayPhaseTpl = `(() => {
  const st = window.state, b = st.battle;
  const holder = b.allies[0];
  b.activeUid = holder.uid;
  b.phase = 4;
  b.locked = false;
  window.render();
  const hand = document.querySelector(".active-hand");
  return { active: String(b.activeUid), owner: String(hand?.dataset?.handOwner || ""),
    cards: document.querySelectorAll(".active-hand [data-card-index]").length };
})()`;

// 出牌阶段开始：应只提示、不自动弹窗
const playPhaseStartTpl = `(() => {
  const st = window.state, b = st.battle;
  const holder = b.allies[0];
  window.__log = [];
  if (window.BattleLog?.add && !window.__logHooked) {
    const origAdd = window.BattleLog.add.bind(window.BattleLog);
    window.BattleLog.add = function (s, text) { window.__log.push(String(text ?? "")); return origAdd(s, text); };
    window.__logHooked = true;
  }
  window.RuinsEnemySkills?.landmineRps?.playPhaseStart?.(st, holder);
  window.render();
  return { prompt: !!b.landmineRpsPrompt, locked: !!b.locked,
    log: window.__log.slice(-3) };
})()`;

const promptStateTpl = `(() => {
  const b = window.state.battle;
  const p = b.landmineRpsPrompt;
  return { prompt: !!p, locked: !!b.locked, amount: p?.amount ?? null };
})()`;

// 玩家出某手势（可 stub 随机让 source 出指定手势，以覆盖 3 种结果）
const choiceTpl = targetSourceChoice => `(() => {
  const st = window.state, b = st.battle;
  const RPS = ["石头","剪刀","布"];
  const want = ${JSON.stringify(targetSourceChoice)};
  // stub 随机源让 source 出指定手势，用完必须还原（否则污染后续所有随机）
  const orig = window.GameRandom.value.bind(window.GameRandom);
  if (want) window.GameRandom.value = function (s) { return RPS.indexOf(want) / 3 + 0.001; };
  // 玩家手势：固定用 "石头"
  const ok = window.RuinsEnemySkills?.landmineRps?.resolveChoice?.(st, "石头");
  window.GameRandom.value = orig;
  window.render();
  const r = b.landmineRpsPrompt?.result;
  return { resolveOk: ok, outcome: r?.outcome ?? null,
    holderChoice: r?.holderChoice ?? null, sourceChoice: r?.sourceChoice ?? null };
})()`;

const confirmTpl = `(() => {
  const st = window.state, b = st.battle;
  const holder = b.allies[0];
  const hpBefore = holder.hp;
  const ok = window.RuinsEnemySkills?.landmineRps?.confirm?.(st);
  window.render();
  const hpAfter = holder.hp;
  const stillHasMine = (holder.hand||[]).some(c => c.landmine);
  return { confirmOk: ok, hpBefore, hpAfter, lost: hpBefore - hpAfter,
    stillHasMine, promptGone: !b.landmineRpsPrompt,
    tied: !!(window.__lastTied) };
})()`;

// 检查平局后 prompt.tied 状态
const tieStateTpl = `(() => {
  const b = window.state.battle;
  const p = b.landmineRpsPrompt;
  const holder = b.allies[0];
  return { tied: !!p?.tied, resultNull: !p?.result,
    stillHasMine: (holder.hand||[]).some(c => c.landmine) };
})()`;

const skipTpl = `(() => {
  const st = window.state, b = st.battle;
  const holder = b.allies[0];
  const ok = window.RuinsEnemySkills?.landmineRps?.skip?.(st);
  window.render();
  return { skipOk: ok, locked: !!b.locked,
    stillHasMine: (holder.hand||[]).some(c => c.landmine) };
})()`;

// AI 持有地雷时自动发起猜拳
const aiTpl = `(() => {
  const st = window.state, b = st.battle;
  const holder = b.enemies[0];
  const src = b.allies[0];
  src.stats = src.stats || {}; src.stats.attack = 11;
  const mine = { name: "地雷", type: "status", suit: "♠",
    landmine: true, landmineSourceUid: src.uid, landmineAttack: 11 };
  holder.hand = [mine]; holder.hp = 80;
  // aiMove 的 isRuins 守卫要求 ai 以 ruins_ 开头
  holder.ai = "ruins_soldier";
  holder.usedRuinsLandmineRps = false;
  // 让更高优先级的技能先落空，才能走到 landmineRpsMove 分支
  holder.usedRuinsLandmine = true;
  holder.usedRuinsSnipe = true;
  holder.usedRuinsTankShell = true;
  window.__log = [];
  // 战报走 BattleLog.add（不是 push）
  if (window.BattleLog?.add && !window.__logHooked) {
    const origAdd = window.BattleLog.add.bind(window.BattleLog);
    window.BattleLog.add = function (s, text) { window.__log.push(String(text ?? "")); return origAdd(s, text); };
    window.__logHooked = true;
  }
  const hpBefore = holder.hp;
  // 走真实 AI 决策入口（aiMove 内部按优先级调用 landmineRpsMove → useSkillCard）
  const move = window.RuinsEnemySkills?.aiMove?.(st, holder, [], [], holder.hand, () => true, {});
  let ok = false;
  if (move?.card) ok = !!window.RuinsEnemySkills?.useSkillCard?.(st, holder, move.target, move.card);
  window.render();
  return { moveName: move?.card?.name || null, useOk: ok, hpBefore, hpAfter: holder.hp,
    lost: hpBefore - holder.hp, handLen: holder.hand.length,
    usedFlag: holder.usedRuinsLandmineRps,
    stillHasMine: (holder.hand||[]).some(c => c.landmine),
    log: window.__log.slice(-6) };
})()`;

let pass = 0, fail = 0;
const check = (name, cond, extra) => {
  if (cond) { pass += 1; console.log(`✅ ${name}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? "  " + JSON.stringify(extra) : ""}`); }
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  const run = tpl => page.evaluate(tpl);

  // --- 1. 埋雷 ---
  let r = await run(injectTpl);
  check("埋雷：持有者手牌区生成地雷状态牌", r.hasMine === true, r);

  // --- 2. 出牌阶段开始 → 只提示，不自动弹窗 ---
  r = await run(playPhaseStartTpl);
  check("出牌阶段开始不自动弹窗（改为提示）", r.prompt === false && r.locked === false, r);
  check("出牌阶段提示可点击地雷", (r.log || []).some(t => /地雷.*猜拳/.test(t)), r.log);

  // --- 2b. 真实 DOM 点击地雷牌 → 弹窗 ---
  await run(injectTpl);
  const setup = await run(setPlayPhaseTpl);
  check("手牌区渲染出地雷牌且归属当前角色", setup.cards >= 1 && setup.owner === setup.active, setup);
  await page.click('.active-hand [data-card-index="0"]');
  await page.waitForTimeout(400);
  r = await run(promptStateTpl);
  check("真实点击地雷牌弹出猜拳窗口", r.prompt === true && r.locked === true, r);
  check("弹窗显示伤害数值=攻击力11", r.amount === 11, r);
  await run(skipTpl);

  // --- 2c. 点击入口（open）弹窗 ---
  r = await run(triggerPromptTpl);
  check("点击地雷牌弹出猜拳窗口", r.prompt === true && r.locked === true && r.openOk === true, r);

  // --- 3. 平局 → 重猜，地雷保留 ---
  // 玩家出石头，source 也出石头 → 平局
  r = await run(choiceTpl("石头"));
  check("平局判定 outcome=tie", r.outcome === "tie", r);
  r = await run(confirmTpl);
  check("平局不掉血", r.lost === 0, r);
  r = await run(tieStateTpl);
  check("平局后地雷保留（可重猜）", r.stillHasMine === true && r.tied === true, r);

  // --- 4. 持有者赢 → 拆除，不掉血 ---
  // 玩家出石头，source 出剪刀 → 石头砸剪刀，持有者赢
  r = await run(choiceTpl("剪刀"));
  check("持有者赢 outcome=holder", r.outcome === "holder", r);
  r = await run(confirmTpl);
  check("持有者赢：不掉血", r.lost === 0, r);
  check("持有者赢：地雷拆除（消耗）", r.stillHasMine === false, r);

  // --- 5. source 赢 → 掉血 + 消耗 ---
  await run(injectTpl);
  await run(triggerPromptTpl);
  // 玩家出石头，source 出布 → 布包石头，source 赢
  r = await run(choiceTpl("布"));
  check("来源赢 outcome=source", r.outcome === "source", r);
  r = await run(confirmTpl);
  check("来源赢：受到等同于攻击力的伤害(11)", r.lost === 11, r);
  check("来源赢：地雷消耗", r.stillHasMine === false, r);

  // --- 6. skip ---
  await run(injectTpl);
  await run(triggerPromptTpl);
  r = await run(skipTpl);
  check("暂不猜拳：解除锁定", r.locked === false, r);
  check("暂不猜拳：地雷保留", r.stillHasMine === true, r);

  // --- 7. AI 持有地雷自动发起 ---
  r = await run(aiTpl);
  const aiResolved = r.lost === 11 || r.lost === 0;
  check("AI 持有地雷会主动发起猜拳", r.useOk === true && aiResolved, r);
  check("AI 猜拳后地雷被处理（消耗/拆除）", r.stillHasMine === false, r);
  check("AI 猜拳有战报输出", Array.isArray(r.log) && r.log.length > 0, r.log);

  // --- 8. 回归：点击普通牌不误触发猜拳 ---
  await run(`(() => {
    const b = window.state.battle, h = b.allies[0];
    h.hand = [{ name: "杀（普攻）", type: "slash", power: 0, scale: "attack", suit: "♠" }];
    b.activeUid = h.uid; b.phase = 4; b.locked = false;
    b.landmineRpsPrompt = null; b.selectedCardIndex = null;
    window.render();
    return true;
  })()`);
  await page.click('.active-hand [data-card-index="0"]');
  await page.waitForTimeout(400);
  r = await run(promptStateTpl);
  check("回归：点击普通【杀】牌不弹出猜拳窗口", r.prompt === false, r);

  check("页面无 JS 错误", errors.length === 0, errors.slice(0, 3));

  await browser.close();
  console.log(`\n汇总：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(2); });
