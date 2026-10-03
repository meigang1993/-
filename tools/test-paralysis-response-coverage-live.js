// 麻痹 = 「一轮回合无法使用或打出响应牌」全覆盖实测。
// 覆盖此前只做了静态核对 / 无独立实测的入口：
//   A 下回合恢复（回合开始清除，走真实 beginTurn）
//   B 看破（counterTactic）      C 埋伏（ambush）
//   D 后空翻（backflip）          E 魔王军入侵（AOE 打出杀）
//   F 与我一战（决斗打出杀）      G 魔法对决（决斗打出魔杀）
//   H 出牌区「使用 / 打出」文案（三国杀口径）
// 每个封堵场景都带「无麻痹对照」，证明链路本身可用（排除假阴性）。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const KILL = '{"name":"杀（普攻）","type":"kill","suit":"♠"}';
const MAGIC_KILL = '{"name":"魔杀","type":"kill","suit":"♥"}';

// A：置麻痹后走真实回合开始，检查清除。
// window.BattleTurnStart 是工厂（非实例），这里注入最小依赖后取真实的 beginTurn，
// nextRoundUnit 固定返回目标角色，从而精确驱动「该角色的回合开始」。
const turnTpl = `(() => {
  const st = window.state, b = st.battle, ally = b.allies[0];
  b.locked = false; b.manualCounter = null; b.manualDodge = null;
  ally.hp = 100;
  ally.statusCards = []; ally.statuses = [];
  ally.hand = [];                       // 清空：避免准备阶段判定再次置位
  ally.noResponse = true; ally.noResponseReason = "麻痹";
  ally.skipPlayPhase = true; ally.skipPlayReason = "麻痹";
  const inst = window.BattleTurnStart({
    active: bb => (bb.allies || []).find(u => u.uid === bb.activeUid)
      || (bb.allies || [])[0] || null,
    allUnits: bb => [...(bb.allies || []), ...(bb.enemies || [])],
    combat: {
      useCard: () => null, damage: () => null,
      checkDefeat: () => false, checkEnd: () => false,
      directDamage: () => null,
    },
    draw: (u, n) => { u.hand = u.hand || []; },
    intentMax: () => 5,
    nextAnim: () => Math.random(),
    nextRoundUnit: () => ally,
    tempAttack: () => 0,
    turnDrawCount: () => 2,
    record: (s, text) => { (s.log = s.log || []).push(text); },
    waitEffects: () => false,
    getFinishTurn: () => null,
    advanceToInput: () => {},
  });
  const u = inst.beginTurn(st);
  return {
    retUid: u ? u.uid : null, allyUid: ally.uid,
    noResponse: !!ally.noResponse, skipPlayPhase: !!ally.skipPlayPhase,
  };
})()`;

// B/C/D：手动看破响应候选（看破 / 埋伏 / 后空翻共用同一入口）
// paralyze=true 时麻痹；返回 UI 按钮数 + 源头候选数
const counterTpl = paralyze => `(() => {
  const st = window.state, b = st.battle, ally = b.allies[0];
  const foe = (b.enemies || []).find(e => e.hp > 0);
  if (!ally || !foe) return { error: "no units" };
  st.settings = Object.assign({}, st.settings || {}, { manualResponse: true });
  ally.hp = 100;
  ally.hand = [
    { name: "看破", type: "tactic", suit: "♠", counterTactic: true },
    { name: "埋伏", type: "tactic", suit: "♣", ambush: true },
    { name: "后空翻", type: "tactic", suit: "♥" },
  ];
  if (${paralyze}) { ally.noResponse = true; ally.noResponseReason = "麻痹"; }
  else { ally.noResponse = false; ally.noResponseReason = null; }
  const card = { name: "拆解", type: "tactic", suit: "♠" };
  b.locked = false; b.manualCounter = null;
  const cInst = window.BattleCardCounterInteractions(
    { useCard: () => null, damage: () => null, nextAnim: () => 1 },
    { damage: () => null, putCard: () => null, statOf: () => 5 },
    { log: (s, t) => { (s.log = s.log || []).push(t); } });
  const fired = cInst.counterTactic(st, foe, ally, card);
  const has = !!b.manualCounter;
  const html = has ? (window.BattleResponseUI.manualCounterHand(b) || "") : "";
  return {
    fired: !!fired, hasManualCounter: has,
    buttons: (html.match(/data-manual-counter-pick/g) || []).length,
  };
})()`;

// E：魔王军入侵（AOE，响应 = 打出杀）
const invasionTpl = paralyze => `(() => {
  const st = window.state, b = st.battle, ally = b.allies[0];
  const foe = (b.enemies || []).find(e => e.hp > 0);
  if (!ally || !foe) return { error: "no units" };
  st.settings = Object.assign({}, st.settings || {}, { manualResponse: false });
  ally.hp = 100;
  ally.hand = [${KILL}, ${KILL}];
  if (${paralyze}) { ally.noResponse = true; ally.noResponseReason = "麻痹"; }
  else { ally.noResponse = false; ally.noResponseReason = null; }
  b.locked = false; b.manualCounter = null; b.manualDodge = null;
  b.demonInvasionResume = null;

  const mkTactics = () => window.BattleCardTactics({
    log: (s, t) => { (s.log = s.log || []).push(t); },
    ctx: {
      statOf: (u, k) => (u && typeof u[k] === "number" ? u[k] : 5),
      damage: (s, t, amt) => { if (t) t.hp -= (amt || 0); },
      putCard: () => null,
    },
    deps: { nextAnim: () => Math.random(), isKillCard: () => false },
    reveal: () => {}, openHandReveal: () => {},
  });
  mkTactics().demonInvasion(st, foe,
    { name: "魔王军入侵", type: "tactic", suit: "♠" });
  // AOE 响应 = 打出杀，其能力判定走 BattleDodgeCards.count
  const dodge = window.BattleDodgeCards({
    deps: {}, ctx: {},
    canDodge: (c, cand) => window.CardUtils.canRespondTo("slash", cand),
  });
  return {
    hp: ally.hp, kills: ally.hand.filter(c => c.name === "杀（普攻）").length,
    dodgeCount: dodge.count(ally, { responseKind: "slash" }),
  };
})()`;

// F/G：决斗（与我一战 / 魔法对决），响应 = 打出杀 / 魔杀
const duelTpl = (paralyze, kind) => {
  const isMagic = kind === "magic";
  const cardName = isMagic ? "魔杀" : "杀（普攻）";
  const fn = isMagic ? "magicDuel" : "duel";
  const tactic = isMagic ? "魔法对决" : "与我一战";
  return `(() => {
  const st = window.state, b = st.battle, ally = b.allies[0];
  const foe = (b.enemies || []).find(e => e.hp > 0);
  if (!ally || !foe) return { error: "no units" };
  st.settings = Object.assign({}, st.settings || {}, { manualResponse: false });
  ally.hp = 100;
  ally.hand = [${isMagic ? MAGIC_KILL : KILL}, ${isMagic ? MAGIC_KILL : KILL}];
  if (${paralyze}) { ally.noResponse = true; ally.noResponseReason = "麻痹"; }
  else { ally.noResponse = false; ally.noResponseReason = null; }
  b.locked = false; b.manualCounter = null; b.manualDodge = null;
  const mkTactics = () => window.BattleCardTactics({
    log: (s, t) => { (s.log = s.log || []).push(t); },
    ctx: {
      statOf: (u, k) => (u && typeof u[k] === "number" ? u[k] : 5),
      damage: (s, t, amt) => { if (t) t.hp -= (amt || 0); },
      putCard: () => null,
    },
    deps: { nextAnim: () => Math.random(), isKillCard: () => false },
    reveal: () => {}, openHandReveal: () => {},
  });
  mkTactics().${fn}(st, foe, ally,
    { name: "${tactic}", type: "tactic", suit: "♠" });
  return {
    hp: ally.hp,
    left: ally.hand.filter(c => c.name === "${cardName}").length,
  };
})()`;
};

// H：出牌区文案（三国杀口径）
const actionTpl = `(() => {
  const inst = window.BattleDodgeCards({
    deps: {}, ctx: {}, canDodge: () => true,
  });
  const f = inst?.responseAction;
  if (typeof f !== "function") return { error: "no responseAction" };
  return {
    aoeSlash: f({ responseKind: "slash" }),
    aoeSweep: f({ sweep: true }),
    plainKill: f({}),
    label: inst.responseLabel({ responseKind: "slash" }),
  };
})()`;

const logTpl = `(() => {
  const logs = (window.state.log || []).map(String);
  return { last: logs.slice(-4) };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const out = { pass: [], fail: [] };
  const t = (name, ok, info) => (ok ? out.pass : out.fail)
    .push({ name, ...(info || {}) });
  try {
    await startRegressionBattle(page);
    await page.waitForTimeout(600);

    // ---- A 下回合恢复 ----
    await page.evaluate(turnTpl);
    await page.waitForTimeout(800);
    const a = await page.evaluate(`(() => {
      const b = window.state.battle, ally = b.allies[0];
      return { noResponse: !!ally.noResponse, skipPlayPhase: !!ally.skipPlayPhase };
    })()`);
    out.turn = a;
    t("A 回合开始：noResponse 已清除", a.noResponse === false, a);
    t("A 回合开始：skipPlayPhase 已清除", a.skipPlayPhase === false, a);

    // ---- B/C/D 看破 / 埋伏 / 后空翻 ----
    const ctr = await page.evaluate(counterTpl(true));
    out.counterParalyzed = ctr;
    t("B/C/D 麻痹：不弹手动响应窗口", ctr.hasManualCounter === false, ctr);
    t("B/C/D 麻痹：响应按钮数为 0", ctr.buttons === 0, ctr);
    t("B/C/D 麻痹：counterTactic 判定为无响应者", ctr.fired === false, ctr);

    await page.reload();
    await page.waitForTimeout(1200);
    await startRegressionBattle(page);
    await page.waitForTimeout(600);
    const ctrN = await page.evaluate(counterTpl(false));
    out.counterNormal = ctrN;
    t("B/C/D 对照（无麻痹）：正常弹出响应窗口", ctrN.hasManualCounter === true, ctrN);
    t("B/C/D 对照（无麻痹）：响应按钮数 > 0", ctrN.buttons > 0, ctrN);

    // ---- E 魔王军入侵 ----
    const inv = await page.evaluate(invasionTpl(true));
    out.invasionParalyzed = inv;
    t("E 麻痹：无法打出杀响应，掉血", inv.hp < 100, inv);
    t("E 麻痹：两张杀仍在手里", inv.kills === 2, inv);
    t("E 麻痹：响应能力判定为 0（无法打出杀）", inv.dodgeCount === 0, inv);

    await page.reload();
    await page.waitForTimeout(1200);
    await startRegressionBattle(page);
    await page.waitForTimeout(600);
    const invN = await page.evaluate(invasionTpl(false));
    out.invasionNormal = invN;
    t("E 对照（无麻痹）：可打出杀响应（响应能力 > 0）",
      invN.dodgeCount > 0, invN);

    // ---- F 与我一战 ----
    const duelP = await page.evaluate(duelTpl(true, "duel"));
    out.duelParalyzed = duelP;
    t("F 麻痹：无法打出杀，两张杀仍在手", duelP.left === 2, duelP);
    t("F 麻痹：决斗失败掉血", duelP.hp < 100, duelP);
    let lg = await page.evaluate(logTpl);
    out.duelLog = lg.last;
    t("F 麻痹：日志说明无法使用或打出响应牌",
      lg.last.some(l => /无法使用或打出响应牌/.test(l)), { v: lg.last });

    await page.reload();
    await page.waitForTimeout(1200);
    await startRegressionBattle(page);
    await page.waitForTimeout(600);
    const duelN = await page.evaluate(duelTpl(false, "duel"));
    out.duelNormal = duelN;
    t("F 对照（无麻痹）：正常打出杀（手牌减少）", duelN.left < 2, duelN);

    // ---- G 魔法对决 ----
    const mdP = await page.evaluate(duelTpl(true, "magic"));
    out.magicParalyzed = mdP;
    t("G 麻痹：无法打出魔杀，两张仍在手", mdP.left === 2, mdP);
    t("G 麻痹：决斗失败掉血", mdP.hp < 100, mdP);
    lg = await page.evaluate(logTpl);
    out.magicLog = lg.last;
    t("G 麻痹：日志说明无法使用或打出响应牌",
      lg.last.some(l => /无法使用或打出响应牌/.test(l)), { v: lg.last });

    await page.reload();
    await page.waitForTimeout(1200);
    await startRegressionBattle(page);
    await page.waitForTimeout(600);
    const mdN = await page.evaluate(duelTpl(false, "magic"));
    out.magicNormal = mdN;
    t("G 对照（无麻痹）：正常打出魔杀（手牌减少）", mdN.left < 2, mdN);

    // ---- H 出牌区文案 ----
    const act = await page.evaluate(actionTpl);
    out.action = act;
    t("H AOE 打出杀 → 文案「打出」", act.aoeSlash === "打出", act);
    t("H AOE 横扫 → 文案「打出」", act.aoeSweep === "打出", act);
    t("H 普通杀的闪 → 文案「使用」", act.plainKill === "使用", act);
    t("H AOE 响应标签为「杀」", act.label === "杀", act);
  } catch (e) {
    out.err = String(e).slice(0, 300);
  }
  await page.close();
  await browser.close();
  out.pass.forEach(p => console.log(`✅ ${p.name}`));
  out.fail.forEach(p => console.log(`❌ ${p.name} ${JSON.stringify(p)}`));
  console.log(`\n通过 ${out.pass.length} / ${out.pass.length + out.fail.length}`);
  if (out.err) console.log("ERR:", out.err);
  if (errors.length) console.log("PAGEERROR:", errors.slice(0, 3));
  process.exit(out.fail.length || out.err ? 1 : 0);
})();
