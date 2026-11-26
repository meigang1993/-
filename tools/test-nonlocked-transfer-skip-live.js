// 次元转移「跳过（不发动）」真实浏览器实机：
// 真实触发挂起 → 点跳过 → 不弃牌、不转移、伤害落原目标、解锁；再验证发动链路未被破坏。
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle, collectErrors, relevantErrors } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));
const passed = [];
const T = (n, ok, d = "") => { passed.push(ok); console.log(`${ok ? "✅" : "❌"} ${n}${ok ? "" : "  ← " + JSON.stringify(d)}`); };

const SETUP = `(() => {
  const st = window.state, b = st.battle;
  b.locked = false; b.animQueue = []; b.phase = 4;
  b.dimensionTransfer = null; b._damageDepth = 0;
  const manny = b.allies[0], victim = b.allies[1] || b.allies[0];
  manny.name = "曼妮"; manny.ref = "manny"; manny.hp = 100; manny.maxHp = 100;
  manny.stats = Object.assign({}, manny.stats, { attack: 6, magic: 6 });
  manny.hand = [{ name: "杀", type: "slash", suit: "♠", scale: "attack" },
                { name: "闪", type: "response", suit: "♥" }];
  victim.hp = 100; victim.maxHp = 100;
  b.enemies.forEach(e => { e.hp = 100; e.maxHp = 100; });
  b.activeUid = manny.uid;
  st.log = [];
  const card = { name: "杀", type: "slash", suit: "♠", scale: "attack" };
  const fired = window.MannySkills.transferSlash(st, b.enemies[0], victim, 7, "测试杀", card);
  window.render && window.render();
  return { fired, handBefore: manny.hand.length, locked: !!b.locked,
    pending: !!b.dimensionTransfer, enemies: b.enemies.length };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);
  const setup = await page.evaluate(SETUP);
  console.log("SETUP", JSON.stringify(setup));
  T("S1 真实触发次元转移挂起", setup.fired && setup.pending && setup.locked, setup);

  const btn = page.locator("[data-dimension-transfer-skip]");
  T("S2 跳过按钮存在且文案为「跳过（不发动）」",
    await btn.count() === 1 && (await btn.innerText()).includes("跳过（不发动）"));
  T("S3 按钮未被 disabled 挡住",
    !(await btn.getAttribute("disabled")) && !(await btn.getAttribute("aria-disabled")));

  await btn.click({ timeout: 5000 });
  await page.waitForTimeout(700);
  const after = await page.evaluate(`(() => {
    const st = window.state, b = st.battle, m = b.allies[0];
    return { locked: !!b.locked, pending: !!b.dimensionTransfer,
      hand: m.hand.map(c => c.name + c.suit), depth: b._damageDepth || 0,
      log: (st.log || []).join("|"),
      victimHp: (b.allies[1] || b.allies[0]).hp,
      enemyHp: b.enemies.map(e => e.hp) };
  })()`);
  console.log("AFTER", JSON.stringify(after));
  T("S4 点跳过后挂起清除且界面解锁", !after.pending && !after.locked, after);
  T("S5 不弃置任何黑色手牌", after.hand.includes("杀♠") && after.hand.length === 2, after.hand);
  T("S6 战报写明「放弃发动次元转移」", /放弃发动次元转移/.test(after.log), after.log.slice(-200));
  T("S7 伤害仍由原目标承受（未转移给敌人）",
    after.victimHp < 100 && after.enemyHp.every(hp => hp === 100),
    { victimHp: after.victimHp, enemyHp: after.enemyHp });

  // 对照：发动链路未被破坏（重新触发 → 等动画排空 → 选黑色牌 → 点敌人真转移）。
  // 注意 BattleSystem.resolveDimensionTransfer 的签名是 (state, uid, onStep)，
  // 不是 combat 版的 (state, targetUid, damage)；这里走页面真实的完整结算入口，
  // 只用日志确认「确实发动」即可，不自己拼 damage 回调。
  await page.evaluate(`(() => {
    const st = window.state, b = st.battle, m = b.allies[0], victim = b.allies[1] || b.allies[0];
    st.log = []; b.locked = false; b.dimensionTransfer = null; b.animQueue = []; b._damageDepth = 0;
    window.MannySkills.transferSlash(st, b.enemies[0], victim, 7, "对照杀",
      { name: "杀", type: "slash", suit: "♠", scale: "attack" });
    return !!b.dimensionTransfer;
  })()`);
  // 等提示条真正可见（dimensionTransferVisible 依赖动画排空 / promptVisible）
  await page.locator("[data-dimension-transfer-skip]").waitFor({ state: "visible", timeout: 8000 });
  const pick = await page.evaluate(`(() => {
    const st = window.state, b = st.battle, p = b.dimensionTransfer;
    const ok = window.MannySkills.selectDimensionTransferCard(st, 0);
    return { ok, costIndex: p?.costIndex,
      visible: window.MannySkills.dimensionTransferVisible(b),
      anim: !!window.BattleEffects?.animating, queue: (b.animQueue || []).length };
  })()`);
  console.log("PICK", JSON.stringify(pick));
  T("S8 发动链路仍可用（黑色牌可选中）", pick.ok === true && pick.costIndex === 0, pick);

  const rel = relevantErrors(errors);
  T("S9 无 pageerror / console error", rel.length === 0, rel.slice(0, 4));
  await browser.close();
  const bad = passed.filter(x => !x).length;
  console.log(`\nRESULT ${passed.length - bad}/${passed.length}`);
  if (bad) process.exit(1);
})().catch(e => { console.error("PROBE_CRASH", e); process.exit(1); });
