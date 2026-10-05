// 诊断：双重打杀在受击方弹窗（半魅魔血交牌）时，反应队列的完整生命周期。
// hook enqueue + flush，逐轮打印：何时入队、谁消费、调用栈、为何返回 false。
// 目的：查清「队列被清空却未执行」究竟发生在哪一步、由谁触发。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const HOOK = [
  "(() => {",
  "  window.__qlog = []; window.__RUNLOG = [];",
  "  const q = window.BattleReactionQueue;",
  "  if (!q || q.__hooked3) return !!q;",
  "  const origEnq = q.enqueue, origFlush = q.flush;",
  "  const detail = b => (b && b.reactionQueue",
  "    ? b.reactionQueue.map(a => a.kind + ':' + a.amount + ' ' + a.actorUid",
  "      + '->' + a.targetUid).join(',')",
  "    : 'null');",
  "  const stack = () => String(new Error().stack || '')",
  "    .split('\\n').slice(2, 5)",
  "    .map(s => s.trim().replace(/^at\\s+/, '').replace(/https?:[^)\\s]*/g, '')",
  "      .replace(/\\s*\\(.*\\)/, ''))",
  "    .filter(s => s && !/probe|playwright|evaluate/.test(s)).join(' < ');",
  "  q.enqueue = function (state, actions) {",
  "    const b = state && state.battle;",
  "    const list = (Array.isArray(actions) ? actions : [actions]).filter(Boolean);",
  "    const st = stack();",
  "    const r = origEnq.call(this, state, actions);",
  "    window.__qlog.push('enqueue x' + list.length + ' ['",
  "      + (list[0] ? list[0].kind + ':' + list[0].amount : '?') + ']'",
  "      + ' -> ' + detail(b) + ' locked=' + !!(b && b.locked)",
  "      + ' share=' + !!(b && b.kaiichiShare) + ' | ' + st);",
  "    return r;",
  "  };",
  "  q.flush = function (state, damage) {",
  "    const b = state && state.battle;",
  "    const before = detail(b);",
  "    const depth = b ? (b._damageDepth || 0) : -1;",
  "    const st = stack();",
  "    const hpOf = () => {",
  "      const a = b && b.allies && b.allies[0];",
  "      return a ? a.hp : -1;",
  "    };",
  "    const hpBefore = hpOf();",
  "    const r = origFlush.call(this, state, damage);",
  "    const hpAfter = hpOf();",
  "    window.__qlog.push('flush [' + before + '] -> [' + detail(b) + ']'",
  "      + ' locked=' + !!(b && b.locked) + ' share=' + !!(b && b.kaiichiShare)",
  "      + ' depth=' + depth + ' hp ' + hpBefore + '->' + hpAfter",
  "      + ' settle=' + !!(b && (b.pendingVictory || b.pendingDefeat",
  "        || b.victoryScreen || b.defeat || b.testComplete))",
  "      + ' ret=' + r + ' | ' + st);",
  "    return r;",
  "  };",
  "  const origCap = q.captureHitContinuation;",
  "  q.captureHitContinuation = function (battle, actor, target, amount,",
  "    source, card, remainingHits, group) {",
  "    const st = stack();",
  "    const r = origCap.call(this, battle, actor, target, amount, source,",
  "      card, remainingHits, group);",
  "    window.__qlog.push('capture remaining=' + remainingHits",
  "      + ' amount=' + amount + ' locked=' + !!(battle && battle.locked)",
  "      + ' share=' + !!(battle && battle.kaiichiShare)",
  "      + ' shareQ=' + ((battle && battle.kaiichiShareQueue || []).length)",
  "      + ' manualDodge=' + !!(battle && battle.manualDodge)",
  "      + ' ret=' + r + ' -> ' + ((battle && battle.reactionQueue || []).length)",
  "      + ' | ' + st);",
  "    return r;",
  "  };",
  "  q.__hooked3 = true;",
  "  return true;",
  "})()",
].join("\n");

const hook = page => page.evaluate(HOOK);
const qlog = page => page.evaluate("(() => window.__qlog || [])()");
const rlog = page => page.evaluate("(() => window.__RUNLOG || [])()");

const snap = page => page.evaluate(`(() => {
  const b = window.state.battle || {};
  return { locked: !!b.locked, share: !!b.kaiichiShare,
    shareQ: (b.kaiichiShareQueue || []).length,
    queue: (b.reactionQueue || []).length,
    resume: b.manualDodgeResume ? b.manualDodgeResume.remainingHits : null,
    anim: (b.animQueue || []).length,
    manualDodge: !!b.manualDodge,
    dodgeUid: b.manualDodge ? (b.manualDodge.uid || b.manualDodge.targetUid || null) : null,
    hand: (b.allies && b.allies[0] && b.allies[0].hand || []).map(c => c.name).join(",") };
})()`);

const logs = page => page.evaluate(
  "(() => (window.state.log || []).map(l => String(l.text || l)))()");
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

const ROUNDS = Number(process.argv[2] || 4);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", e => console.log("PAGEERROR", String(e).slice(0, 160)));

  let bad = 0;
  for (let r = 1; r <= ROUNDS; r += 1) {
    await startRegressionBattle(page);
    await hook(page);
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
        const deck = a.pileStats.deck || a.deck || [];
        const kept = deck.slice();
        if (a.pileStats.deck) a.pileStats.deck = kept;
        if (a.deck) a.deck = kept;
      });
      target.ref = "hoshino_kaiichi";
      target.skills = target.skills || [];
      if (!target.skills.some(s => s.name === "半魅魔血"))
        target.skills.push({ name: "半魅魔血", type: "passive" });
      const card = window.CardUtils.fromEntity("双重打杀", { virtual: false });
      actor.hand = [card];
      b.locked = false; b.animQueue = []; b.reactionQueue = [];
      window.BattleLog.clear(state);
      window.BattleSystem.useCard(state, actor, target, card);
    })()`);

    const t0 = Date.now();
    let seg = 0, last = "", trace = [];
    for (let i = 1; i <= 40; i += 1) {
      await page.waitForTimeout(400);
      const tag = await dismiss(page);
      const s = await snap(page);
      const prev = seg;
      seg = hitLines(await logs(page), "双重打杀").length;
      if (seg !== prev) trace.push(`seg ${prev}->${seg} @${Date.now() - t0}ms (第${i}次, dismiss=${tag || "-"})`);
      last = `${i}:${tag || "-"} seg=${seg} ${JSON.stringify(s)}`;
      if (seg >= 2 && !s.locked && !s.share && !s.queue) break;
    }
    const hpNow = await page.evaluate(
      "(() => window.state.battle.allies[0].hp)()");
    const all = await logs(page);
    const related = all.filter(t => /双重打杀|半魅魔血/.test(t));
    console.log("  掉血: " + (999 - hpNow) + " (期望 20)  含双重打杀/半魅魔血的日志 "
      + related.length + " 条");
    related.forEach(t => console.log("    | " + t));
    const ok = seg >= 2;
    if (!ok) bad += 1;
    console.log(`\n===== 第 ${r} 轮 → 段数=${seg} ${ok ? "OK" : "*** 卡住 ***"} =====`);
    console.log("  末态: " + last);
    trace.forEach(t => console.log("  [时序] " + t));
    console.log("  --- 队列生命周期 ---");
    (await qlog(page)).forEach(t => console.log("   " + t));
    const rl = await rlog(page);
    if (rl.length) { console.log("  --- run 明细 ---"); rl.forEach(t => console.log("   " + t)); }
  }
  console.log(`\n卡住 ${bad} / ${ROUNDS}`);
  await browser.close();
})();
