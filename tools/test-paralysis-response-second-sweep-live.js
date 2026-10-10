// 响应牌封堵「二次复查」实测：补齐上一轮只做了静态核对 / 完全没查到的入口。
//   1 无谋冲拳（准备阶段打出）
//   2 佯攻（友方出单体杀时，另一友方打出）
//   3 奥菲莉亚·为我护驾（护驾者替其使用闪）
// 每个场景都带「无麻痹对照」，证明链路本身可用（排除假阴性）。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const KILL = '{"name":"杀（普攻）","type":"kill","suit":"♠","suits":["♠"]}';
const FLASH = '{"name":"闪","type":"response","suit":"♥"}';
const FEINT = '{"name":"佯攻","type":"response","suit":"♠","feint":true}';

// 1 无谋冲拳：走真实 continuePreparedTurn。
// 把 battle.prepareUnitUid 指向别人，让 prepareSequence.resolve 直接返回 true，
// 从而精确落到 shouldPromptReckless 这一句上（不做任何替代实现）。
const recklessTpl = paralyze => `(() => {
  const st = window.state, b = st.battle, ally = b.allies[0];
  const foe = (b.enemies || []).find(e => e.hp > 0);
  if (!ally || !foe) return { error: "no units" };
  st.settings = Object.assign({}, st.settings || {}, { manualResponse: false });
  b.locked = false; b.manualCounter = null; b.manualDodge = null;
  b.recklessPrompt = null; b.prepareUnitUid = "__other__";
  ally.hp = 100;
  ally.hand = [{ name: "无谋冲拳", type: "response", suit: "♠", reckless: true }];
  ally.recklessPromptDone = false;
  if (${paralyze}) { ally.noResponse = true; ally.noResponseReason = "麻痹"; }
  else { ally.noResponse = false; ally.noResponseReason = null; }
  const foeHpBefore = foe.hp;
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
    nextRoundUnit: () => ally,
    tempAttack: () => 5,
    turnDrawCount: () => 2,
    record: (s, text) => { (s.log = s.log || []).push(text); },
    waitEffects: () => false,
    getFinishTurn: () => null,
    advanceToInput: () => {},
  });
  inst.continuePreparedTurn(st, ally);
  return {
    left: ally.hand.filter(c => c.name === "无谋冲拳").length,
    done: !!ally.recklessPromptDone,
    foeHpBefore, foeHp: foe.hp,
  };
})()`;

// 2 佯攻：友方 A 出单体杀指定敌方，另一名友方 B 手握佯攻。
const feintTpl = paralyze => `(() => {
  const st = window.state, b = st.battle;
  const actor = b.allies[0], holder = b.allies[1];
  const foe = (b.enemies || []).find(e => e.hp > 0);
  if (!actor || !holder || !foe) return { error: "need 2 allies" };
  b.locked = false; b.manualCounter = null; b.manualDodge = null;
  actor.hp = 100; holder.hp = 100;
  holder.hand = [${FEINT}];
  foe.hand = [
    { name: "杀（普攻）", type: "kill", suit: "♠" },
    { name: "闪", type: "response", suit: "♥" },
  ];
  if (${paralyze}) { holder.noResponse = true; holder.noResponseReason = "麻痹"; }
  else { holder.noResponse = false; holder.noResponseReason = null; }
  const foeHandBefore = foe.hand.length;
  window.BondiSkills.beforeKillTargeted(
    st, actor, foe,
    { name: "杀（普攻）", type: "kill", suit: "♠", singleKill: true });
  const logs = (st.log || []).map(String).concat(
    (window.BattleLog?.raw?.() || []).map(String));
  return {
    foeHandBefore, foeHand: foe.hand.length,
    holderLeft: holder.hand.filter(c => c.feint).length,
    feintLog: logs.some(t => t.includes("打出佯攻")),
  };
})()`;

// 3 为我护驾：奥菲莉亚被杀且无闪，指定另一名友方护驾。
const guardTpl = paralyze => `(() => {
  const st = window.state, b = st.battle;
  const target = b.allies[0], guard = b.allies[1];
  const foe = (b.enemies || []).find(e => e.hp > 0);
  if (!target || !guard || !foe) return { error: "need 2 allies" };
  b.locked = false; b.manualCounter = null; b.manualDodge = null;
  // pickManualGuard 首次调用只开选择窗并返回 null（等玩家点人），
  // 这里预置已选中的护驾者，等价于玩家点击后的那次调用。
  b.opheliaGuard = null; b.opheliaGuardUid = null;
  target.ref = "ophelia"; target.name = "奥菲莉亚";
  target.hp = 100; guard.hp = 100;
  target.hand = [];                       // 奥菲莉亚自己没有闪，才会触发护驾
  guard.hand = [${FLASH}];
  if (${paralyze}) { guard.noResponse = true; guard.noResponseReason = "麻痹"; }
  else { guard.noResponse = false; guard.noResponseReason = null; }
  const api = {
    canDodge: (c, cand) => cand?.name === "闪" && cand?.type === "response",
    afterDodged: () => {},
    draw: () => {},
    hitWithoutDodge: (s, a, g, amt) => {
      g.hp -= (amt || 0);
      return { dodged: false, hpLoss: amt || 0 };
    },
  };
  b.opheliaGuardUid = guard.uid;
  const inst = window.GuestOpheliaGuard({
    alive: u => !!u && u.hp > 0,
    visible: u => (u?.hand || []).filter(c => !c._pendingDraw),
    isSlash: c => window.CardUtils?.isKillCard?.(c) || c?.type === "kill",
    line: () => {},
  });
  const r = inst.guardOphelia(st, foe, target, 10, "测试",
    { name: "杀（普攻）", type: "kill", suit: "♠" }, api);
  return {
    dodged: !!r?.dodged,
    guardHp: guard.hp,
    guardFlash: guard.hand.filter(c => c.name === "闪").length,
  };
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

    // ---- 1 无谋冲拳 ----
    const rOn = await page.evaluate(recklessTpl(true));
    const rOff = await page.evaluate(recklessTpl(false));
    t("无谋冲拳：对照（无麻痹）准备阶段打出", rOff.left === 0 && rOff.done, rOff);
    t("无谋冲拳：麻痹时不打出，牌留在手里", rOn.left === 1 && !rOn.done, rOn);
    t("无谋冲拳：麻痹时不造成伤害", rOn.foeHp === rOn.foeHpBefore, rOn);

    // ---- 2 佯攻 ----
    const fOn = await page.evaluate(feintTpl(true));
    const fOff = await page.evaluate(feintTpl(false));
    t("佯攻：对照（无麻痹）打出并弃置目标1张", fOff.holderLeft === 0
      && fOff.foeHand === fOff.foeHandBefore - 1 && fOff.feintLog, fOff);
    t("佯攻：麻痹时不打出，牌留在手里", fOn.holderLeft === 1, fOn);
    t("佯攻：麻痹时目标手牌未被弃置",
      fOn.foeHand === fOn.foeHandBefore && !fOn.feintLog, fOn);

    // ---- 3 为我护驾 ----
    const gOn = await page.evaluate(guardTpl(true));
    const gOff = await page.evaluate(guardTpl(false));
    t("护驾：对照（无麻痹）护驾者出闪抵消", gOff.dodged
      && gOff.guardFlash === 0 && gOff.guardHp === 100, gOff);
    t("护驾：麻痹时不能出闪，改为承受伤害", !gOn.dodged
      && gOn.guardFlash === 1 && gOn.guardHp === 90, gOn);

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
