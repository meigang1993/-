// 地雷触发口径实测：地雷描述为「在使用或打出响应牌时」触发并消耗。
// 覆盖本轮补齐的三个响应出口（决斗打出杀 / 无谋冲拳 / 佯攻），
// 并保留闪这条既有链路做回归；每个场景都带「不打出响应牌」的对照，
// 证明地雷只在真正的使用/打出动作后触发（排除假阴性）。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const KILL = '{"name":"杀（普攻）","type":"kill","suit":"♠","suits":["♠"]}';
const FLASH = '{"name":"闪","type":"response","suit":"♥"}';
const FEINT = '{"name":"佯攻","type":"response","suit":"♠","feint":true}';
const MINE_ATK = 7;

// 公共：把地雷塞进目标手牌（landmineAttack = MINE_ATK）
const putMine = `
  const mine = window.BattleStatusCards.create("landmine",
    { uid: "__src__", stats: { attack: ${MINE_ATK} } });
  unit.hand.push(mine);
  window.BattleCards?.syncStatusCards?.(unit);
`;

const mineLeft = `unit.hand.filter(c => c.landmine).length`;

// 1 与我一战：ally 手握地雷 + 杀，敌方发起决斗 → ally 打出杀
const duelTpl = (withKill, paralyze) => `(() => {
  const st = window.state, b = st.battle, unit = b.allies[0];
  const foe = (b.enemies || []).find(e => e.hp > 0);
  if (!unit || !foe) return { error: "no units" };
  st.settings = Object.assign({}, st.settings || {}, { manualResponse: false });
  b.locked = false; b.manualCounter = null; b.manualDodge = null;
  unit.hp = 100; foe.hp = 100;
  foe.hand = [];
  unit.hand = ${withKill ? `[${KILL}, ${KILL}]` : "[]"};
  ${putMine}
  if (${paralyze}) { unit.noResponse = true; unit.noResponseReason = "麻痹"; }
  else { unit.noResponse = false; unit.noResponseReason = null; }
  const before = unit.hp;
  window.BattleCardTactics({
    log: (s, t) => { (s.log = s.log || []).push(t); },
    ctx: {
      statOf: (u, k) => (u && typeof u[k] === "number" ? u[k] : 5),
      damage: (s, t, amt) => { if (t) t.hp -= (amt || 0); },
      putCard: () => null,
    },
    deps: { nextAnim: () => Math.random(), isKillCard: () => false },
    reveal: () => {}, openHandReveal: () => {},
  }).duel(st, foe, unit, { name: "与我一战", type: "tactic", suit: "♠" });
  return {
    before, hp: unit.hp, mineLeft: ${mineLeft},
    killsLeft: unit.hand.filter(c => c.name === "杀（普攻）").length,
  };
})()`;

// 2 无谋冲拳：准备阶段打出
const recklessTpl = `(() => {
  const st = window.state, b = st.battle, unit = b.allies[0];
  const foe = (b.enemies || []).find(e => e.hp > 0);
  if (!unit || !foe) return { error: "no units" };
  st.settings = Object.assign({}, st.settings || {}, { manualResponse: false });
  b.locked = false; b.manualCounter = null; b.manualDodge = null;
  b.recklessPrompt = null; b.prepareUnitUid = "__other__";
  unit.hp = 100;
  unit.hand = [{ name: "无谋冲拳", type: "response", suit: "♠", reckless: true }];
  ${putMine}
  unit.recklessPromptDone = false;
  unit.noResponse = false; unit.noResponseReason = null;
  const before = unit.hp;
  const inst = window.BattleTurnStart({
    active: bb => (bb.allies || []).find(u => u.uid === bb.activeUid)
      || (bb.allies || [])[0] || null,
    allUnits: bb => [...(bb.allies || []), ...(bb.enemies || [])],
    combat: {
      useCard: () => null,
      damage: (s, t, amt) => { if (t) t.hp -= (amt || 0); },
      checkDefeat: () => false, checkEnd: () => false,
      directDamage: (s, t, amt) => { if (t) t.hp -= (amt || 0); },
    },
    draw: (u) => { u.hand = u.hand || []; },
    intentMax: () => 5,
    nextAnim: () => Math.random(),
    nextRoundUnit: () => unit,
    tempAttack: () => 5,
    turnDrawCount: () => 2,
    record: (s, text) => { (s.log = s.log || []).push(text); },
    waitEffects: () => false,
    getFinishTurn: () => null,
    advanceToInput: () => {},
  });
  inst.continuePreparedTurn(st, unit);
  return {
    before, hp: unit.hp, mineLeft: ${mineLeft},
    done: !!unit.recklessPromptDone,
  };
})()`;

// 3 佯攻：友方 A 出单体杀，另一友方 holder 打出佯攻
const feintTpl = `(() => {
  const st = window.state, b = st.battle;
  const actor = b.allies[0], unit = b.allies[1];
  const foe = (b.enemies || []).find(e => e.hp > 0);
  if (!actor || !unit || !foe) return { error: "need 2 allies" };
  b.locked = false; b.manualCounter = null; b.manualDodge = null;
  actor.hp = 100; unit.hp = 100;
  unit.hand = [${FEINT}];
  ${putMine}
  foe.hand = [
    { name: "杀（普攻）", type: "kill", suit: "♠" },
    { name: "闪", type: "response", suit: "♥" },
  ];
  unit.noResponse = false; unit.noResponseReason = null;
  const before = unit.hp;
  window.BondiSkills.beforeKillTargeted(
    st, actor, foe,
    { name: "杀（普攻）", type: "kill", suit: "♠", singleKill: true });
  const logs = (st.log || []).map(String)
    .concat((window.BattleLog?.raw?.() || []).map(String));
  return {
    before, hp: unit.hp, mineLeft: unit.hand.filter(c => c.landmine).length,
    feintLog: logs.some(t => t.includes("打出佯攻")),
  };
})()`;

// 4 闪（既有链路回归）：走 BattleDodgeCards.play 真实打出
const flashTpl = `(() => {
  const st = window.state, b = st.battle, unit = b.allies[0];
  const foe = (b.enemies || []).find(e => e.hp > 0);
  if (!unit || !foe) return { error: "no units" };
  b.locked = false; b.manualCounter = null; b.manualDodge = null;
  unit.hp = 100;
  const flash = ${FLASH};
  unit.hand = [flash];
  ${putMine}
  unit.noResponse = false; unit.noResponseReason = null;
  const before = unit.hp;
  window.BattleDodgeCards({
    deps: { nextAnim: () => Math.random() },
    ctx: { hasSkill: () => false },
    canDodge: (card, c) => c && c.name === "闪",
  }).play(st, unit, foe, [flash]);
  return { before, hp: unit.hp, mineLeft: ${mineLeft} };
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

    // ---- 1 与我一战（决斗打出杀） ----
    const dOn = await page.evaluate(duelTpl(true, false));
    const dNone = await page.evaluate(duelTpl(false, false));
    // 地雷描述限定「使用或打出响应牌」；决斗打出的是【杀】，非响应牌，不触发。
    t("与我一战：打出杀不触发地雷（杀非响应牌）",
      dOn.mineLeft === 1 && dOn.hp === dOn.before, dOn);
    t("与我一战：打出杀后杀牌离手", dOn.killsLeft === 1, dOn);
    t("与我一战：未打出响应牌（无杀）时不触发",
      dNone.mineLeft === 1 && dNone.hp === dNone.before - 5, dNone);

    // ---- 2 无谋冲拳（准备阶段打出） ----
    const r = await page.evaluate(recklessTpl);
    t("无谋冲拳：打出后地雷触发并消耗",
      r.done && r.hp === r.before - MINE_ATK && r.mineLeft === 0, r);

    // ---- 3 佯攻（友方出杀时另一友方打出） ----
    const f = await page.evaluate(feintTpl);
    t("佯攻：打出后地雷触发并消耗",
      f.feintLog && f.hp === f.before - MINE_ATK && f.mineLeft === 0, f);

    // ---- 4 闪（既有链路回归） ----
    const fl = await page.evaluate(flashTpl);
    t("闪：打出后地雷触发并消耗（既有链路回归）",
      fl.hp === fl.before - MINE_ATK && fl.mineLeft === 0, fl);

    // ---- 5 麻痹：不能打出响应牌 → 地雷不触发 ----
    const dPar = await page.evaluate(duelTpl(true, true));
    t("麻痹：无法打出杀，地雷不触发",
      dPar.mineLeft === 1 && dPar.killsLeft === 2, dPar);

    t("页面无 JS 错误", errors.length === 0, { errors: errors.slice(0, 3) });
  } catch (e) {
    t("执行异常", false, { error: String(e).slice(0, 300) });
  } finally {
    await browser.close();
  }
  out.pass.forEach(p => console.log(
    `✅ ${p.name}${p.error ? ` — ${p.error}` : ""}`));
  out.fail.forEach(p => console.log(
    `❌ ${p.name} — ${JSON.stringify(p)}`));
  console.log(`\n通过 ${out.pass.length} / ${out.pass.length + out.fail.length}`);
  process.exit(out.fail.length ? 1 : 0);
})();
