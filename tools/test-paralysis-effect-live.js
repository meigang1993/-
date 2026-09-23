// 专项实战：麻痹状态牌判定成功后是否真的"本回合无法使用牌"
// 判定成功 → triggers 设 skipPlayPhase=true → 消费点应跳过出牌阶段
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 麻痹牌 statusExpiresEndTurn=true → 我方回合结束即消耗。
// 若在"我方出牌阶段"注入，当回合结束就被消耗，永远等不到下回合准备阶段的判定。
// 正确时序：敌方回合注入 → 我方准备阶段判定 → 我方回合结束消耗。
const setupTpl = `(() => {
  const b = window.state.battle;
  const me = b.allies[0];
  me.hand = [{ name: "杀", type: "kill", suit: "♠" }];
  me.hp = 200;
  me.stats = me.stats || {}; me.stats.handLimit = 99;
  b.allies.slice(1).forEach(u => { u.hand = []; u.hp = 200;
    u.stats = u.stats || {}; u.stats.handLimit = 99; });
  b.enemies.forEach(e => { e.hand = []; e.hp = 200; });
  window.render();
  return { hand: me.hand.map(c => c.name), myUid: me.uid };
})()`;

// 敌方回合给 allies[0] 注入麻痹牌，并把判定顶牌固定为 ♥（判定必定成功）
const forceJudgeTpl = `(() => {
  const b = window.state.battle;
  const me = b.allies[0];
  const enemyTurn = b.activeUid && b.activeUid.startsWith("e");
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
  const me = b.allies[0];
  const act = [...(b.allies || []), ...(b.enemies || [])].find(u => u.uid === b.activeUid);
  const logs = (window.state.log || []).map(String);
  return {
    phase: b.phase,
    activeUid: b.activeUid,
    myUid: me.uid,
    skipPlayPhase: !!me.skipPlayPhase,
    hasParalysis: (me.hand || []).some(c => c.paralysis),
    handNames: (me.hand || []).map(c => c.name),
    judgeLog: logs.find(l => l.includes("麻痹判定")) || null,
    skipLog: logs.find(l => l.includes("跳过出牌阶段")) || null,
    canPlayLog: logs.find(l => l.includes(me.name + " 可以出牌")) || null,
    handCardClasses: [...document.querySelectorAll(".hand-panel .play-card")]
      .map(e => e.className),
    activeName: act?.name || null,
    activeSkip: !!act?.skipPlayPhase,
    activeReason: act?.skipPlayReason || null,
    handPanelLocked: !!document.querySelector(".hand-panel.play-locked"),
    skipTagText: document.querySelector(".hand-skip-tag")?.innerText || null,
    handPanelText: (document.querySelector(".hand-panel .hand-head")?.innerText || ""),
    log: logs.slice(0, 25),
  };
})()`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  const out = { errors, rounds: [] };
  try {
    await startRegressionBattle(page);
    out.setup = await page.evaluate(setupTpl);
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(800);
      // 每轮把 allies[0] 判定顶牌固定为 ♥（判定必定成功）
      const forced = await page.evaluate(forceJudgeTpl);
      const st = await page.evaluate(peekTpl);
      out.rounds.push({ i, forced, phase: st.phase, active: st.activeUid === st.myUid,
        skip: st.skipPlayPhase, judge: st.judgeLog, skipLog: st.skipLog,
        canPlay: st.canPlayLog });
      out.last = st;
      // 判定成功后应出现跳过出牌阶段日志
      if (st.judgeLog && st.judgeLog.includes("本回合无法使用牌")) {
        out.judgeSuccess = true;
        if (!out.shot) {
          await page.screenshot({ path: "/data/workspace/shot-paralysis-locked.png" })
            .then(() => { out.shot = true; })
            .catch(e => { out.shotErr = String(e).slice(0, 120); });
        }
        // UI 层验证：麻痹生效回合是否还能点牌出牌
        if (!out.clickProbe) {
          out.clickProbe = {};
          try {
            const handBtn = page.locator(".hand-panel .play-card").first();
            out.clickProbe.handCardCount = await handBtn.count();
            const endBtn = page.locator("button", { hasText: "结束出牌" }).first();
            out.clickProbe.endPlayVisible = await endBtn.count()
              ? await endBtn.isVisible().catch(() => false) : false;
            out.clickProbe.hasSlash = (st.handNames || []).includes("杀");
            // 尝试真的点一张杀牌
            if (out.clickProbe.handCardCount) {
              await handBtn.click({ timeout: 3000 }).catch(e => {
                out.clickProbe.clickErr = String(e).slice(0, 120); });
              await page.waitForTimeout(500);
              out.clickProbe.afterClickSelected =
                await page.evaluate(() => window.state.battle?.selectedCardIndex ?? null);
            }
          } catch (e) { out.clickProbe.err = String(e).slice(0, 150); }
        }
        if (st.skipLog) { out.skipped = true; break; }
      }
      // 推进回合
      try {
        const skip = page.locator("button", { hasText: "跳过榨取" }).first();
        if (await skip.count() && await skip.isVisible()) await skip.click();
      } catch (e) { /* ignore */ }
      try {
        const btn = page.locator("button", { hasText: "结束出牌" }).first();
        if (await btn.count() && await btn.isVisible()) await btn.click();
      } catch (e) { /* ignore */ }
    }
    out.final = await page.evaluate(peekTpl);
  } catch (e) {
    out.err = String(e).slice(0, 300);
  }
  await page.close();
  await browser.close();
  console.log(JSON.stringify(out, null, 2));
})();
