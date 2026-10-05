// 诊断：双重打杀在受击方弹窗时，为什么有时会只结算 1 段。
// 跑多轮，逐轮打印完整状态，抓出卡住那一轮的差异。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const snap = page => page.evaluate(`(() => {
  const b = window.state.battle || {};
  return {
    locked: !!b.locked,
    kaiichiShare: !!b.kaiichiShare,
    shareQueue: (b.kaiichiShareQueue || []).length,
    resume: b.manualDodgeResume ? b.manualDodgeResume.remainingHits : null,
    anim: (b.animQueue || []).length,
    queue: (b.reactionQueue || b.pendingActions || []).length,
  };
})()`);

const dom = page => page.evaluate(`(() => {
  const sels = ["[data-kaiichi-share-skip]", "[data-kaiichi-share-confirm]",
    "[data-kaiichi-share]", "[data-share-window]", "[data-kaiichi-share-card]"];
  return sels.map(s => s + ":" + document.querySelectorAll(s).length).join(" ");
})()`);

const logs = page => page.evaluate(
  `(() => (window.state.log || []).map(l => String(l.text || l)))()`);
const hitLines = (all, src) =>
  all.filter(t => t.includes(src) && /造成\d+伤害/.test(t));

async function dismiss(page) {
  return page.evaluate(`(() => {
    const el = document.querySelector(
      "[data-kaiichi-share-skip], [data-dimension-transfer-skip]");
    if (!el) return null;
    el.click();
    return "clicked";
  })()`);
}


// 拦截 flush，记录每次调用前后的队列长度，追查是谁清空了队列
const installHook = page => page.evaluate(`(() => {
  window.__flushLog = [];
  const q = window.BattleReactionQueue;
  if (!q || q.__hooked) return !!q;
  const orig = q.flush;
  q.flush = function (state, damage) {
    const b = state?.battle;
    const before = b ? (b.reactionQueue ? b.reactionQueue.length : "null") : "noBattle";
    const r = orig.call(this, state, damage);
    const after = b ? (b.reactionQueue ? b.reactionQueue.length : "null") : "noBattle";
    window.__flushLog.push(\`flush before=\${before} after=\${after} locked=\${!!(b&&b.locked)} share=\${!!(b&&b.kaiichiShare)} ret=\${r}\`);
    return r;
  };
  q.__hooked = true;
  return true;
})()`);
const flushLog = page => page.evaluate(`(() => window.__flushLog || [])()`);

const ROUNDS = Number(process.argv[2] || 6);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", e => console.log("PAGEERROR", String(e).slice(0, 160)));

  let bad = 0;
  for (let r = 1; r <= ROUNDS; r += 1) {
    await startRegressionBattle(page);
    await installHook(page);
    await page.evaluate(`(() => {
      const state = window.state, b = state.battle;
      const actor = b.enemies[0];
      actor.hp = 500; actor.maxHp = 500; actor.intent = 9;
      actor.stats = actor.stats || {};
      actor.stats.attack = 10; actor.stats.magic = 10;
      actor.tempAttack = 0; actor.tempMagic = 0;
      const target = b.allies[0];
      b.allies.forEach(a => {
        a.hand = []; a.hp = 999; a.maxHp = 999;
        a.pileStats = a.pileStats || {};
        a.pileStats.discard = [];
      });
      target.ref = "hoshino_kaiichi";
      ["半魅魔血"].forEach(name => {
        target.skills = target.skills || [];
        if (!target.skills.some(s => s.name === name))
          target.skills.push({ name, type: "passive" });
      });
      const card = window.CardUtils.fromEntity("双重打杀", { virtual: false });
      actor.hand = [card];
      b.locked = false; b.animQueue = []; b.reactionQueue = [];
      window.BattleLog.clear(state);
      window.BattleSystem.useCard(state, actor, target, card);
    })()`);

    const trace = [];
    let seg = 0;
    for (let i = 1; i <= 40; i += 1) {
      await page.waitForTimeout(400);
      const tag = await dismiss(page);
      const s = await snap(page);
      const d = await dom(page);
      seg = hitLines(await logs(page), "双重打杀").length;
      trace.push(`${i}:${tag || "-"} seg=${seg} ${JSON.stringify(s)} | ${d}`);
      if (seg >= 2) break;
    }
    const ok = seg >= 2;
    if (!ok) bad += 1;
    console.log(`\n===== 第 ${r} 轮 → 段数=${seg} ${ok ? "OK" : "*** 卡住 ***"} =====`);
    if (!ok) { trace.forEach(t => console.log("  " + t));
      console.log("  --- flush 调用记录 ---");
      (await flushLog(page)).forEach(t => console.log("   " + t)); }
    else console.log("  " + trace[trace.length - 1]);
  }
  console.log(`\n卡住 ${bad} / ${ROUNDS}`);
  await browser.close();
})();
