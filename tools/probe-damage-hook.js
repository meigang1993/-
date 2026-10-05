// 诊断：hook damage 内部——记录每次调用的 locked 值、目标、入参、是否真正进入
// resolveDamage、以及返回 hpLoss。目的：钉死「队列清空却未掉血」发生在哪一层。
// 用法: node tools/probe-damage-hook.js [轮数]
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

// 在页面脚本执行前拦截 window.BattleDamageLifecycle 的赋值，
// 包装其返回对象上的 damage —— 因 battle-damage.js 构造时就取了引用，
// 事后替换 window 上的函数无效，只能拦属性写入。
// 拦截 BattleDamageResolution —— lifecycle 里 getResolveDamage 是
// `() => resolution.resolveDamage`，包装该对象的属性才能真正捕获到。
const INIT_RESOLUTION = () => {
  let real = null, wrapped = null;
  Object.defineProperty(window, "BattleDamageResolution", {
    configurable: true,
    get() { return wrapped || real; },
    set(fn) {
      real = fn;
      wrapped = function (cfg) {
        const obj = fn(cfg);
        const orig = obj.resolveDamage;
        if (typeof orig !== "function") return obj;
        obj.resolveDamage = function (state, target, amount, source, actor, card) {
          const b = state && state.battle;
          const r = orig.apply(this, arguments);
          (window.__dtrace ||= []).push({
            n: -1, kind: "resolve", locked: !!(b && b.locked),
            amt: amount, tUid: target && target.uid, tHp: target && target.hp,
            hpLoss: r && r.hpLoss, dodged: !!(r && r.dodged),
            hpAfter: target && target.hp,
            hand: (target && target.hand || []).map(c => c.name).join(","),
          });
          return r;
        };
        return obj;
      };
    },
  });
};

const INIT = () => {
  window.__dtrace = [];
  let real = null;
  let wrapped = null;
  Object.defineProperty(window, "BattleDamageLifecycle", {
    configurable: true,
    get() { return wrapped || real; },
    set(fn) {
      real = fn;
      wrapped = function (cfg) {
        const obj = fn(cfg);
        let cur = null;
        if (cfg && typeof cfg.getResolveDamage === "function") {
          const origGet = cfg.getResolveDamage;
          cfg.getResolveDamage = () => {
            const rd = origGet();
            return function (state, target, amount, source, actor, card) {
              const r = rd(state, target, amount, source, actor, card);
              if (cur) {
                cur.resolveHpLoss = r && r.hpLoss;
                cur.resolveDodged = !!(r && r.dodged);
              }
              return r;
            };
          };
        }
        const origDamage = obj.damage;
        obj.damage = function (state, target, amount, source, actor, card) {
          const b = state && state.battle;
          const st = String(new Error().stack || "")
            .split("\n").slice(2, 5)
            .map(s => s.trim().replace(/^at\s+/, "")
              .replace(/https?:[^)\s]*/g, "").replace(/\s*\(.*\)/, ""))
            .filter(s => s && !/probe|playwright|evaluate/.test(s)).join(" < ");
          const rec = {
            n: window.__dtrace.length, locked: !!(b && b.locked),
            amt: amount, tUid: target && target.uid, tHp: target && target.hp,
            srcUid: actor && actor.uid, source: String(source || ""),
            depth: b ? (b._damageDepth || 0) : -1,
            share: !!(b && b.kaiichiShare),
            shareQ: (b && b.kaiichiShareQueue || []).length,
            q: (b && b.reactionQueue || []).length,
            resolveHpLoss: null, resolveDodged: null, retHpLoss: null,
            stack: st,
          };
          const prev = cur;
          cur = rec;
          try {
            const r = origDamage.apply(this, arguments);
            rec.retHpLoss = r && (r.hpLoss !== undefined ? r.hpLoss : null);
            rec.retDodged = !!(r && r.dodged);
            return r;
          } finally {
            cur = prev;
            window.__dtrace.push(rec);
          }
        };
        return obj;
      };
    },
  });
};

const HOOK = [
  "(() => {",
  "  window.__qlog = [];",
  "  const q = window.BattleReactionQueue;",
  "  if (!q || q.__hookedD) return !!q;",
  "  const detail = b => (b && b.reactionQueue",
  "    ? b.reactionQueue.map(a => a.kind + ':' + a.amount + ' ' + a.actorUid + '->' + a.targetUid).join(',')",
  "    : 'null');",
  "  const origFlush = q.flush;",
  "  q.flush = function (state, damage) {",
  "    const b = state && state.battle;",
  "    const before = detail(b);",
  "    const r = origFlush.call(this, state, damage);",
  "    window.__qlog.push('flush [' + before + '] -> [' + detail(b) + ']'",
  "      + ' locked=' + !!(b && b.locked) + ' share=' + !!(b && b.kaiichiShare)",
  "      + ' ret=' + r);",
  "    return r;",
  "  };",
  "  q.__hookedD = true;",
  "  return true;",
  "})()",
].join("\n");

const snap = page => page.evaluate(`(() => {
  const b = window.state.battle || {};
  return { locked: !!b.locked, share: !!b.kaiichiShare,
    shareQ: (b.kaiichiShareQueue || []).length,
    queue: (b.reactionQueue || []).length,
    anim: (b.animQueue || []).length,
    manualDodge: !!b.manualDodge };
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

const ROUNDS = Number(process.argv[2] || 6);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.addInitScript(INIT_RESOLUTION);
  await page.addInitScript(INIT);
  page.on("pageerror", e => console.log("PAGEERROR", String(e).slice(0, 160)));

  let bad = 0;
  for (let r = 1; r <= ROUNDS; r += 1) {
    await startRegressionBattle(page);
    await page.evaluate(HOOK);
    await page.evaluate("(() => { window.__dtrace = []; })()");
    await page.evaluate(`(() => {
      const state = window.state, b = state.battle;
      const actor = b.enemies[0];
      actor.hp = 500; actor.maxHp = 500; actor.intent = 9;
      actor.stats = actor.stats || {};
      actor.stats.attack = 10; actor.stats.magic = 10;
      actor.tempAttack = 0; actor.tempMagic = 0;
      b.allies.forEach(a => {
        a.hand = []; a.hp = 999; a.maxHp = 999;
        a.pileStats = a.pileStats || {};
        a.pileStats.discard = [];
        const deck = a.pileStats.deck || a.deck || [];
        // 半魅魔血受击摸 2 张：摸到【闪】会自动响应并合法抵消后续段，
        // 那不是段丢失（已由 [resolve] dodged=true 钉死）。判段数须剔除响应牌。
        const kept = deck.filter(c => c && c.type !== "response" && c.name !== "闪");
        if (a.pileStats.deck) a.pileStats.deck = kept;
        if (a.deck) a.deck = kept;
      });
      const target = b.allies[0];
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
    const dt = await page.evaluate("(() => window.__dtrace || [])()");
    console.log("  --- damage 调用明细 (" + dt.length + " 次) ---");
    dt.forEach(d => {
      if (d.kind === "resolve") {
        console.log("   [resolve] locked=" + d.locked + " amt=" + d.amt
          + " t=" + d.tUid + "(hp" + d.tHp + "->" + d.hpAfter + ")"
          + " hpLoss=" + d.hpLoss + " dodged=" + d.dodged
          + " hand=[" + d.hand + "]");
        return;
      }
      console.log("   #" + d.n + " locked=" + d.locked + " amt=" + d.amt
        + " t=" + d.tUid + "(hp" + d.tHp + ") depth=" + d.depth
        + " q=" + d.q + " share=" + d.share
        + " | resolveHp=" + d.resolveHpLoss + " dodged=" + d.resolveDodged
        + " -> retHp=" + d.retHpLoss
        + " | " + d.stack);
    });
    const hand = await page.evaluate(
      "(() => ((window.state.battle.allies[0]||{}).hand||[]).map(c=>c.name).join(','))()");
    console.log("  目标手牌: " + hand);
    const all2 = await logs(page);
    console.log("  --- 全文日志 ---");
    all2.forEach(t => console.log("    | " + t));
    console.log("  --- 队列 ---");
    (await page.evaluate("(() => window.__qlog || [])()"))
      .forEach(t => console.log("   " + t));
  }
  console.log(`\n卡住 ${bad} / ${ROUNDS}`);
  await browser.close();
})();
