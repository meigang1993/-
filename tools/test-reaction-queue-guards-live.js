// battle-reaction-queue.js 拆分前的护栏用例
// 目的：该文件是多段伤害的续段核心（疯狂刺刀/幻影剑舞/魔之连杀/群体攻击续算
// 都依赖它），且刚被另一 AI 改过（群体续算）。拆分前必须有可回归的护栏，
// 否则一旦导出面漏项或分支优先级被改，剩余段会静默丢失。
// 覆盖：
//   A) 导出面（拆分护栏：漏导出/多导出都会红）
//   B) captureHitContinuation 全分支
//   C) enqueue / flush / requestFlush / pending 语义
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { openGame, startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

function check(name, cond, extra) {
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return cond ? 1 : 0;
}

(async () => {
  let pass = 0, total = 0;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    await openGame(page);
    await startRegressionBattle(page);

    const res = await page.evaluate(() => {
      const Q = window.BattleReactionQueue;
      const out = [];
      const t = (name, cond, extra) => out.push({ name, ok: !!cond, extra });
      if (!Q) return [{ name: "A0 模块存在", ok: false, extra: { Q: null } }];

      // A) 导出面
      const EXPORTED = ["enqueue", "prepend", "damageAction", "directDamageAction",
        "resolvedHitAction", "captureHitContinuation", "flush", "requestFlush", "pending"];
      const missing = EXPORTED.filter(k => typeof Q[k] !== "function");
      t("A1 导出面完整（拆分护栏）", missing.length === 0, { missing });
      const extraKeys = Object.keys(Q).filter(k => !EXPORTED.includes(k));
      t("A2 未多出未知导出", extraKeys.length === 0, { extraKeys });

      // B) captureHitContinuation 分支
      const actor = { uid: "a1" }, target = { uid: "e1" };
      const base = (x = {}) => ({
        allies: [{ uid: "a1", hp: 10 }, { uid: "a2", hp: 10 }],
        enemies: [{ uid: "e1", hp: 10 }],
        locked: false, ...x,
      });
      const cap = (b, remaining = 0, group = null) =>
        Q.captureHitContinuation(b, actor, target, 5, "src", { name: "杀" }, remaining, group);
      const group = {
        card: { name: "群体", targetUids: ["e1", "e2"] },
        targetUids: ["e1", "e2"], nextTargetIndex: 1,
      };

      t("B1 缺 battle 返回 false",
        Q.captureHitContinuation(null, actor, target, 5, "s", {}, 1) === false);

      let b = base({ manualDodge: {} });
      let r = cap(b, 3);
      t("B2 手动闪避提示优先：写 remainingHits 并返回 true",
        r === true && b.manualDodge.remainingHits === 3, b.manualDodge);
      t("B2b 提示分支不入队", !b.reactionQueue, b.reactionQueue);
      let b2 = base({ manualDodge: {} });
      Q.captureHitContinuation(b2, actor, target, 5, "s", { name: "杀" }, 2, group);
      t("B2c 提示分支保留 groupCard", !!b2.manualDodge.groupCard?.targetUids?.length, b2.manualDodge);

      t("B3 未锁定返回 false", cap(base(), 3) === false);

      let b4 = base({ locked: true, pendingVictory: true });
      t("B4 结算中（胜利）返回 true 且不入队",
        cap(b4, 3) === true && !b4.reactionQueue && !b4.manualDodgeResume, b4);

      let b5 = base({ locked: true, kaiichiShare: {} });
      let r5 = cap(b5, 2);
      t("B5 交牌锁定：剩余段入反应队列",
        r5 === true && (b5.reactionQueue || []).length === 2, b5.reactionQueue);
      const q5 = b5.reactionQueue || [];
      t("B5b 入队项均为 damage（且确实有入队）",
        q5.length > 0 && q5.every(a => a.kind === "damage"), q5);
      t("B5c 交牌分支不写 manualDodgeResume", !b5.manualDodgeResume, b5.manualDodgeResume);

      let b6 = base({ locked: true });
      let r6 = cap(b6, 2);
      t("B6 非交牌锁定：写 manualDodgeResume",
        r6 === true && b6.manualDodgeResume?.remainingHits === 2, b6.manualDodgeResume);
      t("B6b 非交牌锁定不入队", !b6.reactionQueue, b6.reactionQueue);

      let b7 = base({ locked: true });
      Q.captureHitContinuation(b7, actor, target, 5, "s", { name: "杀" }, 0, group);
      t("B7 段尽但有后续目标：写 demonInvasionResume",
        !!b7.demonInvasionResume?.targetUids?.length, b7.demonInvasionResume);

      let b8 = base({ locked: true, opheliaGuardRedirectUid: "a2" });
      cap(b8, 1);
      t("B8 护驾重定向到存活友方",
        b8.manualDodgeResume?.targetUid === "a2", b8.manualDodgeResume);

      let b9 = base({ locked: true, opheliaGuardRedirectUid: "dead" });
      cap(b9, 1);
      t("B9 护驾目标已死则回退原目标",
        b9.manualDodgeResume?.targetUid === "e1", b9.manualDodgeResume);

      let b10 = base({ locked: true, kaiichiShareQueue: [1] });
      Q.captureHitContinuation(b10, actor, target, 5, "s", { name: "杀" }, 0, group);
      t("B10 交牌锁定下仍保留群体续算",
        !!b10.demonInvasionResume?.targetUids?.length, b10.demonInvasionResume);

      // C) flush / requestFlush
      const st = window.state, saved = st.battle;
      const spy = [];
      const dmg = (s, tgt, amount) => { spy.push({ uid: tgt?.uid, amount }); return { hpLoss: amount }; };
      const set = bb => { st.battle = bb; };

      let fb = base(); set(fb);
      Q.enqueue(st, [Q.damageAction(actor, target, 5, "s", { name: "杀" }),
        Q.damageAction(actor, target, 5, "s", { name: "杀" })]);
      t("C1 入队后 pending 为真", Q.pending(fb) === true);
      let okF;
      try { okF = Q.requestFlush(st, dmg); } catch (e) { okF = "throw:" + e.message; }
      t("C2 requestFlush 消费队列", okF === true && spy.length === 2, { okF, spy: spy.length });
      t("C3 flush 后 pending 为假", Q.pending(fb) === false);

      let fb2 = base(); set(fb2); spy.length = 0;
      Q.enqueue(st, Q.damageAction(actor, target, 5, "s", {}));
      fb2._reactionFlushing = true;
      const rRe = Q.requestFlush(st, dmg);
      t("C4 flush 进行中：requestFlush 返回 false 且不消费",
        rRe === false && spy.length === 0 && (fb2.reactionQueue || []).length === 1,
        { rRe, spy: spy.length });
      delete fb2._reactionFlushing;

      let fb3 = base({ locked: true }); set(fb3); spy.length = 0;
      Q.enqueue(st, Q.damageAction(actor, target, 5, "s", {}));
      const rLock = Q.requestFlush(st, dmg);
      t("C5 locked 时不消费", rLock === false && spy.length === 0, { rLock, spy: spy.length });

      let fb4 = base(); set(fb4);
      fb4._reactionNested = [];
      Q.enqueue(st, Q.damageAction(actor, target, 5, "s", {}));
      t("C6 flush 期间入队进 _reactionNested（供回插队首）",
        fb4._reactionNested.length === 1 && !fb4.reactionQueue, fb4);
      delete fb4._reactionNested;

      let fb5 = base(); set(fb5); spy.length = 0;
      const many = [];
      for (let i = 0; i < 200; i += 1) many.push(Q.damageAction(actor, target, 1, "s", {}));
      Q.enqueue(st, many);
      try { Q.flush(st, dmg); } catch (e) { /* 记录在下一条 */ }
      t("C7 超过安全上限时清空队列，不死循环",
        !(fb5.reactionQueue || []).length, { len: (fb5.reactionQueue || []).length });

      set(saved);
      return out;
    });

    for (const r of res) { total += 1; pass += check(r.name, r.ok, r.extra); }
    total += 1; pass += check("D 无页面错误", errors.length === 0, errors.slice(0, 3));
    console.log(`\n通过 ${pass} / ${total}`);
  } finally {
    await browser.close();
  }
})();
