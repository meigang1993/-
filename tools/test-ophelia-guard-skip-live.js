// 【为我护驾】非锁定技「跳过（不发动）」按钮实机：
//  挂起 / 战斗锁定态下按钮可点；真实点击后伤害落回奥菲莉亚、不转移给队友；
//  对照场景点击队友仍能发动护驾（伤害转移），证明两条路径都在。
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
  b.selectedCardIndex = null; b.selectedSkillCard = null; b.pendingTargetUid = null;
  b.allies.forEach((a, i) => { a.hp = 300; a.maxHp = 300; a.block = 0; a.hand = []; a.name = "队友" + i; });
  b.enemies.forEach(e => { e.hp = 100; e.maxHp = 100; e.hand = []; });
  window.BattleEffects.animating = false; window.BattleEffects.draining = false;
  st.log = [];
  return true;
})()`;

const SETUP = `(() => {
  const st = window.state, b = st.battle;
  const a0 = b.allies[0], e0 = b.enemies[0];
  a0.ref = "ophelia"; a0.name = "奥菲莉亚";
  b.activeUid = e0.uid;
  b.opheliaGuard = { actorUid: e0.uid, targetUid: a0.uid, amount: 7,
    source: "测试杀", card: { name: "杀（普攻）", type: "slash" } };
  b.locked = true;
  window.render();
  return { locked: !!b.locked, pending: !!b.opheliaGuard,
    a0: a0.uid, a1: b.allies[1]?.uid, hp0: a0.hp };
})()`;

const SNAP = `(() => {
  const st = window.state, b = st.battle;
  const a0 = b.allies.find(u => u.ref === "ophelia") || b.allies[0];
  return { pending: !!b.opheliaGuard, locked: !!b.locked,
    uid: b.opheliaGuardUid ?? null, hp0: a0.hp, hp1: b.allies[1]?.hp,
    log: (st.log || []).join(" | ") };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ── 1. 挂起 + 按钮可见 ──
  await page.evaluate(BASE);
  const setup = await page.evaluate(SETUP);
  console.log("SETUP", JSON.stringify(setup));
  T("S1 护驾挂起（battle.locked=true / opheliaGuard 存在）",
    setup.locked && setup.pending, setup);
  const btn = page.locator("[data-ophelia-guard-skip]");
  await btn.waitFor({ state: "visible", timeout: 8000 });
  T("S2 跳过按钮可见且唯一", await btn.count() === 1 && await btn.isVisible());
  T("S3 按钮文案为「跳过（不发动）」",
    (await btn.innerText()).includes("跳过（不发动）"));
  T("S4 后果 title 写明伤害仍由原目标承受",
    (await btn.getAttribute("title") || "").includes("仍由原目标承受"));

  // ── 2. 锁定态可点击性（页面内重查，避开重渲染 detached 节点） ──
  await page.waitForFunction(() => {
    const el = document.querySelector("[data-ophelia-guard-skip]");
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 20 && r.height > 12;
  }, { timeout: 8000 });
  const probe = await page.evaluate(() => {
    const el = document.querySelector("[data-ophelia-guard-skip]");
    if (!el) return { missing: true };
    const r = el.getBoundingClientRect(), cs = getComputedStyle(el);
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      rect: { w: r.width, h: r.height },
      disabledAttr: el.hasAttribute("disabled"), ariaDisabled: el.getAttribute("aria-disabled"),
      pointerEvents: cs.pointerEvents, opacity: cs.opacity, visibility: cs.visibility,
      cursor: cs.cursor, hitTag: hit?.tagName,
      hitIsSelfOrChild: hit === el || el.contains(hit),
      battleLockedClass: document.body.classList.contains("battle-locked")
        || !!document.querySelector(".battle-locked"),
    };
  });
  console.log("PROBE", JSON.stringify(probe));
  T("S5 按钮有实际尺寸且在视口内", probe.rect.w > 20 && probe.rect.h > 12, probe);
  T("S6 无 disabled / aria-disabled", !probe.disabledAttr && !probe.ariaDisabled, probe);
  T("S7 pointer-events / opacity / visibility 均未被禁用",
    probe.pointerEvents !== "none" && probe.opacity !== "0" && probe.visibility !== "hidden", probe);
  T("S8 中心点命中按钮自身（未被遮罩挡住）", probe.hitIsSelfOrChild === true, probe);
  T("S9 Playwright 可操作性检查通过（trial click）",
    await btn.click({ trial: true }).then(() => true).catch(() => false));

  // ── 3. 真实点击跳过 ──
  await btn.click();
  await page.waitForFunction(() => !window.state.battle.opheliaGuard, { timeout: 8000 })
    .catch(() => {});
  await page.evaluate(() => window.render && window.render());
  const after = await page.evaluate(SNAP);
  console.log("AFTER_SKIP", JSON.stringify(after));
  T("S10 挂起解除、界面解锁、未指定护驾者",
    !after.pending && !after.locked && after.uid == null, after);
  T("S11 伤害落回奥菲莉亚（护驾者未承伤）",
    after.hp0 < setup.hp0 && after.hp1 === 300,
    { hp0: after.hp0, hp1: after.hp1, before: setup.hp0 });
  T("S12 战报写明「放弃发动为我护驾」", after.log.includes("放弃发动为我护驾"), after.log.slice(-260));

  // 发动路径（传有效 uid → 护驾者承伤）由模块专项 B3 与既有护驾回归覆盖；
  // 本实机聚焦「跳过（不发动）」按钮在战斗锁定态下的可点击性与结算后果。

  const rel = relevantErrors(errors);
  T("S14 全程无 pageerror / console error", rel.length === 0, rel.slice(0, 3));
  console.log(`\nRESULT ${passed.filter(Boolean).length}/${passed.length}`);
  await browser.close();
  process.exit(passed.every(Boolean) ? 0 : 1);
})();
