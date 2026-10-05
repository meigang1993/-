// 诊断：双重打杀第二段「flush 消费了 damage:10 却没掉血」——hook damage/directDamage
// 内部，记录每次调用的入参、locked、_damageDepth、返回 hpLoss 与调用栈，钉死原因。
// 用法: node tools/probe-double-slash-damage.js <轮数>
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 在页面脚本执行前拦截工厂赋值，包装返回的 damage / directDamage。
const INIT = `(() => {
  window.__dlog = [];
  const stack = () => String(new Error().stack || "")
    .split("\\n").slice(3, 7)
    .map(s => s.trim().replace(/^at\\s+/, "")
      .replace(/https?:[^)\\s]*/g, "").replace(/\\s*\\(.*\\)/, ""))
    .filter(s => s && !/probe|playwright|evaluate/.test(s)).join(" < ");
  const wrapFactory = (name, wrap) => {
    let inner;
    Object.defineProperty(window, name, {
      configurable: true,
      get: () => inner,
      set: v => {
        inner = function (...a) {
          const obj = v.apply(this, a);
          try { if (obj) wrap(obj); } catch (e) { window.__dlog.push("wrapErr " + e); }
          return obj;
        };
      },
    });
  };
  wrapFactory("BattleDamageLifecycle", obj => {
    const od = obj.damage, odd = obj.directDamage;
    obj.damage = function (state, target, amount, source, actor, card) {
      const b = state && state.battle;
      const pre = JSON.stringify({ hp: target && target.hp,
        locked: !!(b && b.locked), depth: (b && b._damageDepth) || 0,
        share: !!(b && b.kaiichiShare), q: ((b && b.reactionQueue) || []).length,
        anim: ((b && b.animQueue) || []).length });
      const r = od.apply(this, arguments);
      const post = JSON.stringify({ hp: target && target.hp,
        locked: !!(b && b.locked), depth: (b && b._damageDepth) || 0,
        share: !!(b && b.kaiichiShare), q: ((b && b.reactionQueue) || []).length,
        anim: ((b && b.animQueue) || []).length });
      window.__dlog.push("damage amt=" + amount + " tgt=" + (target && target.uid)
        + " src=" + source + " card=" + (card && card.name)
        + " | " + pre + " -> " + post
        + " | ret=" + JSON.stringify({ hpLoss: r && r.hpLoss, dodged: r && r.dodged })
        + " | " + stack());
      return r;
    };
    obj.directDamage = function (state, target, amount) {
      const b = state && state.battle;
      const hp0 = target && target.hp;
      const pre = JSON.stringify({ locked: !!(b && b.locked),
        depth: (b && b._damageDepth) || 0, share: !!(b && b.kaiichiShare),
        q: ((b && b.reactionQueue) || []).length });
      const r = odd.apply(this, arguments);
      window.__dlog.push("  directDamage amt=" + amount + " tgt=" + (target && target.uid)
        + " hp " + hp0 + "->" + (target && target.hp)
        + " hpLoss=" + (r && r.hpLoss) + " | " + pre + " | " + stack());
      return r;
    };
  });
  wrapFactory("BattleDamageUtils", obj => {
    const od = obj.directDamage;
    obj.directDamage = function (state, target, amount, source) {
      const hp0 = target && target.hp;
      const r = od.apply(this, arguments);
      window.__dlog.push("    utils.directDamage amt=" + amount + " src=" + source
        + " tgt=" + (target && target.uid) + " hp " + hp0 + "->" + (target && target.hp)
        + " hpLoss=" + (r && r.hpLoss));
      return r;
    };
  });
})()`;

const dlog = page => page.evaluate("(() => window.__dlog || [])()");
const logs = page => page.evaluate(
  "(() => (window.state.log || []).map(l => String(l.text || l)))()");
const hitLines = (all, src) =>
  all.filter(t => t.includes(src) && /造成\d+伤害/.test(t));

const snap = page => page.evaluate(`(() => {
  const b = window.state.battle || {};
  return { locked: !!b.locked, share: !!b.kaiichiShare,
    shareQ: (b.kaiichiShareQueue || []).length,
    queue: (b.reactionQueue || []).length,
    resume: b.manualDodgeResume ? b.manualDodgeResume.remainingHits : null,
    anim: (b.animQueue || []).length, manualDodge: !!b.manualDodge,
    hand: (b.allies && b.allies[0] && b.allies[0].hand || []).map(c => c.name).join(",") };
})()`);

async function dismiss(page) {
  return page.evaluate(`(() => {
    const el = document.querySelector(
      "[data-kaiichi-share-skip], [data-dimension-transfer-skip]");
    if (!el) return null;
    el.click(); return "clicked";
  })()`);
}

const ROUNDS = Number(process.argv[2] || 4);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", e => console.log("PAGEERROR", String(e).slice(0, 160)));
  await page.addInitScript(INIT);

  let bad = 0;
  for (let r = 1; r <= ROUNDS; r += 1) {
    await startRegressionBattle(page);
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
        a.pileStats = a.pileStats || {}; a.pileStats.discard = [];
        // 排除【闪】干扰：受击方摸到闪会合法抵消第二段（非 BUG），
        // 会掩盖"段是否真的结算"这一被测点。
        const deck = a.pileStats.deck || a.deck || [];
        const kept = deck.filter(c => c && c.type !== "response");
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

    let seg = 0, last = "";
    for (let i = 1; i <= 40; i += 1) {
      await page.waitForTimeout(400);
      const tag = await dismiss(page);
      const s = await snap(page);
      seg = hitLines(await logs(page), "双重打杀").length;
      last = `${i}:${tag || "-"} seg=${seg} ${JSON.stringify(s)}`;
      if (seg >= 2 && !s.locked && !s.share && !s.queue) break;
    }
    const hpNow = await page.evaluate("(() => window.state.battle.allies[0].hp)()");
    const ok = seg >= 2;
    if (!ok) bad += 1;
    console.log(`\n===== 第 ${r} 轮 → 段数=${seg} ${ok ? "OK" : "*** 卡住 ***"} 掉血=${999 - hpNow} =====`);
    console.log("  末态: " + last);
    const dl = await dlog(page);
    console.log("  --- damage 调用序列 (共 " + dl.length + " 条"
      + (ok ? "，仅前 8 条" : "，全部") + ") ---");
    (ok ? dl.slice(0, 8) : dl).forEach(t => console.log("   " + t));
    if (!ok) {
      const all = await logs(page);
      console.log("    --- 全部日志 (共 " + all.length + " 条) ---");
      all.forEach(t => console.log("    | " + t));
      console.log("    --- 末态全部友方手牌 ---");
      console.log("    | " + await page.evaluate(`(() => (window.state.battle.allies || [])
        .map(a => a.name + "[" + (a.hand || []).map(c => c.name).join(",") + "]").join(" ; "))()`));
      console.log("    --- 弃牌堆 ---");
      console.log("    | " + await page.evaluate(`(() => (window.state.battle.allies || [])
        .map(a => a.name + "{" + ((a.pileStats && a.pileStats.discard) || []).map(c => c.name).join(",") + "}").join(" ; "))()`));
    }
  }
  console.log(`\n卡住 ${bad} / ${ROUNDS}`);
  await browser.close();
})();
