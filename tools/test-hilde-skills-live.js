// 内英组杀手希尔德 · 英雄级实战回归
//   ⭐ 暗幕隐身：有黑色牌时不会成为单体【杀】牌的目标（此前实现成了"不可响应"）
//   🔵 影舞步：准备阶段连续判定，黑色收入手中、红色停止
//   🔵 潜影背刺：结束阶段，有黑色牌时指定敌方一名角色，造成等同攻击力的物理伤害
//   🔵 影舞步：连续判定不再限张数（原实现硬编码上限 6 张）
//   冰心双刺剑：摸到的实体单体【杀】转换为不消耗杀意的【刺杀】
//   刺客胶衣：出牌阶段限一次，黑色牌当【刺杀】使用且不消耗杀意
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

// 把敌方 0 号改造成希尔德；foeHand 为她的手牌
const setupTpl = (foeHand, allyRelics, allyHand) => `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], e = b.enemies[${FOE}];
  b.activeUid = a.uid; b.phase = 4; b.locked = false; b.animQueue = [];
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  a.intent = 5; a.hp = 200; a.maxHp = 200;
  a.battleRelics = ${JSON.stringify(allyRelics || [])};
  a.hand = ${JSON.stringify(allyHand || [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }])};
  a.hand.forEach(c => { delete c._pendingDraw; });
  e.ai = "ruins_hilde"; e.name = "内英组杀手希尔德";
  e.hp = 200; e.maxHp = 230; e.stats = { attack: 11, magic: 10, speed: 16 };
  // 每回合一次以 battle.turn 为键，各用例共用同一回合，须逐例清零
  e.ruinsBackstabTurn = -1;
  e.hand = ${JSON.stringify(foeHand || [])};
  e.hand.forEach(c => { delete c._pendingDraw; });
  st.log = [];
  window.render();
  return { ok: true };
})()`;

// 我方选中手牌 0 后尝试指定敌方 0 号
// 先选中手牌再问 UI：未选牌时 targetAllowed 恒为 falsy，无法区分是不是隐身挡的
const aimTpl = `(() => {
  const st = window.state, b = st.battle;
  const uid = b.enemies[${FOE}].uid;
  const sel = window.BattleSystem.selectCard(st, 0);
  const picked = b.allies[0].hand[0];
  const uiAllowed = window.GameUIBattleTargeting?.targetAllowed?.(
    b.enemies[${FOE}], b, b.allies[0], picked) === true;
  const ok = window.BattleSystem.chooseTarget(st, uid);
  return { sel, ok, uiAllowed, picked: picked?.name };
})()`;

const peekTpl = `(() => {
  const st = window.state, b = st.battle;
  const a = b.allies[0], e = b.enemies[${FOE}];
  return {
    foeHp: e.hp, allyHp: a.hp, allyIntent: a.intent,
    foeHand: (e.hand || []).filter(c => !c._pendingDraw).map(c => c.suit + c.name),
    allyHand: (a.hand || []).filter(c => !c._pendingDraw)
      .map(c => c.name + (c.noIntentCost ? "[免杀意]" : "")),
    logs: (st.log || []).slice(0, 40).map(String),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", e => errors.push(String(e)));
  await openGame(page);
  await startRegressionBattle(page);

  // ===== 暗幕隐身 ①：有黑色牌 → 单体杀不可指定 =====
  await page.evaluate(setupTpl([{ name: "杀", type: "slash", suit: "♠", scale: "attack" }]));
  const hidden = await page.evaluate(aimTpl);
  console.log(`[暗幕隐身·黑] chooseTarget=${hidden.ok} UI可选=${hidden.uiAllowed}`);
  T("暗幕隐身：有黑色牌时单体【杀】不能指定她",
    hidden.ok === false, hidden);
  T("暗幕隐身：UI 层同步置灰（不出现点了没反应）",
    hidden.uiAllowed === false, hidden);

  // ===== 暗幕隐身 ②：无黑色牌（红色）→ 可以指定并造成伤害 =====
  await page.evaluate(setupTpl([{ name: "杀", type: "slash", suit: "♥", scale: "attack" }]));
  const shown = await page.evaluate(aimTpl);
  await page.waitForTimeout(900);
  const afterHit = await page.evaluate(peekTpl);
  console.log(`[暗幕隐身·红] chooseTarget=${shown.ok} 敌掉血=${200 - afterHit.foeHp}`);
  T("暗幕隐身：无黑色牌时可被单体【杀】指定",
    shown.ok === true && shown.uiAllowed === true, shown);

  // ===== 暗幕隐身 ③：群体【杀】不受隐身影响 =====
  const sweepSetup = setupTpl([{ name: "杀", type: "slash", suit: "♠", scale: "attack" }],
    [], [{ name: "机枪扫杀", type: "slash", suit: "♠", scale: "attack", sweep: true }]);
  await page.evaluate(sweepSetup);
  const sweepAim = await page.evaluate(aimTpl);
  console.log(`[暗幕隐身·群体杀] chooseTarget=${sweepAim.ok}`);
  T("暗幕隐身：只挡单体【杀】，群体【杀】仍可指定",
    sweepAim.ok === true, sweepAim);

  // ===== 影舞步 ①：判定黑色 → 获得该牌 =====
  await page.evaluate(setupTpl([]));
  const danceBlack = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const e = b.enemies[${FOE}];
    e.deck = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }];
    e.discard = []; e.hand = [];
    window.RuinsEliteSkills.prepare(st, e);
    return { hand: e.hand.map(c => c.suit + c.name + (c.noIntentCost ? "[免杀意]" : "")),
             logs: (st.log || []).slice(0, 6).map(String) };
  })()`);
  console.log(`[影舞步·黑] 手牌 ${JSON.stringify(danceBlack.hand)}`);
  T("影舞步：判定黑色牌时获得该牌",
    danceBlack.hand.length === 1 && danceBlack.hand[0].includes("♠"), danceBlack);

  // ===== 影舞步 ②：判定红色 → 停止，不获得 =====
  const danceRed = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const e = b.enemies[${FOE}];
    e.deck = [{ name: "杀", type: "slash", suit: "♥", scale: "attack" }];
    e.discard = []; e.hand = [];
    window.RuinsEliteSkills.prepare(st, e);
    return { hand: e.hand.map(c => c.suit + c.name),
             logs: (st.log || []).slice(0, 6).map(String) };
  })()`);
  console.log(`[影舞步·红] 手牌 ${JSON.stringify(danceRed.hand)} 日志 ${JSON.stringify(danceRed.logs.slice(0,2))}`);
  T("影舞步：判定红色牌时停止且不获得",
    danceRed.hand.length === 0, danceRed);

  // ===== 潜影背刺（结束阶段）：有黑色牌时对最弱目标造成攻击力伤害 =====
  await page.evaluate(setupTpl([{ name: "杀", type: "slash", suit: "♠", scale: "attack" }]));
  const stab = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const e = b.enemies[${FOE}];
    // 结束阶段：走 EnemySkills.endTurn（真实结束阶段入口），damage 透传下来
    const before = b.allies.map(u => u.hp);
    window.EnemySkills.endTurn(st, e, null, window.BattleSystem.damage);
    const after = b.allies.map(u => u.hp);
    return { before, after, logs: (st.log || []).slice(0, 8).map(String) };
  })()`);
  console.log(`[潜影背刺·结束阶段] 我方 ${JSON.stringify(stab.before)}→${JSON.stringify(stab.after)}`);
  const stabLoss = stab.before.reduce((s2, v, i) => s2 + (v - stab.after[i]), 0);
  T("潜影背刺：结束阶段发动，造成等同攻击力（11）的伤害",
    stabLoss === 11 && (stab.logs || []).some(t => /潜影背刺/.test(t)), stab);

  // ===== 潜影背刺：无黑色牌时不发动 =====
  await page.evaluate(setupTpl([{ name: "杀", type: "slash", suit: "♥", scale: "attack" }]));
  const stabNone = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const e = b.enemies[${FOE}];
    const before = b.allies.map(u => u.hp);
    window.EnemySkills.endTurn(st, e, null, window.BattleSystem.damage);
    const after = b.allies.map(u => u.hp);
    return { before, after, logs: (st.log || []).slice(0, 8).map(String) };
  })()`);
  console.log(`[潜影背刺·无黑牌] 我方 ${JSON.stringify(stabNone.after)}`);
  T("潜影背刺：手里没有黑色牌时不发动",
    stabNone.before.join() === stabNone.after.join(), stabNone);

  // ===== 潜影背刺：结束阶段每回合只发动一次 =====
  await page.evaluate(setupTpl([
    { name: "杀", type: "slash", suit: "♠", scale: "attack" },
    { name: "杀", type: "slash", suit: "♣", scale: "attack" }]));
  const stabOnce = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const e = b.enemies[${FOE}];
    window.EnemySkills.endTurn(st, e, null, window.BattleSystem.damage);
    window.EnemySkills.endTurn(st, e, null, window.BattleSystem.damage);
    return { logs: (st.log || []).filter(t => /发动潜影背刺/.test(t)).map(String) };
  })()`);
  console.log(`[潜影背刺·限次] 发动次数=${stabOnce.logs.length} ${JSON.stringify(stabOnce.logs)}`);
  T("潜影背刺：同一回合内重复进入结束阶段也只发动一次",
    stabOnce.logs.length === 1, stabOnce);

  // ===== 影舞步：连续判定不再限张数 =====
  await page.evaluate(setupTpl([]));
  const danceMany = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const e = b.enemies[${FOE}];
    const blacks = n => Array.from({ length: n },
      () => ({ name: "杀", type: "slash", suit: "♠", scale: "attack" }));
    // 牌堆全黑 9 张 + 1 张红色收尾：旧实现上限 6，新实现应拿满 9 张
    // deck.pop() 从末尾取，故红色收尾牌要放在数组开头
    e.deck = [{ name: "杀", type: "slash", suit: "♥", scale: "attack" }, ...blacks(9)];
    e.discard = []; e.hand = [];
    window.RuinsEliteSkills.prepare(st, e);
    return { hand: e.hand.length, deck: e.deck.length, discard: e.discard.length };
  })()`);
  console.log(`[影舞步·多张] 获得=${danceMany.hand} 牌堆剩=${danceMany.deck} 弃牌=${danceMany.discard}`);
  T("影舞步：连续判定不再限 6 张（9 张黑牌全拿）",
    danceMany.hand === 9, danceMany);
  T("影舞步：判定过的牌最终都进了弃牌堆",
    danceMany.discard === 10, danceMany);

  // ===== 影舞步：全黑牌库不会死循环 =====
  await page.evaluate(setupTpl([]));
  const danceLoop = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const e = b.enemies[${FOE}];
    e.deck = Array.from({ length: 12 },
      () => ({ name: "杀", type: "slash", suit: "♣", scale: "attack" }));
    e.discard = []; e.hand = [];
    const t0 = Date.now();
    window.RuinsEliteSkills.prepare(st, e);
    return { hand: e.hand.length, ms: Date.now() - t0 };
  })()`);
  console.log(`[影舞步·全黑] 获得=${danceLoop.hand} 耗时=${danceLoop.ms}ms`);
  T("影舞步：全黑牌库能正常终止且不重复判同一张",
    danceLoop.hand === 12 && danceLoop.ms < 3000, danceLoop);

  // ===== 冰心双刺剑：摸到的实体单体杀转为不消耗杀意的刺杀 =====
  await page.evaluate(setupTpl([], ["冰心双刺剑"], []));
  const ice = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0];
    a.deck = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" }];
    a.discard = []; a.hand = [];
    const drawn = window.BattleSystem.draw(a, 1, b) || [];
    return { drawn: drawn.map(c => c.name),
             hand: a.hand.map(c => c.name + (c.noIntentCost ? "[免杀意]" : "")),
             logs: (st.log || []).slice(0, 8).map(String) };
  })()`);
  console.log(`[冰心双刺剑] 手牌 ${JSON.stringify(ice.hand)} 日志 ${JSON.stringify(ice.logs.slice(0,2))}`);
  T("冰心双刺剑：摸到的实体单体【杀】转换为【刺杀】且不消耗杀意",
    ice.hand.some(n => n.startsWith("刺杀") && n.includes("[免杀意]")), ice);

  // ===== 冰心双刺剑：打出转换后的刺杀不消耗杀意 =====
  const icePlay = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0], e = b.enemies[${FOE}];
    const before = a.intent;
    b.activeUid = a.uid; b.phase = 4; b.locked = false;
    const idx = a.hand.findIndex(c => c.name === "刺杀");
    const ok = window.BattleSystem.playActiveCard(st, idx, e.uid);
    return { ok, before, after: a.intent, foeHp: e.hp };
  })()`);
  await page.waitForTimeout(900);
  console.log(`[冰心双刺剑] 杀意 ${icePlay.before}→${icePlay.after}，敌 hp=${icePlay.foeHp}`);
  T("冰心双刺剑：转换后的【刺杀】打出不消耗杀意",
    icePlay.before === icePlay.after, icePlay);

  // ===== 刺客胶衣：黑色牌当【刺杀】使用 =====
  await page.evaluate(setupTpl([], ["刺客胶衣"],
    [{ name: "杀", type: "slash", suit: "♣", scale: "attack" }]));
  const latex = await page.evaluate(`(() => {
    const st = window.state, b = st.battle;
    const a = b.allies[0], e = b.enemies[${FOE}];
    const before = a.intent;
    const skills = window.UICommon.skillsOf(a) || [];
    const idx = skills.findIndex(s => s.name === "刺客胶衣");
    if (idx < 0) return { noSkill: true, names: skills.map(s => s.name) };
    const picked = window.BattleSystem.selectSkill(st, idx);
    // 该饰品需先选一张黑色手牌作为代价，再选目标（needsHandChoice）
    const cost = window.BattleSystem.selectCard(st, 0);
    const aimed = window.BattleSystem.chooseTarget(st, e.uid);
    const ok = window.BattleSystem.playSelectedCard(st);
    return { picked, cost, aimed, ok, before, after: a.intent,
             logs: (st.log || []).slice(0, 8).map(String) };
  })()`);
  await page.waitForTimeout(900);
  console.log(`[刺客胶衣] ok=${latex.ok} 杀意 ${latex.before}→${latex.after}`);
  T("刺客胶衣：可将黑色牌当【刺杀】使用且不消耗杀意",
    latex.noSkill !== true && latex.picked === true && latex.cost === true
    && latex.aimed === true
    && latex.ok === true && latex.before === latex.after
    && (latex.logs || []).some(t => /刺客胶衣/.test(t)), latex);

  await page.close();
  await browser.close();
  console.log(`\n页面错误: ${errors.length}${errors.length ? " → " + errors.slice(0, 3).join(" | ") : ""}`);
  console.log(`\n=== ${pass}/${total} 通过 ===`);
  process.exit(pass === total && errors.length === 0 ? 0 : 1);
})();
