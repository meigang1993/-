// 怪面诺亚：眩晕回合不狂暴（真实浏览器 + 真实状态牌判定）
//   A 全女性队伍，给诺亚塞一张真实【眩晕】状态牌 + 黑桃判定牌，驱动真实回合：
//     判定成功 -> skipPlayReason 保持「眩晕」 -> 不咬杀 -> 战报/手牌面板显示眩晕
//     -> 状态牌回合结束自动消耗 -> 下一诺亚回合恢复狂暴
//   B 反向：LIVE_REVERT=block 运行时模拟旧实现（抹掉外部 skip 再判定），A 段必须变红
// 支持 NOA_SS=A,B 分批。
const path = require("path");
require("./repository-toolchain");
const { chromium } = require("playwright");
const {
  openGame, startFreshGame, dismissOpeningStory, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SEGS = (process.env.NOA_SS || "A,B").split(",").filter(Boolean);
const REVERT = process.env.LIVE_REVERT === "block";
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};
const stallOf = (prev, sig) => sig === prev.sig
  ? { sig, n: prev.n + 1 } : { sig, n: 0 };

const dismissSpeech = page => page.evaluate(() => {
  const b = window.state?.battle;
  const el = [...document.querySelectorAll("[data-dismiss-speech]")].find(x => !x.disabled);
  if (el) el.click();
  if (b?.speech?.dismissible && window.BattleLines?.dismiss) window.BattleLines.dismiss(window.state);
  return !!el;
});
const forceAdvance = (page, isNoa) => page.evaluate(flag => {
  const b = window.state?.battle;
  if (b?.handReveal) {
    const pick = [...document.querySelectorAll("[data-hand-reveal-pick]")].find(x => !x.disabled);
    if (pick) { pick.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); return "pick"; }
    b.handReveal = null; b.locked = false; window.render?.();
    return "force-clear";
  }
  const sels = ["[data-confirm-target]", "[data-confirm-discard]",
    "[data-deflect-result-confirm]", "[data-risa-eye-result-confirm]"];
  if (!flag) sels.push("[data-end-play]");
  for (const sel of sels) {
    const el = [...document.querySelectorAll(sel)].find(x => !x.disabled);
    if (el) { el.click(); return sel; }
  }
  return null;
}, isNoa);

// 判定结算完毕后对应状态牌自动消耗：不再用产品 API 主动移除，
// 只观察「已离开手牌且进入消耗区」，据此验证下一诺亚回合能恢复狂暴。
const checkStunConsumed = page => page.evaluate(() => {
  const b = window.state?.battle;
  const noa = (b?.allies || []).find(u => u.ref === "noa");
  const inHand = (noa?.hand || []).some(c => c.stun || c.statusKey === "stun");
  const consumed = (noa?.consumed || []).some(c => c.stun || c.statusKey === "stun");
  return { ok: !inHand && consumed, inHand, consumed };
});
let stunCheck = null;

async function boot(browser) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await page.locator("[data-open-butler]").waitFor({ state: "visible", timeout: 30000 });
  await page.evaluate(() => {
    const st = window.state;
    const c = st.chars.find(x => x.id === "noa");
    if (c) { c.locked = false; c.level = 10; }
    st.view = "hall";
    st.testAllies = ["noa", "maria", "artina", "gerda"]; // 全女性，零存活男性
    st.testEnemies = [0, 1];
    st.hallModal = "testBattle";
    st.settings = st.settings || {};
    st.settings.battleSpeed = 2;
    window.render?.();
  });
  await page.locator("[data-start-test-battle]").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("[data-start-test-battle]").evaluate(el => el.click());
  await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 30000 });

  const seeded = await page.evaluate(revert => {
    const st = window.state, b = st?.battle;
    const noa = (b?.allies || []).find(u => u.ref === "noa");
    if (!noa) return { ok: false, why: "no noa" };
    (b.enemies || []).forEach(e => { e.hp = 600; e.maxHp = 600; });
    (b.allies || []).forEach(u => {
      if (u.ref !== "noa") { u.hp = 600; u.maxHp = 600; u.skills = []; }
    });
    // 真实状态牌：create("stun") + push 进手牌（不加 _pendingDraw，判定阶段可见）。
    const registry = window.BattleStatusCardRegistry;
    const stun = registry?.create?.("stun");
    if (!stun) return { ok: false, why: "no create" };
    noa.hand.push(stun);
    registry.sync?.(noa, b);
    // 判定牌取黑桃（stun 成功判据），deck 非空且不重洗。
    noa.deck = [{ suit: "♠", name: "判定" }];
    noa.discard = [];

    window.__ss = { virtual: [], texts: [], skipTag: [], noaTurns: [] };
    const wrap = (obj, key, tag, after) => {
      const orig = obj?.[key];
      if (typeof orig !== "function") return;
      obj[key] = function (...a) {
        window.__ss[tag].push({
          turn: window.state?.battle?.turn,
          phase: window.state?.battle?.phase,
          extra: after ? after(a) : null,
        });
        return orig.apply(this, a);
      };
    };
    wrap(window.BattleSystem, "useVirtualKill", "virtual",
      a => ({ actor: a[1]?.ref, target: a[2]?.ref, card: a[3]?.name }));
    if (window.BattleLog?.add) wrap(window.BattleLog, "add", "texts", a => ({ text: a[1] }));

    // 反向：模拟修复前的实现——外部原因的 skip 被临时抹掉再判定。
    if (revert && window.NoaSideEffectSkills) {
      const orig = window.NoaSideEffectSkills.beginPlayPhase;
      window.NoaSideEffectSkills.beginPlayPhase = function (state, unit) {
        const saved = unit.skipPlayPhase, reason = unit.skipPlayReason;
        if (saved && reason !== "改造副作用") unit.skipPlayPhase = false;
        const r = orig.call(this, state, unit);
        if (!r && saved && reason !== "改造副作用") {
          unit.skipPlayPhase = saved; unit.skipPlayReason = reason;
        }
        return r;
      };
    }
    const grab = () => {
      const bt = window.state?.battle;
      const n = (bt?.allies || []).find(u => u.ref === "noa");
      const tag = document.querySelector(".hand-skip-tag")?.textContent || "";
      if (tag && !window.__ss.skipTag.includes(tag)) window.__ss.skipTag.push(tag);
      (window.state?.log || []).forEach(l => {
        if (l && !window.__ss.texts.includes(l)) window.__ss.texts.push(l);
      });
      (bt?.log || []).forEach(l => {
        if (l && !window.__ss.texts.includes(l)) window.__ss.texts.push(l);
      });
      if (bt?.activeUid === n?.uid && !window.__ss.noaTurns.some(x => x.turn === bt.turn)) {
        window.__ss.noaTurns.push({
          turn: bt.turn, phase: bt.phase, reason: n?.skipPlayReason || null,
          skip: !!n?.skipPlayPhase, frenzyMark: n?._noaFrenzyTurn ?? null,
        });
      }
    };
    grab();
    window.__ssTimer = setInterval(grab, 40);
    window.render?.();
    return { ok: true, statuses: noa.statuses?.slice?.() || [] };
  }, REVERT);
  return { page, errors, seeded };
}

async function drive(page, targetTurns, timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  const snaps = [];
  let lastTurn = -1, stall = { sig: "", n: 0 }, cleaned = false;
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => {
      const b = window.state?.battle;
      const noa = (b?.allies || []).find(u => u.ref === "noa");
      const active = (b?.allies || []).concat(b?.enemies || [])
        .find(u => u.uid === b?.activeUid);
      return {
        turn: b?.turn, phase: b?.phase, active: b?.activeUid, uid: noa?.uid,
        locked: !!b?.locked, battle: !!b,
        activeAlly: !!active && active.side === "ally",
        charm: !!b?.noaCharmDiscard, charmNeed: b?.noaCharmDiscard?.need || 0,
        endBtn: !!document.querySelector("[data-end-play]"),
        confirmBtn: !!document.querySelector("[data-confirm-discard]"),
        skipBtn: [...document.querySelectorAll(
          "[data-skip-extract],[data-gerda-comfort-skip],[data-mieryula-skip]," +
          "[data-karuna-bubble-skip],[data-aileng-drill-skip]")]
          .some(el => !el.disabled),
        reason: noa?.skipPlayReason || null, skip: !!noa?.skipPlayPhase,
        ss: window.__ss || {},
      };
    });
    if (s.battle && s.turn !== lastTurn) {
      lastTurn = s.turn;
      snaps.push(s);
      if (snaps.length >= targetTurns) return snaps;
    }
    stall = stallOf(stall, JSON.stringify([s.turn, s.active, s.phase, s.locked,
      s.activeAlly, s.endBtn, s.confirmBtn, s.skipBtn, s.charm]));
    if (s.battle) await dismissSpeech(page);
    if (s.battle && !cleaned && s.reason === "眩晕" && s.skip) {
      stunCheck = await checkStunConsumed(page);
      cleaned = true;
      console.log("INFO 眩晕回合已确认：判定结算后状态牌应已自动消耗", stunCheck);
    }
    if (s.battle && s.skipBtn) {
      await page.evaluate(() => {
        const el = [...document.querySelectorAll(
          "[data-skip-extract],[data-gerda-comfort-skip],[data-mieryula-skip]," +
          "[data-karuna-bubble-skip],[data-aileng-drill-skip]")]
          .find(x => !x.disabled);
        if (el) el.click();
      });
    }
    if (s.battle && s.charm) {
      for (let i = 0; i < s.charmNeed; i++) {
        await page.locator(`[data-card-index="${i}"]`).first()
          .click({ timeout: 4000 }).catch(() => {});
      }
      const btn = page.locator("[data-confirm-discard]");
      if (await btn.count()) await btn.first().evaluate(el => el.click()).catch(() => {});
      await page.evaluate(() => {
        const b = window.state?.battle;
        if (b?.noaCharmDiscard) {
          b.noaCharmDiscard = null; b.discardPick = null; window.render?.();
        }
      });
    } else if (s.battle && s.phase === 5 && s.confirmBtn) {
      const need = await page.evaluate(() => {
        const b = window.state.battle;
        const u = (b.allies || []).concat(b.enemies || []).find(x => x.uid === b.activeUid);
        const vis = (u?.hand || []).filter(c => !c._pendingDraw).length;
        const lim = window.NoaSideEffectSkills?.handLimit?.(u) ?? (u?.stats?.handLimit || 5);
        return Math.max(0, vis - lim);
      });
      for (let i = 0; i < need; i++) {
        await page.locator(`[data-card-index="${i}"]`).first().click({ timeout: 5000 }).catch(() => {});
      }
      await page.locator("[data-confirm-discard]").evaluate(el => el.click()).catch(() => {});
    } else if (s.battle && s.activeAlly && s.phase === 4 && !s.locked && s.endBtn) {
      await page.locator("[data-end-play]").evaluate(el => el.click()).catch(() => {});
    } else if (s.battle && stall.n >= 12) {
      await forceAdvance(page, s.active === s.uid);
    }
    await page.waitForTimeout(250);
  }
  return snaps;
}

async function segA(browser) {
  const { page, errors, seeded } = await boot(browser);
  try {
    const snaps = await drive(page, 20);
    const last = snaps[snaps.length - 1] || {};
    const ss = last.ss || {};
    const texts = [...new Set((ss.texts || []).map(x => typeof x === "string"
      ? x : x?.text).filter(Boolean))].join(" | ");
    const noaTurns = ss.noaTurns || [];
    const virtuals = ss.virtual || [];
    T("A0 真实状态牌已注入且成功推进 20 个全局回合",
      seeded.ok && snaps.length >= 20, { seeded, got: snaps.length });
    T("A1 判定阶段真实跑过眩晕判定并成功",
      /眩晕判定：♠.*跳过出牌阶段/.test(texts), { hit: texts.match(/眩晕判定[^|]*/)?.[0] || null });
    const stunTurn = noaTurns.find(t => t.reason === "眩晕" && t.skip);
    T("A2 存在诺亚回合：skipPlayReason 保持「眩晕」",
      !!stunTurn, { noaTurns });
    T("A3 眩晕回合不写狂暴战报（skipPlayReason 未被改写成改造副作用）",
      (() => {
        // 狂暴战报只允许出现在非眩晕的诺亚回合：按 turn 归属核对。
        const frenzyTurns = virtuals
          .filter(v => v.extra?.card === "咬杀").map(v => v.turn);
        return !!stunTurn && !frenzyTurns.includes(stunTurn.turn);
      })(),
      { stunTurn, frenzyTurns: virtuals.filter(v => v.extra?.card === "咬杀").map(v => v.turn) });
    T("A4 战报显示「因眩晕跳过出牌阶段」",
      /因眩晕跳过出牌阶段/.test(texts), { hit: texts.match(/因[^|]*跳过出牌阶段[^|]*/)?.[0] || null });
    T("A5 手牌面板显示「眩晕：本回合跳过出牌阶段」",
      (ss.skipTag || []).some(t => t.includes("眩晕") && t.includes("跳过出牌阶段")),
      { skipTag: ss.skipTag });
    T("A6 眩晕回合不产生咬杀（useVirtualKill 无该回合记录）",
      !!stunTurn && !virtuals.some(v => v.turn === stunTurn.turn
        && v.extra?.card === "咬杀"), { stunTurn, virtuals });
    T("A7 状态牌到期后，后续诺亚回合恢复狂暴（咬杀 + 原因改造副作用）",
      (() => {
        const later = noaTurns.filter(t => t.turn > (stunTurn?.turn ?? -1));
        const bites = virtuals.filter(v => v.extra?.card === "咬杀" && v.turn > (stunTurn?.turn ?? -1));
        return later.some(t => t.reason === "改造副作用") && bites.length > 0;
      })(), { noaTurns, bites: virtuals.filter(v => v.extra?.card === "咬杀") });
    T("A7b 判定结算后眩晕状态牌已自动消耗（不在手牌、已进入消耗区）",
      !!stunCheck?.ok, { stunCheck });
    const errs = relevantErrors(errors);
    T("A8 无相关 JS 错误", errs.length === 0, { errs: errs.slice(0, 3) });
  } finally {
    await page.close().catch(() => {});
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    if (SEGS.includes("A")) await segA(browser);
    if (SEGS.includes("B") && REVERT) {
      // 反向由 LIVE_REVERT=block + NOA_SS=A 跑同一段，单独列出便于对照。
      console.log("B 反向：请用 LIVE_REVERT=block NOA_SS=A 单独重跑 A 段。");
    }
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(`RESULT ${pass}/${total}` + (REVERT ? " LIVE_REVERT=block" : ""));
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("FATAL", e); process.exit(2); });
