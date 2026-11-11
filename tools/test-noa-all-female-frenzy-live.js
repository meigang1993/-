// 怪面诺亚：全女性队伍 vs 单人战斗的狂暴行为（真实浏览器多回合驱动）
//   A 全女性队伍（诺亚 + 3 名女性队友）连续推进 12 回合：
//     每回合都狂暴 / 咬杀目标池不分敌我 / 咬杀真打队友与敌人 /
//     狂暴回合淫气改造不生效 / 上限恒为 4 / 队友回合正常出牌 / 不卡死 / 无 JS 错误
//   B 反向：运行时禁用狂暴后，A 段狂暴相关断言必须变红
// 支持 NOA_AF=A,B 分批；REVERT=frenzy 走 B 段。
const path = require("path");
require("./repository-toolchain");
const { chromium } = require("playwright");
const {
  openGame, startFreshGame, dismissOpeningStory, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SEGS = (process.env.NOA_AF || "A,B").split(",").filter(Boolean);
let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};
const stallOf = (prev, sig) => sig === prev.sig
  ? { sig, n: prev.n + 1 } : { sig, n: 0 };
let lastDiscardNeed = 0;

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
    if (pick) { pick.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true })); return "hand-reveal-pick"; }
    b.handReveal = null; b.locked = false; window.render?.();
    return "force-clear-hand-reveal";
  }
  const sels = ["[data-confirm-target]", "[data-confirm-discard]",
    "[data-deflect-result-confirm]", "[data-risa-eye-result-confirm]",
    "[data-landmine-rps-result-confirm]"];
  if (!flag) sels.push("[data-end-play]");
  for (const sel of sels) {
    const el = [...document.querySelectorAll(sel)].find(x => !x.disabled);
    if (el) { el.click(); return sel; }
  }
  return null;
}, isNoa);

async function boot(browser, { disableFrenzy = false } = {}) {
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
    st.testAllies = ["noa", "maria", "artina", "gerda"]; // 全女性队伍，零存活男性
    st.testEnemies = [0, 1];
    st.hallModal = "testBattle";
    st.settings = st.settings || {};
    st.settings.battleSpeed = 2;
    window.render?.();
  });
  await page.locator("[data-start-test-battle]").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("[data-start-test-battle]").evaluate(el => el.click());
  await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 30000 });

  await page.evaluate(disabled => {
    const b = window.state?.battle;
    // 加厚血量，避免 12 回合内目标被打死导致目标池变化；队友技能隔离，
    // 专注诺亚两个技能的判定（队友自身准备阶段弹窗不属本次范围）。
    (b?.enemies || []).forEach(e => { e.hp = 600; e.maxHp = 600; });
    (b?.allies || []).forEach(u => {
      if (u.ref !== "noa") { u.hp = 600; u.maxHp = 600; u.skills = []; }
    });
    window.__afHp0 = {
      mates: (b?.allies || []).filter(u => u.ref !== "noa").map(u => u.hp),
      enemies: (b?.enemies || []).map(u => u.hp),
    };
    window.__af = { virtual: [], frenzy: [], balance: [], enter: [], logs: [], pools: [] };
    const wrap = (obj, key, tag, after) => {
      const orig = obj?.[key];
      if (typeof orig !== "function") return;
      obj[key] = function (...a) {
        window.__af[tag].push({
          turn: window.state?.battle?.turn, phase: window.state?.battle?.phase,
          extra: after ? after(a) : null,
        });
        return orig.apply(this, a);
      };
    };
    wrap(window.BattleSystem, "useVirtualKill", "virtual",
      a => ({ actor: a[1]?.ref, target: a[2]?.ref, side: a[2]?.side, card: a[3]?.name }));
    wrap(window.NoaSideEffectSkills, "beginPlayPhase", "frenzy",
      a => ({ unit: a[1]?.ref, turn: window.state?.battle?.turn,
              skip: !!a[1]?.skipPlayPhase, reason: a[1]?.skipPlayReason || null }));
    wrap(window.NoaCharmSkills, "balanceHand", "balance",
      a => ({ unit: a[1]?.ref, active: window.state?.battle?.activeUid }));
    wrap(window.NoaCharmSkills, "enterPlayPhase", "enter", a => ({ unit: a[1]?.ref }));
    if (window.BattleLog?.add) wrap(window.BattleLog, "add", "logs", a => ({ text: a[1] }));

    // 前两次狂暴强制目标：①女性队友 ②敌方；之后恢复真实随机。
    // 只记录 pool 不改结果时仍保留「不分敌我」的真实构成。
    window.__afForce = 0;
    const origSample = window.GameRandom?.sample;
    if (origSample) window.GameRandom.sample = function (list, ...rest) {
      if (window.__afSampling && list?.length) {
        const idx = window.__afForce++;
        const pick = idx === 0 ? (list.find(u => u.side === "ally" && u.ref !== "noa") || list[0])
          : idx === 1 ? (list.find(u => u.side === "enemy") || list[0]) : null;
        window.__af.pools.push(list.map(u => ({
          uid: u.uid, ref: u.ref, side: u.side, gender: u.gender,
        })));
        if (pick) { window.__afSampling = false; return pick; }
      }
      return origSample.apply(this, [list, ...rest]);
    };
    const origBegin = window.NoaSideEffectSkills?.beginPlayPhase;
    if (origBegin) window.NoaSideEffectSkills.beginPlayPhase = function (...a) {
      window.__afSampling = true;
      const r = origBegin.apply(this, a);
      window.__afSampling = false;
      return r;
    };
    if (disabled && window.NoaSideEffectSkills) {
      window.NoaSideEffectSkills.beginPlayPhase = () => false;
    }
    // 反向段只验证「狂暴」是否被禁用：状态牌判定（眩晕/麻痹/混乱）同样会
    // 跳过出牌阶段，会把 B3/B4（C3/C4）污染成假红。隔离判定阶段后诺亚
    // 每回合正常进出牌阶段，才能证明 A 段断言不是恒真。
    if (disabled) {
      if (window.BattleStatusCards?.judgement) window.BattleStatusCards.judgement = () => {};
      if (window.UnderwaterTrainSkills?.judgement) window.UnderwaterTrainSkills.judgement = () => {};
    }
    // 40ms 零丢失观测：drive 按 turn 存快照，出牌阶段一闪而过会漏。
    window.__afTexts = [];
    window.__afPlaySeen = false;
    window.__afMatePlaySeen = false;
    const grab = () => {
      const bt = window.state?.battle;
      const noa = (bt?.allies || []).find(u => u.ref === "noa");
      const active = (bt?.allies || []).concat(bt?.enemies || [])
        .find(u => u.uid === bt?.activeUid);
      if (bt?.phase === 4 && bt.activeUid === noa?.uid && !bt.locked) window.__afPlaySeen = true;
      if (bt?.phase === 4 && active?.side === "ally" && active?.ref !== "noa") {
        window.__afMatePlaySeen = true;
      }
      (window.state?.log || []).forEach(l => {
        if (l && !window.__afTexts.includes(l)) window.__afTexts.push(l);
      });
      (bt?.log || []).forEach(l => {
        if (l && !window.__afTexts.includes(l)) window.__afTexts.push(l);
      });
    };
    grab();
    window.__afTimer = setInterval(grab, 40);
    window.render?.();
  }, disableFrenzy);
  return { page, errors };
}

// 按 turn 递增推进：狂暴回合不进 phase 4，不能靠「停在出牌阶段」判断。
async function drive(page, targetTurns, timeoutMs = 240000) {
  const deadline = Date.now() + timeoutMs;
  const snaps = [];
  let lastTurn = -1, stall = { sig: "", n: 0 };
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => {
      const b = window.state?.battle;
      const noa = (b?.allies || []).find(u => u.ref === "noa");
      const active = (b?.allies || []).concat(b?.enemies || []).find(u => u.uid === b?.activeUid);
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
        hand: (noa?.hand || []).filter(c => !c._pendingDraw).length,
        skip: !!noa?.skipPlayPhase, reason: noa?.skipPlayReason || null,
        allies: (b?.allies || []).map(u => ({ ref: u.ref, gender: u.gender, hp: u.hp })),
        enemies: (b?.enemies || []).map(u => ({ ref: u.ref, hp: u.hp })),
        virtual: window.__af?.virtual || [], frenzy: window.__af?.frenzy || [],
        balance: window.__af?.balance || [], pools: window.__af?.pools || [],
        logs: [...new Set((window.__afTexts || []).concat(
          (window.__af?.logs || []).map(x => x.extra?.text || "")))].filter(Boolean),
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
      if (need > 0) lastDiscardNeed = Math.max(lastDiscardNeed, need);
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
  const { page, errors } = await boot(browser);
  try {
    const snaps = await drive(page, 20);
    const last = snaps[snaps.length - 1] || {};
    const texts = (last.logs || []).join(" | ");
    T("A0 全女性队伍成功推进 20 回合不卡死", snaps.length >= 20,
      { got: snaps.length, lastTurn: last.turn });
    T("A1 我方 4 人全女性、无存活男性", last.allies?.length === 4
      && last.allies.every(u => u.gender === "female"), last.allies);
    T("A2 敌方 2 人存活（目标池非空）", last.enemies?.length === 2
      && last.enemies.every(e => e.hp > 0), last.enemies);

    // 队伍 6 个单位（诺亚 + 3 队友 + 2 敌人），全局 turn 每单位行动一次，
    // 不能按「12 个全局回合 >=3 次狂暴」写死；按观测到的诺亚回合数核对。
    console.log(`INFO 帧摘要 ${JSON.stringify(snaps.map(s => ({
      turn: s.turn, active: s.active, noa: s.uid, phase: s.phase, skip: s.skip,
    })))}`);
    const frenzyCalls = (last.frenzy || []).filter(x => x.extra?.unit === "noa");
    const frenzyTurns = new Set(frenzyCalls.map(x => x.extra?.turn)).size;
    T("A3 多个诺亚回合都做改造副作用判定（按回合去重 >=2）", frenzyTurns >= 2,
      { calls: frenzyCalls.length, distinctTurns: frenzyTurns,
        turns: frenzyCalls.map(x => x.extra?.turn).slice(0, 8) });
    const perTurn = new Map();
    frenzyCalls.forEach(x => {
      const t = x.extra?.turn;
      perTurn.set(t, (perTurn.get(t) || 0) + 1);
    });
    const hits = (texts.match(/没有存活的男性角色/g) || []).length;
    // 战报对重复文本会去重，且 state.log 只保留最近 30 条（battle-log.js），
    // 多回合推进后早期狂暴文本会被挤出，文本条数绝不能代表狂暴次数。
    // 主判据是零丢失的 beginPlayPhase 调用记录按回合核对；文本只要还存在 >=1 条即可。
    T("A4 每个诺亚回合都做且只做一次副作用判定（眩晕等跳过回合不狂暴）",
      perTurn.size >= 2 && [...perTurn.values()].every(n => n === 1) && hits >= 1,
      { perTurn: [...perTurn.entries()], hits, distinctTurns: frenzyTurns,
        sample: (texts.match(/改造副作用发作[^|]*/g) || []).slice(0, 3) });
    // 战报对相邻重复文本会去重，文本计数不能当「每回合都跳过」的证据；
    // 用状态帧 + 40ms 零丢失的 phase4 观测来验。
    const skipFrames = snaps.filter(s => s.skip).length;
    T("A5 多个回合都标记 skipPlayPhase（跳过出牌阶段持续生效）",
      skipFrames >= 2,
      { skipFrames, logHits: (texts.match(/跳过出牌阶段/g) || []).length });

    const virt = last.virtual || [];
    T("A6 虚拟咬杀 >=2 次且目标都不是诺亚自己", virt.length >= 2
      && virt.every(v => v.extra?.target && v.extra.target !== "noa"),
      { count: virt.length, sample: virt.slice(0, 5).map(v => v.extra) });
    // beginPlayPhase 每个诺亚回合都会被调用，但「进入时已被其它原因跳过出牌阶段」
    // （眩晕/麻痹/混乱，或本技能同回合幂等）的调用按设计不发动狂暴、不咬杀：
    // 这些分支进入时 skipPlayPhase 已为 true。狂暴回合数必须按 skip=false 的调用
    // 计，不能拿全部调用当分母——偶发一次眩晕就会误报「少咬一次」（A6b 旧红项）。
    // 目标池采样 pools 只在真正狂暴时发生，作第二条零丢失证据。
    const frenzyFired = frenzyCalls.filter(x => !x.extra?.skip);
    const firedTurns = new Set(frenzyFired.map(x => x.extra?.turn)).size;
    const virtTurns = new Set(virt.map(v => v.turn)).size;
    const poolsEarly = last.pools || [];
    T("A6b 每个真正狂暴的回合恰好生成一次咬杀（不重不漏）",
      firedTurns >= 2 && firedTurns === virtTurns
      && virt.length === firedTurns && poolsEarly.length === virt.length,
      { calls: frenzyCalls.length, fired: frenzyFired.length, firedTurns,
        virtual: virt.length, virtTurns, pools: poolsEarly.length,
        skipCalls: frenzyCalls.filter(x => x.extra?.skip).map(x => ({
          turn: x.extra?.turn, reason: x.extra?.reason })),
        virtTurnList: virt.map(v => v.turn) });
    T("A6c 其它原因跳过出牌阶段的回合不发动狂暴（眩晕等不白咬）",
      frenzyCalls.filter(x => x.extra?.skip)
        .every(x => !virt.some(v => v.turn === x.extra?.turn)),
      frenzyCalls.filter(x => x.extra?.skip).map(x => x.extra));
    const pools = last.pools || [];
    T("A7 狂暴目标池含女性队友与敌人、不含自己（不分敌我）",
      pools.some(p => p.some(u => u.side === "ally" && u.gender === "female")
        && p.some(u => u.side === "enemy") && !p.some(u => u.ref === "noa")),
      { poolCount: pools.length, first: pools[0] });
    T("A8 咬杀同时落在女性队友与敌方（前两次强制，确定性）",
      virt.some(v => v.extra?.side === "ally") && virt.some(v => v.extra?.side === "enemy"),
      virt.slice(0, 4).map(v => v.extra));

    const hp = await page.evaluate(() => {
      const b = window.state.battle;
      return {
        mates: (b.allies || []).filter(u => u.ref !== "noa").map(u => u.hp),
        enemies: (b.enemies || []).map(u => u.hp), init: window.__afHp0,
      };
    });
    T("A9 女性队友被咬杀真实掉血（友伤生效）",
      hp.mates.some((v, i) => v < hp.init.mates[i]), { now: hp.mates, init: hp.init.mates });
    T("A10 敌方被咬杀真实掉血",
      hp.enemies.some((v, i) => v < hp.init.enemies[i]), { now: hp.enemies, init: hp.init.enemies });

    T("A11 狂暴回合不出现「怪面诺亚 可以出牌」（跳过没被绕过）",
      !texts.includes("怪面诺亚 可以出牌"),
      { hit: (texts.match(/怪面诺亚[^|]*可以出牌/g) || []).slice(0, 2) });
    T("A11b 全程零丢失观测：诺亚从未进入出牌阶段（一直狂暴）",
      !(await page.evaluate(() => !!window.__afPlaySeen)));
    const balance = last.balance || [];
    const noaInPlay = balance.filter(x => x.extra?.active === last.uid && x.phase === 4);
    T("A12 诺亚狂暴回合淫气改造不生效（phase4 balanceHand 调用为 0）",
      noaInPlay.length === 0, { total: balance.length, inPlay: noaInPlay.length });
    T("A13 手牌上限恒为基础 4（与单人一致）", await page.evaluate(() => {
      const n = window.state?.battle?.allies?.find(u => u.ref === "noa");
      return window.NoaSideEffectSkills?.handLimit?.(n);
    }) === 4);
    T("A14 女性队友自己有正常出牌阶段（不是全队被跳过）",
      await page.evaluate(() => !!window.__afMatePlaySeen));
    const turns = snaps.map(s => s.turn);
    T("A15 回合号严格递增、敌方 AI 回合正常推进",
      turns.length >= 20 && turns.every((t, i) => i === 0 || t > turns[i - 1]), turns);
    T("A16 全程无 JS 错误", relevantErrors(errors).length === 0,
      relevantErrors(errors).slice(0, 3));
    console.log(`INFO 弃牌阶段观测 needSeen=${lastDiscardNeed} `
      + `pools=${pools.length} virtual=${virt.length}`);
  } finally {
    await page.evaluate(() => clearInterval(window.__afTimer)).catch(() => {});
    await page.close();
  }
}

async function segB(browser) {
  const { page, errors } = await boot(browser, { disableFrenzy: true });
  try {
    const snaps = await drive(page, 12);
    const last = snaps[snaps.length - 1] || {};
    const texts = (last.logs || []).join(" | ");
    T("B1 禁用狂暴后战报不再出现狂暴文本",
      !texts.includes("没有存活的男性角色"), { hit: texts.slice(0, 200) });
    T("B2 禁用狂暴后不再生成虚拟咬杀", (last.virtual || []).length === 0,
      { count: (last.virtual || []).length });
    T("B3 禁用狂暴后跳过出牌阶段日志消失", !texts.includes("跳过出牌阶段"),
      { hit: (texts.match(/跳过出牌阶段[^|]*/g) || []).slice(0, 2) });
    const playSeen = await page.evaluate(() => !!window.__afPlaySeen);
    T("B4 禁用狂暴后诺亚恢复可出牌（证明 A 段断言非恒真）",
      playSeen || texts.includes("怪面诺亚 可以出牌") || last.phase === 4,
      { phase: last.phase, playSeen });
    T("B5 无 JS 错误", relevantErrors(errors).length === 0, relevantErrors(errors).slice(0, 3));
  } finally {
    await page.evaluate(() => clearInterval(window.__afTimer)).catch(() => {});
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    for (const s of SEGS) {
      if (s === "A") await segA(browser);
      else if (s === "B") await segB(browser);
    }
  } finally { await browser.close(); }
  console.log(`RESULT ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("FATAL", e && e.stack || e); process.exit(2); });
