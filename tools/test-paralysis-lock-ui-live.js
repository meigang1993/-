// 专项实战：麻痹（跳过出牌阶段）时手牌是否"锁定变灰"并给出原因提示。
// 场景A（UI 渲染层）：直接构造 skipPlayPhase=麻痹 + 出牌阶段，检查手牌灰化与标签。
// 场景B（真实判定）：敌方回合注入麻痹牌 → 我方准备阶段判定成功 → 抓活跃当回合的 UI。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 场景A：构造麻痹锁定 + 出牌阶段
const lockTpl = `(() => {
  const b = window.state.battle;
  const me = b.allies[0];
  me.hand = [{ name: "杀", type: "kill", suit: "♠" },
             { name: "闪", type: "response", suit: "♥" }];
  me.skipPlayPhase = true;
  me.skipPlayReason = "麻痹";
  b.activeUid = me.uid;
  b.phase = 4;
  b.locked = false;
  window.render();
  return { name: me.name, hand: me.hand.map(c => c.name) };
})()`;

// 对照：解除麻痹，同样出牌阶段，手牌应恢复可选
const unlockTpl = `(() => {
  const b = window.state.battle;
  const me = b.allies[0];
  me.skipPlayPhase = false;
  me.skipPlayReason = null;
  b.activeUid = me.uid;
  b.phase = 4;
  b.locked = false;
  window.render();
  return true;
})()`;

const checkTpl = `(() => {
  const cards = [...document.querySelectorAll(".hand-panel .play-card")];
  const act = [...(window.state.battle.allies || []), ...(window.state.battle.enemies || [])]
    .find(u => u.uid === window.state.battle.activeUid);
  return {
    panelLocked: !!document.querySelector(".hand-panel.play-locked"),
    skipTag: document.querySelector(".hand-skip-tag")?.innerText || null,
    cardCount: cards.length,
    allDisabled: cards.length > 0 && cards.every(e => e.classList.contains("disabled")),
    filter: cards.length ? getComputedStyle(cards[0]).filter : null,
    activeName: act?.name || null,
    activeSkip: !!act?.skipPlayPhase,
    activeReason: act?.skipPlayReason || null,
  };
})()`;

// 场景B：敌方回合注入麻痹牌，并把判定顶牌固定为 ♥（必定判定成功）
const forceJudgeTpl = `(() => {
  const b = window.state.battle;
  const me = b.allies[0];
  const enemyTurn = b.activeUid && String(b.activeUid).startsWith("e");
  if (enemyTurn && !(me.hand || []).some(c => c.paralysis)) {
    me.hand.push(window.BattleStatusCardRegistry.create("paralysis"));
    window.BattleStatusCardRegistry.sync(me, b);
  }
  if (!(me.hand || []).some(c => c.paralysis)) return false;
  me.deck = me.deck || [];
  me.deck.push({ suit: "♥", name: "判定" });
  return true;
})()`;

const peekTpl = `(() => {
  const b = window.state.battle;
  const logs = (window.state.log || []).map(String);
  return {
    judgeLog: logs.find(l => l.includes("麻痹判定")) || null,
    skipLog: logs.find(l => l.includes("跳过出牌阶段")) || null,
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const out = { errors, pass: [], fail: [] };
  const t = (name, ok, info) => (ok ? out.pass : out.fail)
    .push({ name, ...(info || {}) });
  try {
    await startRegressionBattle(page);
    await page.waitForTimeout(600);

    // 场景A：麻痹锁定
    out.lockSetup = await page.evaluate(lockTpl);
    await page.waitForTimeout(300);
    const locked = await page.evaluate(checkTpl);
    out.locked = locked;
    t("麻痹锁定：手牌面板带 play-locked 类", locked.panelLocked, { v: locked.panelLocked });
    t("麻痹锁定：显示原因标签", /麻痹/.test(String(locked.skipTag || "")), { v: locked.skipTag });
    t("麻痹锁定：手牌全部 disabled", locked.allDisabled, { v: locked.allDisabled });
    t("麻痹锁定：手牌灰化 filter 生效（含 brightness 增强）",
      /grayscale/.test(String(locked.filter || ""))
      && /brightness/.test(String(locked.filter || "")), { v: locked.filter });
    await page.screenshot({ path: "/data/workspace/shot-paralysis-locked.png" }).catch(() => {});

    // 对照：解除麻痹后不应再有锁定
    await page.evaluate(unlockTpl);
    await page.waitForTimeout(300);
    const free = await page.evaluate(checkTpl);
    out.free = free;
    t("对照：解除麻痹后无 play-locked", !free.panelLocked, { v: free.panelLocked });
    t("对照：解除麻痹后无原因标签", !free.skipTag, { v: free.skipTag });

    // 场景B：真实判定（重新开局，避免场景A 构造的状态污染）
    // startRegressionBattle 需要从大厅(.villa-hall)起步，故先 reload 回大厅
    await page.reload();
    await page.waitForTimeout(1200);
    await startRegressionBattle(page);
    await page.waitForTimeout(600);
    let judged = false;
    for (let i = 0; i < 120 && !judged; i++) {
      await page.waitForTimeout(250);
      await page.evaluate(forceJudgeTpl);
      const st = await page.evaluate(peekTpl);
      const ui = await page.evaluate(checkTpl);
      if (ui.activeSkip && !out.skipUi) out.skipUi = ui;
      if (st.judgeLog && st.judgeLog.includes("本回合无法使用牌")) {
        judged = true;
        out.realJudge = { ...st, ...ui };
        t("真实判定成功", true, { log: st.judgeLog });
        t("真实判定：跳过出牌阶段日志含麻痹", /麻痹/.test(String(st.skipLog || "")),
          { v: st.skipLog });
        if (out.skipUi) {
          t("真实判定：被麻痹当回合手牌面板显示锁定提示",
            out.skipUi.panelLocked && /麻痹/.test(String(out.skipUi.skipTag || "")),
            { panelLocked: out.skipUi.panelLocked, tag: out.skipUi.skipTag });
        }
      }
      try {
        const skip = page.locator("button", { hasText: "跳过榨取" }).first();
        if (await skip.count() && await skip.isVisible()) await skip.click();
      } catch (e) { /* ignore */ }
      try {
        const btn = page.locator("button", { hasText: "结束出牌" }).first();
        if (await btn.count() && await btn.isVisible()) await btn.click();
      } catch (e) { /* ignore */ }
    }
    if (!judged) t("真实判定成功", false, { note: "未跑到判定" });
  } catch (e) {
    out.err = String(e).slice(0, 300);
  }
  await page.close();
  await browser.close();
  out.summary = `通过 ${out.pass.length} / 失败 ${out.fail.length}`;
  console.log(JSON.stringify(out, null, 2));
})();
