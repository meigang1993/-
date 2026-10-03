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
  me.hand = me.hand || [];
  if (!me.hand.some(c => c.paralysis)) {
    me.hand.push(window.BattleStatusCardRegistry.create("paralysis"));
    window.BattleStatusCardRegistry.sync(me, b);
  }
  me.deck = me.deck || [];
  me.deck.push({ suit: "♥", name: "判定" });
  return true;
})()`;

// 判定入口就是准备阶段实际调用的那个（battle-prepare-prompts.js:7
// → window.BattleStatusCards.judgement），直接驱动它。
// 不走「点结束出牌 → 敌方回合推进」——那条链路实测停在准备阶段、
// 敌方永不出牌，会让本场景永远跑不到判定（此前表现为「未跑到判定」）。
const runJudgeTpl = `(() => {
  const b = window.state.battle;
  const me = b.allies[0];
  window.BattleStatusCards.judgement(window.state, me);
  window.BattleEffects.recover(window.state);
  b.activeUid = me.uid; b.phase = 4; b.locked = false;
  window.render();
  return { skip: !!me.skipPlayPhase, reason: me.skipPlayReason || null };
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
    await page.evaluate(forceJudgeTpl);
    out.judgeRun = await page.evaluate(runJudgeTpl);
    await page.waitForTimeout(400);
    const st = await page.evaluate(peekTpl);
    const ui = await page.evaluate(checkTpl);
    out.realJudge = { ...st, ...ui };
    t("真实判定成功", !!st.judgeLog && st.judgeLog.includes("跳过出牌阶段"),
      { log: st.judgeLog });
    t("真实判定：判定日志含麻痹", /麻痹/.test(String(st.judgeLog || "")),
      { v: st.judgeLog });
    t("真实判定：单位被置为跳过出牌（原因=麻痹）",
      ui.activeSkip && ui.activeReason === "麻痹",
      { activeSkip: ui.activeSkip, reason: ui.activeReason });
    t("真实判定：被麻痹当回合手牌面板显示锁定提示",
      ui.panelLocked && /麻痹/.test(String(ui.skipTag || "")),
      { panelLocked: ui.panelLocked, tag: ui.skipTag });
  } catch (e) {
    out.err = String(e).slice(0, 300);
  }
  await page.close();
  await browser.close();
  out.summary = `通过 ${out.pass.length} / 失败 ${out.fail.length}`;
  console.log(JSON.stringify(out, null, 2));
  // 失败必须让退出码非零，否则 CI 恒绿（此前只打印不设码，属假通过）。
  // out.err 现已计入：场景B 依赖 reload 后重开局，此前「点击无响应」是因为
  // 有存档时点新游戏会弹覆盖确认框，startFreshGame 没点确认（非环境问题），
  // 已在 tests/helpers/preview-game.js 修好，故不再豁免。
  if (out.err) out.fail.push({ name: "场景B 执行异常", v: out.err });
  process.exitCode = out.fail.length ? 1 : 0;
})();
