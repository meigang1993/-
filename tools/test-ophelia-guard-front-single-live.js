// 【为我护驾】判定提前到自动响应之前 / 单体杀触发 / 跳过后回到响应链 实机验证。
// 与 test-ophelia-guard-skip-live.js（按钮可点击性）互补：这里用真实
// BattleSystem.damage 走完整伤害链，而不是手工摆 b.opheliaGuard 挂起。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const passed = [];
const T = (n, ok, d = "") => {
  passed.push(ok);
  console.log(`${ok ? "✅" : "❌"} ${n}${ok ? "" : "  ← " + JSON.stringify(d)}`);
  return ok;
};

const BASE = `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b._damageDepth = 0;
  b.opheliaGuard = null; b.opheliaGuardUid = null;
  b.opheliaGuardRedirectUid = null; b.opheliaGuardRepeats = 0;
  b.manualDodgeResume = null; b.manualDodge = null; b.dimensionTransfer = null;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  b.allies.forEach((a, i) => { a.hp = 300; a.maxHp = 300; a.block = 0;
    a.hand = []; a.name = "队友" + i; a.ref = "ally" + i; a.noResponse = false; });
  b.enemies.forEach(e => { e.hp = 300; e.maxHp = 300; e.hand = []; });
  window.BattleEffects.animating = false; window.BattleEffects.draining = false;
  st.settings = st.settings || {};
  st.settings.manualResponse = false;   // 自动响应模式
  st.settings.manualDodge = false;
  st.log = [];
  const op = b.allies[0];
  op.ref = "ophelia"; op.name = "奥菲莉亚";
  op.skills = (window.GameDataCharactersExtra || []).find(x => x.id === "ophelia")?.skills || [];
  b.activeUid = b.enemies[0].uid;
  return true;
})()`;

// 真实走 BattleSystem.damage：card 为单体杀 / 群体杀由参数控制
const TRIGGER = `(CARD, HAND) => {
  const st = window.state, b = st.battle;
  const op = b.allies[0], e0 = b.enemies[0];
  op.hand = HAND.map(c => ({ ...c }));
  const out = window.BattleSystem.damage(st, op, 7, "测试杀", e0, CARD);
  window.render && window.render();
  return { out, pending: !!b.opheliaGuard, locked: !!b.locked,
    hp: op.hp, hand: op.hand.length, log: (st.log || []).join(" | ") };
}`;

const SNAP = `(() => {
  const st = window.state, b = st.battle, op = b.allies[0];
  return { pending: !!b.opheliaGuard, locked: !!b.locked, hp: op.hp,
    hand: op.hand.length, resume: b.manualDodgeResume?.remainingHits ?? null,
    log: (st.log || []).join(" | ") };
})()`;

const SINGLE = { name: "杀（普攻）", type: "slash", suit: "♠", scale: "attack" };
const SWEEP = { ...SINGLE, sweep: true, allTargets: true };
const FLASH = [{ name: "闪", type: "response", suit: "♥" }];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ── A：自己有【闪】时，护驾仍先于自动响应挂起 ──
  await page.evaluate(BASE);
  const a = await page.evaluate(`(${TRIGGER})(${JSON.stringify(SINGLE)}, ${JSON.stringify(FLASH)})`);
  console.log("A_TRIGGER", JSON.stringify(a));
  T("A1 单体【杀】+ 自己有【闪】：护驾挂起（判定先于自动响应）",
    a.pending && a.locked, a);
  T("A2 挂起时没有先耗掉自己的【闪】、也没有掉血",
    a.hand === 1 && a.hp === 300, a);
  // 既有设计：护驾立即锁住战斗，但提示条要等效果队列空闲才显示
  // （docs/original/known-risks.md）。这里等可见再断言，不把「隐藏等待期」误判为缺按钮。
  const aBtn = page.locator("[data-ophelia-guard-skip]");
  await aBtn.waitFor({ state: "visible", timeout: 8000 }).catch(() => {});
  T("A3 效果队列空闲后提示条出现「跳过（不发动）」按钮",
    await aBtn.count() === 1 && await aBtn.isVisible());

  // ── B：跳过后回到响应链，自动出自己的【闪】抵消（不是直接扣血） ──
  await page.locator("[data-ophelia-guard-skip]").click();
  await page.waitForFunction(() => !window.state.battle.opheliaGuard, { timeout: 8000 }).catch(() => {});
  const b = await page.evaluate(SNAP);
  console.log("B_AFTER_SKIP", JSON.stringify(b));
  T("B1 跳过后挂起解除、界面解锁", !b.pending && !b.locked, b);
  T("B2 回到响应链：自动用掉自己的【闪】、奥菲莉亚不掉血",
    b.hp === 300 && b.hand === 0, b);
  T("B3 战报写明「放弃发动为我护驾」", b.log.includes("放弃发动为我护驾"), b.log.slice(-260));

  // ── C：全体类杀牌不再触发护驾 ──
  await page.evaluate(BASE);
  const c = await page.evaluate(`(${TRIGGER})(${JSON.stringify(SWEEP)}, ${JSON.stringify([])})`);
  console.log("C_SWEEP", JSON.stringify(c));
  T("C1 群体杀（sweep + allTargets）不弹护驾窗", !c.pending && !c.locked, c);
  T("C2 群体杀按正常响应链结算（无闪则承伤）", c.hp < 300, c);

  // ── D：无闪的单体杀 → 跳过护驾后由原目标承伤 ──
  await page.evaluate(BASE);
  const d0 = await page.evaluate(`(${TRIGGER})(${JSON.stringify(SINGLE)}, [])`);
  console.log("D_TRIGGER", JSON.stringify(d0));
  T("D1 无闪单体杀仍挂起护驾", d0.pending && d0.locked, d0);
  await page.locator("[data-ophelia-guard-skip]").click();
  await page.waitForFunction(() => !window.state.battle.opheliaGuard, { timeout: 8000 }).catch(() => {});
  const d = await page.evaluate(SNAP);
  console.log("D_AFTER_SKIP", JSON.stringify(d));
  T("D2 跳过后伤害落回奥菲莉亚（护驾者未承伤）",
    d.hp < 300 && d.hp === 293, d);
  T("D3 未指定护驾者（opheliaGuardUid 为空）", !d.pending, d);

  const rel = relevantErrors(errors);
  T("E1 全程无 pageerror / console error", rel.length === 0, rel.slice(0, 3));
  console.log(`\nRESULT ${passed.filter(Boolean).length}/${passed.length}`);
  await browser.close();
  process.exit(passed.every(Boolean) ? 0 : 1);
})();
