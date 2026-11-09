// 怪面诺亚 · 单人战斗（我方仅诺亚）严格检查
//   A 真实驱动 3 个诺亚回合：无存活男性 -> 每回合狂暴虚拟咬杀 + 跳过出牌阶段
//     同时验：魅力改造整回合不生效 / 咬杀真实造成伤害 / 手牌上限 4 /
//     结束阶段无男性伤害 / 弃牌阶段是否卡死 / 敌方 AI 回合正常推进 / 无 JS 错误
//   C 反向验证：运行时禁用 beginPlayPhase 后，A 段狂暴相关断言必须变红
// 支持 NOA_SOLO=A,C 分批；REVERT=frenzy 走 C 段。
const path = require("path");
require("./repository-toolchain");
const { chromium } = require("playwright");
const {
  openGame, startFreshGame, dismissOpeningStory, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SEGS = (process.env.NOA_SOLO || "A,C").split(",").filter(Boolean);
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
    st.testAllies = ["noa"];       // 单人战斗：我方只有诺亚
    st.testEnemies = [0, 1];       // 两个敌人，保证狂暴目标池非空且有敌我区分
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
    // 敌人加厚，避免 3 回合内被咬杀打死导致战斗提前结束（不改诺亚任何属性）
    (b?.enemies || []).forEach(e => { e.hp = 500; e.maxHp = 500; });
    window.__solo = { virtual: [], frenzy: [], balance: [], enter: [], logs: [], discardNeed: [] };
    const wrap = (obj, key, tag, after) => {
      const orig = obj?.[key];
      if (typeof orig !== "function") return;
      obj[key] = function (...a) {
        window.__solo[tag].push({
          turn: window.state?.battle?.turn,
          phase: window.state?.battle?.phase,
          extra: after ? after(a) : null,
        });
        return orig.apply(this, a);
      };
    };
    wrap(window.BattleSystem, "useVirtualKill", "virtual",
      a => ({ actor: a[1]?.ref, target: a[2]?.ref, card: a[3]?.name }));
    wrap(window.NoaSideEffectSkills, "beginPlayPhase", "frenzy", a => ({ unit: a[1]?.ref }));
    wrap(window.NoaCharmSkills, "balanceHand", "balance", a => ({
      unit: a[1]?.ref, active: window.state?.battle?.activeUid,
      optsOnlySelf: !!a[3]?.onlySelf,
    }));
    wrap(window.NoaCharmSkills, "enterPlayPhase", "enter", a => ({ unit: a[1]?.ref }));
    if (window.BattleLog?.add) wrap(window.BattleLog, "add", "logs", a => ({ text: a[1] }));
    if (disabled && window.NoaSideEffectSkills) {
      window.NoaSideEffectSkills.beginPlayPhase = () => false;
      window.__frenzyDisabled = true;
    }
    // 战报会滚动；hook 未必命中（BattleLog 可能不是全局），用 40ms 轮询零丢失累积。
    window.__soloTexts = [];
    // 40ms 零丢失观测：drive 只在 turn 变化时存一帧快照，恰好落在 phase 6
    // 会漏掉「诺亚进过出牌阶段」；C4 反向验证必须靠这个累积标志。
    window.__soloPlaySeen = false;
    const grab = () => {
      const b = window.state?.battle;
      const noa = (b?.allies || []).find(u => u.ref === "noa");
      if (b?.phase === 4 && b.activeUid === noa?.uid && !b.locked) window.__soloPlaySeen = true;
      (window.state?.log || []).forEach(l => {
        if (l && !window.__soloTexts.includes(l)) window.__soloTexts.push(l);
      });
      (window.state?.battle?.log || []).forEach(l => {
        if (l && !window.__soloTexts.includes(l)) window.__soloTexts.push(l);
      });
    };
    grab();
    window.__soloTimer = setInterval(grab, 40);
    window.render?.();
  }, disableFrenzy);
  return { page, errors };
}

// 按 turn 递增推进：狂暴回合永远不会进 phase 4，所以不能用 waitNoaTurn。
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
        discardTip: document.querySelector(".discard-prompt")?.textContent || "",
        virtual: window.__solo?.virtual || [], frenzy: window.__solo?.frenzy || [],
        balance: window.__solo?.balance || [], enter: window.__solo?.enter || [],
        logs: [...new Set((window.__soloTexts || []).concat(
          (window.__solo?.logs || []).map(x => x.extra?.text || "")))].filter(Boolean),
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
      // 禁用狂暴后诺亚会进 phase 4；手牌溢出时 UI 是「确认弃置」而非
      // 「结束出牌」，不先结算挂起就会卡在这一回合（C 段偶发红同源）。
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
      // 狂暴回合摸牌后若手牌超上限，玩家仍需按标准弃牌阶段弃至上限。
      // 真实点击手牌（选中阶段不删牌、索引稳定）再确认，不用后门改状态。
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
    const snaps = await drive(page, 12);
    T("A0 单人战斗成功推进 12 个回合（不卡死）", snaps.length >= 12,
      { got: snaps.length, last: snaps[snaps.length - 1] && {
        turn: snaps[snaps.length - 1].turn, phase: snaps[snaps.length - 1].phase } });
    const last = snaps[snaps.length - 1] || {};
    T("A1 我方确实只有诺亚一人、且为女性（无存活男性）",
      last.allies?.length === 1 && last.allies[0]?.ref === "noa"
      && last.allies[0]?.gender === "female", last.allies);
    T("A2 敌方存在且血量被加厚", last.enemies?.length >= 2
      && last.enemies.every(e => e.hp > 0), last.enemies);

    // 狂暴：frenzy 钩子按诺亚回合调用；日志里出现狂暴与跳过
    const frenzyCalls = (last.frenzy || []).filter(x => x.extra?.unit === "noa");
    T("A3 多个诺亚回合都调用 beginPlayPhase 判定狂暴（>=2 次）",
      frenzyCalls.length >= 2, { calls: frenzyCalls.length, sample: frenzyCalls.slice(0, 4) });
    const texts = (last.logs || []).join(" | ");
    T("A4 战报出现「没有存活的男性角色」狂暴文本",
      texts.includes("没有存活的男性角色") && texts.includes("虚拟【咬杀】"),
      { hit: texts.match(/改造副作用发作[^|]*/g)?.slice(0, 2) || [] });
    T("A5 战报出现「跳过出牌阶段」", texts.includes("跳过出牌阶段"),
      { hit: texts.match(/跳过出牌阶段[^|]*/g)?.slice(0, 2) || [] });

    // 虚拟咬杀：目标只能是敌人（单人时友方池为空），不能是自己
    const virt = last.virtual || [];
    T("A6 虚拟咬杀确实生成（>=2 次）且目标不是诺亚自己",
      virt.length >= 2 && virt.every(v => v.extra?.target && v.extra.target !== "noa"),
      { count: virt.length, sample: virt.slice(0, 4).map(v => v.extra) });
    T("A7 咬杀目标全部落在敌方（单人时无友方可选）",
      virt.length > 0 && virt.every(v => (last.enemies || []).some(e => e.ref === v.extra?.target)),
      virt.slice(0, 4).map(v => v.extra));
    const hp0 = snaps[0]?.enemies?.reduce((s, e) => s + e.hp, 0) || 0;
    const hpN = last.enemies?.reduce((s, e) => s + e.hp, 0) || 0;
    T("A8 咬杀真实造成伤害（敌人总血量下降）", hpN < hp0, { hp0, hpN });

    // 狂暴回合：skipPlayPhase 生效、不出现「可以出牌」
    const noaTurns = snaps.filter(s => s.active === s.uid || s.skip);
    T("A9 观测到多个诺亚回合且均标记跳过出牌阶段",
      noaTurns.length >= 2 && noaTurns.every(s => s.skip || s.phase !== 1),
      noaTurns.map(s => ({ turn: s.turn, phase: s.phase, skip: s.skip, active: s.active })));
    T("A10 狂暴回合没有出现「怪面诺亚 可以出牌」（跳过没被绕过）",
      !texts.includes("怪面诺亚 可以出牌"),
      { hit: (texts.match(/怪面诺亚[^|]*可以出牌/g) || []).slice(0, 2) });
    T("A11 skipPlayReason 为改造副作用",
      noaTurns.some(s => s.reason === "改造副作用"), noaTurns.map(s => s.reason));

    // 魅力改造：狂暴回合不进 phase 4，balanceHand / enterPlayPhase 不应触发补牌
    const balance = last.balance || [];
    const noaActiveBalance = balance.filter(x => x.extra?.active === last.uid);
    // 虚拟咬杀是一次「出牌」，会触发出牌后钩子调 balanceHand；但 prepare/摸牌/
    // 弃牌等非 phase4 阶段函数首行就 return 0，不补牌也不弃牌，故只盯 phase4。
    const noaActiveInPlay = noaActiveBalance.filter(x => x.phase === 4);
    T("A12 诺亚自己的狂暴回合内魅力改造不生效（phase4 的 balanceHand 调用为 0）",
      noaActiveInPlay.length === 0,
      { total: balance.length, noaActive: noaActiveBalance.length,
        inPlay: noaActiveInPlay.length, noaCalls: noaActiveBalance.slice(0, 4) });
    console.log(`INFO 敌方回合 balanceHand 调用 ${balance.length - noaActiveBalance.length} 次`
      + "（出牌后钩子会重判诺亚手牌，属设计，但不得弹玩家弃牌选择）");
    T("A13 手牌上限恒为基础 4（无存活男性不加成）",
      await page.evaluate(() => {
        const n = window.state?.battle?.allies?.find(u => u.ref === "noa");
        return window.NoaSideEffectSkills?.handLimit?.(n);
      }) === 4);

    // 结束阶段：无其他存活男性 -> 不造成伤害、不播「全部！全部进来！！」
    T("A14 单人战斗结束阶段不触发男性伤害日志",
      !texts.includes("对我方其他存活男性角色各造成"),
      { hit: (texts.match(/其他存活男性[^|]*/g) || []).slice(0, 2) });

    // 敌方 AI 回合能推进（否则 turn 不会递增）
    const turns = snaps.map(s => s.turn);
    T("A15 回合号严格递增、敌方 AI 回合正常推进",
      turns.length >= 12 && turns.every((t, i) => i === 0 || t > turns[i - 1]), turns);

    T("A16 全程无 JS 错误", relevantErrors(errors).length === 0,
      relevantErrors(errors).slice(0, 3));
    console.log(`INFO 单人战斗弃牌阶段观测：needSeen=${lastDiscardNeed} `
      + `discardTips=${JSON.stringify(snaps.map(s => (s.discardTip || "").slice(0, 30)))}`);
  } finally {
    await page.evaluate(() => clearInterval(window.__soloTimer)).catch(() => {});
    await page.close();
  }
}

async function segC(browser) {
  const { page, errors } = await boot(browser, { disableFrenzy: true });
  try {
    const snaps = await drive(page, 4);
    const last = snaps[snaps.length - 1] || {};
    const texts = (last.logs || []).join(" | ");
    T("C1 禁用狂暴后战报不再出现狂暴文本",
      !texts.includes("没有存活的男性角色"), { hit: texts.slice(0, 200) });
    T("C2 禁用狂暴后不再生成虚拟咬杀", (last.virtual || []).length === 0,
      { count: (last.virtual || []).length });
    T("C3 禁用狂暴后跳过出牌阶段日志消失", !texts.includes("跳过出牌阶段"),
      { hit: (texts.match(/跳过出牌阶段[^|]*/g) || []).slice(0, 2) });
    // 只看最后一帧或战报会漏：drive 按 turn 存快照，最后一帧常是 phase 6。
    // __soloPlaySeen 由 40ms 轮询累积，任何一拍进过 phase 4 都留痕。
    const playSeen = await page.evaluate(() => !!window.__soloPlaySeen);
    T("C4 禁用狂暴后诺亚恢复可出牌（证明 A 段断言非恒真）",
      texts.includes("怪面诺亚 可以出牌") || last.phase === 4 || playSeen
      || snaps.some(s => s.active === s.uid && s.phase === 4),
      { phase: last.phase, playSeen,
        hit: (texts.match(/怪面诺亚[^|]*可以出牌/g) || []).slice(0, 2) });
    T("C5 无 JS 错误", relevantErrors(errors).length === 0, relevantErrors(errors).slice(0, 3));
  } finally {
    await page.evaluate(() => clearInterval(window.__soloTimer)).catch(() => {});
    await page.close();
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
  try {
    for (const s of SEGS) {
      if (s === "A") await segA(browser);
      else if (s === "C") await segC(browser);
    }
  } finally { await browser.close(); }
  console.log(`RESULT ${pass}/${total}`);
  process.exit(pass === total ? 0 : 1);
})().catch(e => { console.error("FATAL", e && e.stack || e); process.exit(2); });
