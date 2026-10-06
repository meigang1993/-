// 地雷「使用响应牌」口径 + 狙击目标「不可响应」实测
// 1) 地雷描述：在使用或打出【响应牌】时触发并消耗。
//    - 使用【闪】响应单体杀（autoDodge / resolveManualDodge）→ 必须触发
//    - 使用【看破】→ 必须触发
//    - 打出【杀】响应决斗/AOE（杀非响应牌）→ 不触发
// 2) 狙击目标（亚缇娜 / 废墟贵族军狙击手）：锁定后实体单体【杀】不可被响应。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const MINE_ATK = 7;

const putMine = `
  const mine = window.BattleStatusCards.create("landmine",
    { uid: foe.uid, stats: { attack: ${MINE_ATK} } });
  unit.hand.push(mine);
  window.BattleCards?.syncStatusCards?.(unit);
`;

// ---------- A 地雷：使用【闪】响应单体杀 ----------
const useFlashTpl = (withFlash, manual) => `(() => {
  const st = window.state, b = st.battle;
  const unit = b.allies[0], foe = (b.enemies || []).find(e => e.hp > 0);
  if (!unit || !foe) return { error: "no units" };
  st.settings = Object.assign({}, st.settings || {}, { manualResponse: ${manual} });
  b.locked = false; b.manualDodge = null; b.manualDodgeResume = null;
  b.manualCounter = null; b.reactionQueue = null;
  unit.hp = 100; foe.hp = 100;
  foe.hand = [];
  unit.noResponse = false; unit.noResponseReason = null;
  unit.hand = ${withFlash ? '[{"name":"闪","type":"response","suit":"♥"}]' : "[]"};
  ${putMine}
  const before = unit.hp;
  const card = { name: "杀（普攻）", type: "kill", suit: "♠" };
  window.BattleSystem.damage(st, unit, 10, "杀（普攻）", foe, card);
  const hpAfterSync = unit.hp;
  return {
    before, hp: hpAfterSync,
    mineLeft: unit.hand.filter(c => c.landmine).length,
    flashLeft: unit.hand.filter(c => c.name === "闪").length,
    logTail: (st.log || []).slice(0, 6),
    hadManual: !!b.manualDodge,
  };
})()`;

// 手动响应：先触发弹窗，再点「使用」
const manualStep2 = `(() => {
  const st = window.state, b = st.battle;
  if (!b.manualDodge) return { skipped: true };
  const unit = b.allies[0];
  window.BattleSystem.resolveManualDodge(st, true, 0);
  return {
    hp: unit.hp,
    mineLeft: unit.hand.filter(c => c.landmine).length,
    flashLeft: unit.hand.filter(c => c.name === "闪").length,
    logTail: (st.log || []).slice(0, 6),
  };
})()`;

// ---------- B 地雷：使用【看破】 ----------
const useKanpoTpl = `(() => {
  const st = window.state, b = st.battle;
  const unit = b.allies[0], foe = (b.enemies || []).find(e => e.hp > 0);
  if (!unit || !foe) return { error: "no units" };
  st.settings = Object.assign({}, st.settings || {}, { manualResponse: false });
  b.locked = false; b.manualDodge = null; b.manualCounter = null;
  unit.hp = 100; foe.hp = 100;
  unit.noResponse = false; unit.noResponseReason = null;
  const kanpo = { name: "看破", type: "response", suit: "♠", counterTactic: true };
  unit.hand = [kanpo];
  ${putMine}
  b.manualCounter = {
    actorUid: foe.uid, targetUid: unit.uid, card: { name: "魔王军入侵", type: "tactic", suit: "♠" },
  };
  b.locked = true;
  const before = unit.hp;
  window.BattleSystem.resolveManualCounter(st, true, 0);
  return {
    before, hp: unit.hp,
    mineLeft: unit.hand.filter(c => c.landmine).length,
    logTail: (st.log || []).slice(0, 6),
  };
})()`;

// ---------- C 地雷：打出【杀】响应决斗（杀非响应牌 → 不触发） ----------
const duelTpl = `(() => {
  const st = window.state, b = st.battle;
  const unit = b.allies[0], foe = (b.enemies || []).find(e => e.hp > 0);
  if (!unit || !foe) return { error: "no units" };
  st.settings = Object.assign({}, st.settings || {}, { manualResponse: false });
  b.locked = false; b.manualCounter = null; b.manualDodge = null;
  unit.hp = 100; foe.hp = 100;
  foe.hand = [];
  unit.noResponse = false; unit.noResponseReason = null;
  unit.hand = [
    { name: "杀（普攻）", type: "kill", suit: "♠" },
    { name: "杀（普攻）", type: "kill", suit: "♠" },
  ];
  ${putMine}
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
    before, hp: unit.hp,
    mineLeft: unit.hand.filter(c => c.landmine).length,
  };
})()`;

// ---------- D/E 狙击目标：锁定后实体单体杀不可响应 ----------
const snipeTpl = (kind, locked) => `(() => {
  const st = window.state, b = st.battle;
  const unit = b.allies[0], foe = (b.enemies || []).find(e => e.hp > 0);
  if (!unit || !foe) return { error: "no units" };
  st.settings = Object.assign({}, st.settings || {}, { manualResponse: false });
  b.locked = false; b.manualDodge = null; b.manualDodgeResume = null;
  b.manualCounter = null; b.reactionQueue = null;
  unit.hp = 100; foe.hp = 100;
  unit.noResponse = false; unit.noResponseReason = null;
  unit.hand = [{ name: "闪", type: "response", suit: "♥" }];
  foe.hand = [];
  // 角色身份
  if ("${kind}" === "artina") {
    foe.ref = "artina"; foe.usedArtinaSniper = true;
    foe.artinaChargedTargetUid = ${locked} ? unit.uid : null;
    foe.artinaSuits = {};
  } else {
    foe.ai = "ruins_sniper"; foe.usedRuinsSnipe = true;
    foe.ruinsSniperTargetUid = unit.uid;
    foe.ruinsSniperLocked = ${locked};
  }
  const before = unit.hp;
  const card = { name: "杀（普攻）", type: "kill", suit: "♠" };
  // 直连 BattleSystem.damage 会绕过 attackValues.modifyAttackAmount（真实出牌链路才会走），
  // 亚缇娜的不可响应正挂在那条链上，故此处显式驱动一次，与真实出牌等价。
  let amount = 10, ignoreSet = null, chargedCleared = null;
  if ("${kind}" === "artina") {
    amount = window.ArtinaMariaSkills.modifySlashDamage(st, foe, unit, 10, card);
    ignoreSet = !!card.ignoreResponse;
    chargedCleared = !foe.artinaChargedTargetUid;
  } else {
    window.RuinsGruntSkills?.beforeKillTargeted?.(st, foe, unit, card);
    ignoreSet = !!card.ignoreResponse;
  }
  window.BattleSystem.damage(st, unit, amount, "杀（普攻）", foe, card);
  return {
    before, hp: unit.hp, ignoreSet, chargedCleared,
    flashLeft: unit.hand.filter(c => c.name === "闪").length,
    logTail: (st.log || []).slice(0, 8),
  };
})()`;

const results = [];
const check = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}  ${detail}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  await startRegressionBattle(page);
  page.on("pageerror", e => errs.push(String(e.message)));

  const probe = await page.evaluate(`(() => ({
    hasDamage: typeof window.BattleSystem?.damage,
    hasManual: typeof window.BattleSystem?.resolveManualDodge,
    hasCounter: typeof window.BattleSystem?.resolveManualCounter,
    hasMine: typeof window.BattleStatusCards?.create,
  }))()`);
  console.log("[能力探测]", JSON.stringify(probe));

  // --- A1 自动响应：使用闪 → 地雷触发 ---
  const a1 = await page.evaluate(useFlashTpl(true, false));
  check("A1 使用【闪】响应单体杀，地雷触发并消耗（掉血" + MINE_ATK + "）",
    a1.hp === a1.before - MINE_ATK && a1.mineLeft === 0 && a1.flashLeft === 0,
    JSON.stringify(a1));

  // --- A2 手动响应：点「使用」后地雷触发 ---
  await page.evaluate(useFlashTpl(true, true));
  const a2 = await page.evaluate(manualStep2);
  if (a2.skipped) {
    check("A2 手动响应使用闪，地雷触发", false, "未弹手动响应窗口（构造失败）");
  } else {
    check("A2 手动响应使用【闪】，地雷触发并消耗",
      a2.hp === 100 - MINE_ATK && a2.mineLeft === 0 && a2.flashLeft === 0,
      JSON.stringify(a2));
  }

  // --- A3 对照：无闪不响应 → 地雷不触发 ---
  const a3 = await page.evaluate(useFlashTpl(false, false));
  check("A3 对照：无【闪】未响应，地雷不触发",
    a3.mineLeft === 1 && a3.hp === a3.before - 10, JSON.stringify(a3));

  // --- B 使用【看破】→ 地雷触发 ---
  const b1 = await page.evaluate(useKanpoTpl);
  check("B 使用【看破】，地雷触发并消耗",
    b1.mineLeft === 0 && b1.hp === b1.before - MINE_ATK, JSON.stringify(b1));

  // --- C 对照：打出【杀】响应决斗 → 地雷不触发（杀非响应牌） ---
  const c1 = await page.evaluate(duelTpl);
  check("C 对照：决斗打出【杀】（非响应牌），地雷不触发",
    c1.mineLeft === 1, JSON.stringify(c1));

  // --- D 亚缇娜狙击目标 ---
  const d1 = await page.evaluate(snipeTpl("artina", true));
  const d1NoResponse = (d1.logTail || []).some(t => /无法使用响应牌/.test(t));
  check("D1 亚缇娜锁定：实体单体杀不可响应（掉血、闪未被消耗、锁定一次性失效）",
    d1.ignoreSet === true && d1.chargedCleared === true
      && d1.hp === d1.before - 10 && d1.flashLeft === 1 && d1NoResponse,
    JSON.stringify(d1));

  const d2 = await page.evaluate(snipeTpl("artina", false));
  check("D2 对照：未锁定，【闪】正常抵消（不掉血、闪消耗、未置不可响应）",
    d2.ignoreSet === false && d2.hp === d2.before && d2.flashLeft === 0,
    JSON.stringify(d2));

  // --- E 废墟贵族军狙击手 ---
  const e1 = await page.evaluate(snipeTpl("ruins", true));
  const e1NoResponse = (e1.logTail || []).some(t => /不可响应|无法使用响应牌/.test(t));
  check("E1 废墟狙击手锁定：实体单体杀不可响应",
    e1.ignoreSet === true && e1.hp === e1.before - 10
      && e1.flashLeft === 1 && e1NoResponse,
    JSON.stringify(e1));

  const e2 = await page.evaluate(snipeTpl("ruins", false));
  check("E2 对照：未锁定，【闪】正常抵消",
    e2.hp === e2.before && e2.flashLeft === 0, JSON.stringify(e2));

  check("无页面错误", errs.length === 0, errs.join(" | ") || "0");

  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n通过 ${results.length - failed.length} / 失败 ${failed.length}`);
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(2); });
