// 护驾深查实机：连击杀「护驾者出闪」分支不重复弹窗、时停不发动护驾。
// 对应 tools/check-ophelia-guard-deep.js 的 B1 / B4，走真实 BattleSystem.useCard。
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

const BASE = (opt) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b._damageDepth = 0;
  b.opheliaGuard = null; b.opheliaGuardUid = null;
  b.opheliaGuardRedirectUid = null; b.opheliaGuardRepeats = 0;
  b.manualDodgeResume = null; b.manualDodge = null; b.dimensionTransfer = null;
  b.counterTrigger = null; b.counterTriggerQueue = null;
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  b.allies.forEach((a, i) => { a.hp = 400; a.maxHp = 400; a.block = 0;
    a.hand = []; a.name = "队友" + i; a.ref = "ally" + i; a.noResponse = false;
    a.statuses = []; a.battleRelics = []; });
  b.enemies.forEach((e, i) => { e.hp = 400; e.maxHp = 400; e.hand = []; e.statuses = []; });
  window.BattleEffects.animating = false; window.BattleEffects.draining = false;
  st.settings = st.settings || {};
  st.settings.manualResponse = ${opt.manual === true};
  st.settings.manualDodge = false;
  st.log = [];
  const op = b.allies[0];
  op.ref = "ophelia"; op.name = "奥菲莉亚";
  op.skills = (window.GameDataCharactersExtra || []).find(x => x.id === "ophelia")?.skills || [];
  if (${opt.timeStop === true}) op.statuses = ["时停"];
  const guard = b.allies[1];
  guard.hand = ${JSON.stringify(opt.guardHand || [])};
  const foe = b.enemies[0];
  foe.hand = [{ name: "杀", type: "slash", suit: "♠", scale: "attack",
    gatlingRepeats: ${opt.repeats || 2} }];
  b.activeUid = foe.uid; b.phase = 4;
  window.__p = { guardPrompts: 0, _g: false, clicked: 0 };
  if (window.__s) clearInterval(window.__s);
  window.__s = setInterval(() => {
    const bb = window.state && window.state.battle;
    if (!bb) return;
    if (bb.opheliaGuard && !window.__p._g) { window.__p._g = true; window.__p.guardPrompts++; }
    else if (!bb.opheliaGuard) window.__p._g = false;
  }, 20);
  window.render();
  return { guardUid: guard.uid, foeUid: foe.uid };
})()`;

const PLAY = `(() => {
  const st = window.state, b = st.battle;
  const card = b.enemies[0].hand[0];
  window.BattleSystem.useCard(st, b.enemies[0], b.allies[0], card);
  return { ok: true };
})()`;

const SNAP = `(() => {
  const st = window.state, b = st.battle, op = b.allies[0], g = b.allies[1];
  return { p: window.__p, pending: !!b.opheliaGuard, locked: !!b.locked,
    resumeLeft: b.manualDodgeResume ? b.manualDodgeResume.remainingHits : null,
    manualDodge: !!b.manualDodge, opHp: op.hp, guardHp: g.hp,
    guardHand: g.hand.length, log: (st.log || []).slice(-45) };
})()`;

async function drive(page, setup, maxMs = 14000) {
  const clicks = { guard: 0, skip: 0 };
  const end = Date.now() + maxMs;
  while (Date.now() < end) {
    const s = await page.evaluate(SNAP);
    if (s.pending) {
      // 提示条要等效果队列空闲才渲染（docs/original/known-risks.md）。
      // 按钮尚未出现时不能 fallback 去点「跳过」，否则永远走不到出闪分支。
      // 提示条渲染完成 == guardVisible 变 true，此时点角色才会进入
      // selectBattleTarget 的护驾分支；同时等 ActionGuard 空闲，否则点击会被静默丢弃。
      const skipBtn = page.locator("[data-ophelia-guard-skip]").first();
      await skipBtn.waitFor({ state: "visible", timeout: 3000 }).catch(() => {});
      await page.evaluate(`(() => window.BattleActionGuard?.whenIdle?.() || Promise.resolve())()`);
      const btn = page.locator(`[data-target="${setup.guardUid}"]`).first();
      if (await btn.count() && clicks.guard < 2) {
        await btn.click().catch(() => {}); clicks.guard++;
      } else if (clicks.guard === 0 && Date.now() > end - 3000) {
        const skip = page.locator("[data-ophelia-guard-skip]").first();
        if (await skip.count()) { await skip.click().catch(() => {}); clicks.skip++; }
      }
    }
    if (!s.pending && !s.locked && s.resumeLeft == null && !s.manualDodge) {
      await page.waitForTimeout(350);
      const s2 = await page.evaluate(SNAP);
      if (!s2.pending && !s2.locked && s2.resumeLeft == null) break;
    }
    await page.waitForTimeout(160);
  }
  return clicks;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ── A：连击 2 段 + 护驾者有 1 张闪 → 只弹一次护驾窗 ──
  const setupA = await page.evaluate(BASE({ repeats: 2,
    guardHand: [{ name: "闪", type: "response", suit: "♥" }] }));
  await page.evaluate(PLAY);
  const clicksA = await drive(page, setupA);
  const a = await page.evaluate(SNAP);
  console.log("A_SNAP", JSON.stringify({ p: a.p, clicks: clicksA, opHp: a.opHp,
    guardHp: a.guardHp, guardHand: a.guardHand, resumeLeft: a.resumeLeft }));
  T("A1 连击 2 段·护驾者出闪：护驾只弹一次窗（修复前会弹 2 次）",
    a.p.guardPrompts === 1, a.p);
  T("A2 护驾者确实出掉了那张闪",
    a.guardHand === 0 && a.log.some(x => String(x).includes("护驾")), { hand: a.guardHand, log: a.log.slice(-8) });
  T("A3 连击剩余段正常结算、没有残留挂起",
    !a.pending && !a.locked && a.resumeLeft == null && !a.manualDodge
    && a.opHp < 400, { opHp: a.opHp, resumeLeft: a.resumeLeft, locked: a.locked });
  T("A4 结束时护驾转移目标与段数已清空",
    await page.evaluate(`(() => { const b = window.state.battle;
      return !b.opheliaGuardRedirectUid && !b.opheliaGuardRepeats; })()`));

  // ── B：奥菲莉亚被时停 → 不发动非锁定技护驾 ──
  const setupB = await page.evaluate(BASE({ repeats: 2, timeStop: true,
    guardHand: [{ name: "闪", type: "response", suit: "♥" }] }));
  await page.evaluate(PLAY);
  await drive(page, setupB, 9000);
  const b = await page.evaluate(SNAP);
  console.log("B_SNAP", JSON.stringify({ p: b.p, opHp: b.opHp, log: b.log.slice(-8) }));
  T("B1 被时停时护驾一次都不弹（技能失效）",
    b.p.guardPrompts === 0, b.p);
  T("B2 时停下伤害按正常响应链结算、不卡死",
    b.opHp < 400 && !b.pending && !b.locked && !b.manualDodge,
    { opHp: b.opHp, locked: b.locked });

  const rel = relevantErrors(errors);
  T("C1 全程无 pageerror / console error", rel.length === 0, rel.slice(0, 3));
  console.log(`\nRESULT ${passed.filter(Boolean).length}/${passed.length}`);
  await browser.close();
  process.exit(passed.every(Boolean) ? 0 : 1);
})();
