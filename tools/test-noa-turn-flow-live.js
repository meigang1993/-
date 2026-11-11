// 怪面诺亚 · 实机回合驱动严格检查
//   A 真实出牌链路：使用【杀】台词字幕、免杀意
//   B 真实结束阶段：对其他存活男性造成攻击力伤害 +「全部！全部进来！！」字幕
//   C 真实出牌阶段开始：无存活男性时虚拟【咬杀】+ 跳过出牌阶段
//   D 他人出牌后的手牌平衡：归属、复制、日志名（严格检查副作用）
//   E 反向验证：逐个禁用技能，对应断言必须变红
// 支持 NOA_TF=A,B,C,D,E 分批；REVERT=playKill|endTurn|beginPlay|balance 做源码级反向。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startFreshGame, dismissOpeningStory, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const SEGS = (process.env.NOA_TF || "A,B,C,D,E").split(",").filter(Boolean);
const REVERT = process.env.REVERT || "";
const E_ONLY = (process.env.NOA_E_ONLY || "").split(",").filter(Boolean);
const KILL_LINE = "杀！杀杀杀杀！！！";
const HURT_LINE = "全部！全部进来！！";
// 敌方 AI 回合偶发不自动行动（日志停在「可以出牌」），连续多拍状态不变时兜底推进。
const stallOf = (prev, sig) => sig === prev.sig
  ? { sig, n: prev.n + 1 } : { sig, n: 0 };
// 登场/技能字幕用 Infinity 超时 + dismissible，不点掉 battle.locked 一直为真。
// 它只在字幕出现时存在，且循环在达成目标后就退出，所以每拍点掉不会干扰出牌阶段。
const dismissSpeech = page => page.evaluate(() => {
  const b = window.state?.battle;
  const el = [...document.querySelectorAll("[data-dismiss-speech]")].find(x => !x.disabled);
  if (el) el.click();
  // 字幕元素是动态渲染的，DOM 事件绑定未必还在；直接走控制器才能连 introPause
  // 的等待一并 resolve（BattleLines.dismiss 自带 () => introFlow.resolve()）。
  if (b?.speech?.dismissible && window.BattleLines?.dismiss) window.BattleLines.dismiss(window.state);
  return !!el;
});
// 卡住时逐项清残留确认框 / 未行动的敌方回合；isNoa 为真时绝不点 end-play，
// 避免把诺亚自己的出牌阶段点掉。
const forceAdvance = (page, isNoa) => page.evaluate(flag => {
  const b = window.state?.battle;
  // handReveal（如机械哥布林「激光射线」的选牌弹窗）会锁住整个战斗。
  // 它绑定的是 onpointerdown 且属性名是连字符形式，click() 与驼峰选择器都无效。
  if (b?.handReveal) {
    const pick = [...document.querySelectorAll("[data-hand-reveal-pick]")]
      .find(x => !x.disabled);
    if (pick) {
      pick.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, cancelable: true }));
      return "hand-reveal-pick";
    }
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

// 淫气改造溢出弃牌：先按 need 真实点选手牌，再真实点「确认弃置」清挂起。
// 两级兜底只用于推进辅助（不改产品逻辑），避免任何一拍没点中就把回合卡死。
const settleCharmDiscard = async page => {
  const need = await page.evaluate(() =>
    Math.max(0, window.state?.battle?.noaCharmDiscard?.need || 0));
  if (!need) {
    await page.evaluate(() => {
      const b = window.state?.battle;
      if (b?.noaCharmDiscard) {
        b.noaCharmDiscard = null; b.discardPick = null; window.render?.();
      }
    });
    return;
  }
  for (let i = 0; i < need; i++) {
    await page.locator(`[data-card-index="${i}"]`).first()
      .click({ timeout: 4000 }).catch(() => {});
  }
  const btn = page.locator("[data-confirm-discard]");
  if (await btn.count()) await btn.first().evaluate(el => el.click()).catch(() => {});
  if (!(await page.evaluate(() => !!window.state?.battle?.noaCharmDiscard))) return;
  await page.evaluate(() => {
    const b = window.state?.battle, c = b?.noaCharmDiscard;
    if (!c) return;
    const owner = (b.allies || []).concat(b.enemies || []).find(u => u.uid === c.unitUid);
    const visible = (owner?.hand || []).filter(card => !card._pendingDraw);
    b.discardPick = { unitUid: owner.uid,
      indexes: visible.slice(-c.need).map(card => (owner.hand || []).indexOf(card)) };
    window.BattleSystem?.confirmDiscard?.(window.state, () => {});
  });
  await page.evaluate(() => {
    const b = window.state?.battle;
    if (b?.noaCharmDiscard) { b.noaCharmDiscard = null; b.discardPick = null; window.render?.(); }
  });
};

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

async function boot(browser, allies) {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await dismissOpeningStory(page);
  await page.locator("[data-open-butler]").waitFor({ state: "visible", timeout: 30000 });
  await page.evaluate(list => {
    const st = window.state;
    const c = st.chars.find(x => x.id === "noa");
    if (c) { c.locked = false; c.level = 10; }
    st.view = "hall";
    st.testAllies = list;
    st.testEnemies = [0];
    st.hallModal = "testBattle";
    st.settings = st.settings || {};
    st.settings.battleSpeed = 2;
    window.render?.();
  }, allies);
  await page.locator("[data-start-test-battle]").waitFor({ state: "visible", timeout: 15000 });
  await page.locator("[data-start-test-battle]").evaluate(el => el.click());
  await page.locator(".battle-screen").waitFor({ state: "visible", timeout: 30000 });
  // 其他我方角色默认会卡在「手牌超过上限，需要弃置 N 张」的玩家交互阶段，
  // 导致回合推不到诺亚；放宽其上限（不影响诺亚，她的上限由技能动态给出）。
  await page.evaluate(() => {
    const b = window.state?.battle;
    (b?.allies || []).forEach(u => { if (u.ref !== "noa") u.stats.handLimit = 20; });
  });
  // 字幕/战报监听：气泡只停留 6 秒且会被覆盖，state.log 也会滚动，故全程记录。
  await page.evaluate(() => {
    window.__captions = [];
    window.__logs = [];
    const grab = () => {
      const s = window.state?.battle?.speech;
      if (s) {
        const texts = (s.lines || []).map(x => x.text).concat(s.text ? [s.text] : []);
        texts.forEach(t => { if (t && !window.__captions.includes(t)) window.__captions.push(t); });
      }
      (window.state?.battle?.skillCaptions || []).forEach(x => {
        if (x?.text && !window.__captions.includes(x.text)) window.__captions.push(x.text);
      });
      (window.state?.log || []).forEach(l => {
        if (l && !window.__logs.includes(l)) window.__logs.push(l);
      });
    };
    grab();
    window.__captionTimer = setInterval(grab, 40);
    // 零丢失时间线：拦截 battle.speech 的每一次赋值。字幕即便只存在一帧也会被记下，
    // 用于区分「台词真的没显示」与「显示了但 40ms 轮询漏抓」。
    window.__speechTimeline = [];
    const battleRef = window.state?.battle;
    let speechValue = battleRef?.speech;
    if (battleRef) Object.defineProperty(battleRef, "speech", {
      configurable: true, enumerable: true,
      get: () => speechValue,
      set: next => {
        const texts = (next?.lines || []).map(x => x.text)
          .concat(next?.text ? [next.text] : []);
        window.__speechTimeline.push({
          t: Math.round(performance.now()), texts, id: next?.id || null,
        });
        speechValue = next;
      },
    });
  });
  return { page, errors };
}

// 真实推进回合：敌方 AI 自动行动，其他我方停在出牌阶段时点「结束出牌」。
// 不开后门改 activeUid，保证走的是完整回合链。
async function waitNoaTurn(page, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  let last = null, stall = { sig: "", n: 0 };
  while (Date.now() < deadline) {
    const s = await page.evaluate(() => {
      const b = window.state?.battle;
      const n = (b?.allies || []).find(u => u.ref === "noa");
      const active = (b?.allies || []).concat(b?.enemies || []).find(u => u.uid === b?.activeUid);
      return {
        active: b?.activeUid, uid: n?.uid, phase: b?.phase,
        locked: b?.locked, battle: !!b,
        activeAlly: !!active && active.side === "ally",
        // 淫气改造溢出弃牌挂起时 UI 只渲染「确认弃置」，不渲染「结束出牌」。
        charm: !!b?.noaCharmDiscard,
        charmNeed: b?.noaCharmDiscard?.need || 0,
        endBtn: !!document.querySelector("[data-end-play]"),
        confirmBtn: !!document.querySelector("[data-confirm-discard]"),
        skipBtn: [...document.querySelectorAll(
          "[data-skip-extract],[data-gerda-comfort-skip],[data-mieryula-skip]," +
          "[data-karuna-bubble-skip],[data-aileng-drill-skip]")]
          .some(el => !el.disabled),
      };
    });
    last = s;
    stall = stallOf(stall, JSON.stringify([s.active, s.phase, s.locked,
      s.activeAlly, s.endBtn, s.confirmBtn, s.skipBtn, s.charm]));
    // 弃牌挂起未清时不能返回「可出牌」：此时没有 [data-end-play]，
    // 直接点会等 30s 超时（ui-hand-view.js 的 modes.discard 分支）。
    if (s.battle && s.active === s.uid && s.phase === 4 && !s.locked && !s.charm) return s;
    if (s.battle) await dismissSpeech(page);
    // 不能因为 activeUid 提前切到诺亚就返回：准备/判定/摸牌阶段点 endPlay 会被
    // 「phase !== 4」直接吞掉，导致结束阶段压根没跑。狂暴场景由 C 段独立循环处理。
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
      await settleCharmDiscard(page);
    } else if (s.battle && s.phase === 5 && s.confirmBtn) {
      // 标准弃牌阶段必须先选够 need 张再确认；只点「确认弃置」会被
      // confirmDiscard 以「还需选择 N 张弃牌」拒绝，回合永远停在 phase 5。
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
      // 卡住 3 秒：登场字幕已由 dismissSpeech 每拍点掉，这里清残留确认框 /
      // 未行动的敌方回合。active 是诺亚时不点 end-play，避免点掉自己的出牌阶段。
      await forceAdvance(page, s.active === s.uid);
    }
    await page.waitForTimeout(250);
  }
  const diag = await page.evaluate(() => {
    const b = window.state?.battle || {};
    const prompts = {};
    for (const [k, v] of Object.entries(b)) {
      if (v && typeof v === "object" && !Array.isArray(v)
        && /prompt|picker|reveal|resume|pending|guard|queue/i.test(k)) {
        prompts[k] = Object.keys(v).slice(0, 6);
      }
    }
    const buttons = [...document.querySelectorAll("button,[role=button]")]
      .filter(x => x.offsetParent !== null)
      .map(x => ({ t: (x.textContent || "").trim().slice(0, 16), d: !!x.disabled,
        a: Object.keys(x.dataset).map(k => `data-${k}`).join(",") || x.className })).slice(0, 16);
    return { prompts, buttons, speech: b.speech && {
      text: (b.speech.text || "").slice(0, 24), dismissible: b.speech.dismissible,
      introPause: b.speech.introPause } };
  }).catch(() => null);
  console.log(`DIAG waitNoaTurn timeout last=${JSON.stringify(last)} diag=${JSON.stringify(diag)}`);
  return null;
}

const stateOf = page => page.evaluate(() => {
  const b = window.state?.battle;
  const noa = (b?.allies || []).find(u => u.ref === "noa");
  return {
    log: window.__logs || [],
    captions: window.__captions || [],
    endCalls: window.__endCalls || [],
    frenzy: window.__frenzy || [],
    noa: noa ? {
      hp: noa.hp, intent: noa.intent, attack: (noa.stats?.attack || 0) + (noa.tempAttack || 0),
      hand: (noa.hand || []).filter(c => !c._pendingDraw).length,
      skip: !!noa.skipPlayPhase, reason: noa.skipPlayReason || null,
      frenzyTurn: noa._noaFrenzyTurn ?? null,
    } : null,
    allies: (b?.allies || []).map(u => ({ ref: u.ref, gender: u.gender, hp: u.hp, name: u.name })),
    enemies: (b?.enemies || []).map(u => ({ ref: u.ref, hp: u.hp, name: u.name })),
    turn: b?.turn, phase: b?.phase, activeUid: b?.activeUid,
  };
});

// ---------- A 真实出牌链路 ----------
async function segA(browser) {
  const { page, errors } = await boot(browser, ["noa", "lokar"]);
  try {
    const turn = await waitNoaTurn(page);
    T("A0 真实推进到诺亚出牌阶段", !!turn, turn);
    if (!turn) return;
    const played = await page.evaluate(() => {
      const b = window.state.battle;
      const noa = b.allies.find(u => u.ref === "noa");
      const foe = b.enemies.find(u => u.hp > 0);
      const i0 = noa.intent;
      const card = { name: "杀（普攻）", type: "slash", suit: "♠", power: 0, scale: "attack" };
      noa.hand.push(card);
      const ok = window.BattleSystem.useCard(window.state, noa, foe, card);
      return { ok, i0, i1: noa.intent, foeHp: foe.hp };
    });
    T("A1 真实 useCard 链路打出杀牌", played.ok !== false, played);
    T("A2 淫气改造令杀牌不消耗杀意", played.i1 === played.i0, played);
    let snap = null;
    for (let i = 0; i < 40; i++) {
      snap = await stateOf(page);
      if (snap.captions.some(t => t.includes(KILL_LINE))) break;
      await page.waitForTimeout(120);
    }
    T("A3 使用杀台词在界面字幕播放", snap.captions.some(t => t.includes(KILL_LINE)), {
      captions: snap.captions.slice(0, 8), log: snap.log.slice(0, 3),
    });
    T("A4 台词归属诺亚（战报有使用杀记录）", snap.log.some(l => l.includes("怪面诺亚") && l.includes("杀")), snap.log.slice(0, 4));
    T("A5 无页面错误", relevantErrors(errors).length === 0, relevantErrors(errors).slice(0, 3));
  } finally { await page.evaluate(() => clearInterval(window.__captionTimer)).catch(() => {}); await page.close(); }
}

// ---------- B 真实结束阶段 ----------
async function segB(browser) {
  const { page, errors } = await boot(browser, ["noa", "lokar"]);
  try {
    await page.evaluate(() => {
      const orig = window.NoaSideEffectSkills.endTurn;
      window.__endCalls = [];
      window.NoaSideEffectSkills.endTurn = function (...a) {
        window.__endCalls.push({
          unit: a[1]?.name,
          males: (a[0]?.battle?.allies || [])
            .filter(u => u.gender === "male" && u.hp > 0).map(u => u.name),
          amount: (a[1]?.stats?.attack || 0) + (a[1]?.tempAttack || 0),
        });
        return orig.apply(this, a);
      };
      // 台词请求是同步的，字幕本身异步入队；分开记录才能判定
      // 「没显示」究竟是没请求、被取消，还是仅仅晚到没被捕捉。
      window.__skillCalls = [];
      const origSkill = window.BattleLines?.skill;
      if (origSkill) window.BattleLines.skill = function (...a) {
        window.__skillCalls.push({ name: a[2], unit: a[1]?.name, t: Date.now() });
        return origSkill.apply(this, a);
      };
    });
    const turn = await waitNoaTurn(page);
    T("B0 真实推进到诺亚出牌阶段", !!turn, turn);
    if (!turn) return;
    const before = await stateOf(page);
    const male = before.allies.find(u => u.gender === "male");
    const attack = before.noa?.attack;
    T("B0b 队伍含存活男性队友", !!male && male.hp > 0, { male, attack });
    // 真实点击「结束出牌」按钮，跑完 BattleSystem.endPlay → 结束阶段各钩子 → cleanupTurn。
    await settleCharmDiscard(page);
    await page.locator("[data-end-play]").evaluate(el => el.click());
    // 伤害快照：等钩子执行且男性队友 hp 真的掉了再取，避免异步结算未落地就断言。
    let hurtSnap = null;
    for (let i = 0; i < 60; i++) {
      hurtSnap = await stateOf(page);
      const m = hurtSnap.allies.find(u => u.gender === "male");
      if (hurtSnap.endCalls.length && male && m && m.hp < male.hp) break;
      await page.waitForTimeout(120);
    }
    // BattleLines.skill 用 setTimeout(0) 把台词推进 speech.showSkillPages，
    // 且结束阶段紧接回合切换。原循环以「钩子已执行」提前 break，字幕常晚于这一帧，
    // 造成 B4 偶发误报；这里给字幕独立的等待窗口，__captions 是累积数组不会丢历史。
    let snap = hurtSnap, lineTicks = -1;
    for (let i = 0; i < 60; i++) {
      snap = await stateOf(page);
      if (snap.captions.some(t => t.includes(HURT_LINE))) { lineTicks = i; break; }
      await page.waitForTimeout(120);
    }
    const skillCalls = await page.evaluate(() => window.__skillCalls || []);
    const timeline = await page.evaluate(() => window.__speechTimeline || []);
    const shown = timeline.filter(e => e.texts.some(t => t.includes(HURT_LINE)));
    const lifetimeMs = shown.map(e => {
      const i = timeline.indexOf(e);
      return i + 1 < timeline.length ? timeline[i + 1].t - e.t : null;
    });
    console.log(`DIAG lineTicks=${lineTicks} skillRequests=${skillCalls.filter(c => c.name === "改造副作用").length}`
      + ` endCalls=${hurtSnap.endCalls.length} speechShown=${shown.length}`
      + ` captionGrabbed=${snap.captions.some(t => t.includes(HURT_LINE)) ? 1 : 0}`
      + ` lifetimeMs=${JSON.stringify(lifetimeMs)}`);
    const afterMale = hurtSnap.allies.find(u => u.gender === "male");
    T("B1 真实结束阶段对其他存活男性造成伤害", !!male && !!afterMale && male.hp - afterMale.hp === attack, {
      before: male?.hp, after: afterMale?.hp, attack,
    });
    // 原断言写死 3（诺亚 0 级攻击力）。全属性翻倍后应为 6；这里改为跟随
    // 运行时 attack，避免以后再调属性倍率时又过期，同时 attack>0 防止 0 值空转。
    T("B2 伤害数值=诺亚攻击力", attack > 0 && male.hp - afterMale.hp === attack,
      { attack, delta: male.hp - afterMale.hp });
    T("B3 改造副作用结束阶段钩子真实执行", hurtSnap.endCalls.length >= 1
      && hurtSnap.endCalls.some(c => c.unit === "怪面诺亚" && c.males.length === 1 && c.amount === attack),
      hurtSnap.endCalls);
    // 以 speech 赋值时间线为准（零丢失），captions 轮询仅作对照：
    // speechShown>0 而 captionGrabbed=0，即「台词已显示、只是被轮询漏抓」。
    T("B4 对男性伤害台词在界面字幕播放", shown.length > 0, {
      captions: snap.captions.slice(0, 8),
      requested: skillCalls.filter(c => c.name === "改造副作用").length,
      lineTicks, speechShown: shown.length, lifetimeMs,
      timelineTail: timeline.slice(-6),
    });
    const beforeOthers = before.allies.filter(u => u.gender === "female").map(u => u.hp).join(",");
    const afterOthers = hurtSnap.allies.filter(u => u.gender === "female").map(u => u.hp).join(",");
    T("B5 女性队友未吃该伤害", beforeOthers === afterOthers, { beforeOthers, afterOthers });
    T("B6 无页面错误", relevantErrors(errors).length === 0, relevantErrors(errors).slice(0, 3));
  } finally { await page.evaluate(() => clearInterval(window.__captionTimer)).catch(() => {}); await page.close(); }
}

// ---------- C 真实狂暴 ----------
async function segC(browser) {
  // 只带诺亚一人：队友的结束阶段提示（如格尔达萌虎慰劳）会挂起回合，
  // 用单人队伍才能干净地把回合推到诺亚的准备阶段。
  const { page, errors } = await boot(browser, ["noa"]);
  try {
    await page.evaluate(() => {
      const orig = window.NoaSideEffectSkills.beginPlayPhase;
      window.__frenzy = [];
      window.NoaSideEffectSkills.beginPlayPhase = function (...a) {
        const fired = orig.apply(this, a);
        window.__frenzy.push({ turn: a[0]?.battle?.turn, fired });
        return fired;
      };
    });
    // 不等 phase 4：狂暴会在出牌阶段开始就跳过，phase 4 一闪而过。
    // 别人（敌方 AI / 格尔达）的回合要点「结束出牌」才能把回合推到诺亚。
    let snap = null, stall = { sig: "", n: 0 };
    for (let i = 0; i < 240; i++) {
      snap = await stateOf(page);
      if (snap.log.some(l => l.includes("虚拟【咬杀】"))) break;
      const step = await page.evaluate(() => {
        const b = window.state?.battle;
        const active = (b?.allies || []).concat(b?.enemies || []).find(u => u.uid === b?.activeUid);
        const noa = (b?.allies || []).find(u => u.ref === "noa");
        return {
          activeIsNoa: active?.uid === noa?.uid,
          activeAlly: active?.side === "ally", phase: b?.phase,
          locked: b?.locked, endBtn: !!document.querySelector("[data-end-play]"),
          confirmBtn: !!document.querySelector("[data-confirm-discard]"),
          skipBtn: [...document.querySelectorAll(
            "[data-skip-extract],[data-gerda-comfort-skip],[data-mieryula-skip]," +
            "[data-karuna-bubble-skip],[data-aileng-drill-skip]")]
            .some(el => !el.disabled),
        };
      });
      stall = stallOf(stall, JSON.stringify([step.activeIsNoa, step.activeAlly,
        step.phase, step.locked, step.endBtn, step.confirmBtn, step.skipBtn]));
      await dismissSpeech(page);
      if (step.skipBtn) {
        await page.evaluate(() => {
          const el = [...document.querySelectorAll(
            "[data-skip-extract],[data-gerda-comfort-skip],[data-mieryula-skip]," +
            "[data-karuna-bubble-skip],[data-aileng-drill-skip]")]
            .find(x => !x.disabled);
          if (el) el.click();
        });
      }
      if (step.phase === 5 && step.confirmBtn) {
        await page.locator("[data-confirm-discard]").evaluate(el => el.click()).catch(() => {});
      } else if (step.activeAlly && !step.activeIsNoa && step.phase === 4 && !step.locked && step.endBtn) {
        await page.locator("[data-end-play]").evaluate(el => el.click()).catch(() => {});
      } else if (stall.n >= 12 || i >= 120) {
        await forceAdvance(page, step.activeIsNoa);
      }
      await page.waitForTimeout(200);
    }
    T("C0 队伍中无存活男性（全女性）", snap.allies.every(u => u.gender !== "male" || u.hp <= 0), snap.allies);
    T("C1 狂暴战报：随机虚拟【咬杀】", snap.log.some(l => l.includes("虚拟【咬杀】")), snap.log.slice(0, 6));
    T("C2 出牌阶段被跳过", snap.frenzy.some(f => f.fired === true)
      || snap.log.some(l => l.includes("跳过出牌阶段")) || snap.noa?.skip === true, {
      frenzy: snap.frenzy, skip: snap.noa?.skip, log: snap.log.slice(0, 6),
    });
    T("C3 跳过原因标记为改造副作用", snap.noa?.reason === "改造副作用"
      || snap.log.some(l => l.includes("因改造副作用跳过")), {
      reason: snap.noa?.reason, log: snap.log.slice(0, 6),
    });
    // 虚拟咬杀必须真的走 useVirtualKill 造成伤害，不能只有日志。
    const dealt = await page.evaluate(() => {
      const b = window.state.battle;
      const all = (b?.allies || []).concat(b?.enemies || []);
      return { damaged: all.filter(u => u.hp < u.maxHp).map(u => ({ name: u.name, hp: u.hp, maxHp: u.maxHp })) };
    });
    T("C4 虚拟咬杀真实驱动了伤害链路", dealt.damaged.length > 0, dealt);
    T("C5 同一回合只狂暴一次", snap.frenzy.filter(f => f.fired === true).length === 1, {
      frenzy: snap.frenzy, turn: snap.turn,
    });
    T("C6 无页面错误", relevantErrors(errors).length === 0, relevantErrors(errors).slice(0, 3));
  } finally { await page.evaluate(() => clearInterval(window.__captionTimer)).catch(() => {}); await page.close(); }
}

// ---------- D 他人出牌后的手牌平衡（严格检查副作用） ----------
async function segD(browser) {
  const { page, errors } = await boot(browser, ["noa", "lokar"]);
  try {
    const turn = await waitNoaTurn(page);
    T("D0 真实推进到诺亚出牌阶段", !!turn, turn);
    if (!turn) return;
    const r = await page.evaluate(async () => {
      const st = window.state, b = st.battle;
      const noa = b.allies.find(u => u.ref === "noa");
      const other = b.allies.find(u => u.ref !== "noa");
      const limit = window.UICommon.handLimit(noa);
      // 造出「诺亚手牌多于上限」：这是 resume-hooks 以出牌者(actor)调用平衡时的分支。
      const mk = i => ({ name: "测试牌" + i, type: "tactic", suit: "♠" });
      const extra = [mk(1), mk(2), mk(3)];
      // 基准手牌只取计入上限的牌：状态牌不计入手牌上限（countsForLimit），
      // 混进基准会让权威 overflow 从 3 变 2，下面按 extraCount=3 写的断言口径
      // 就不成立。淫气改造现在按权威计数，也不该弃掉那张状态牌。
      const base = noa.hand.filter(c => !c._pendingDraw
        && !window.BattleStatusCards?.isStatus?.(c)).slice(0, limit);
      noa.hand = base.concat(extra);
      const before = noa.hand.length;
      const foeDiscardBefore = (other.discard || []).length;
      const noaDiscardBefore = (noa.discard || []).length;
      const sharedPile = other.discard === noa.discard;
      // 我方共用一条队伍弃牌堆，光看长度会误判「进了他人牌堆」，直接盯 put 的归属参数。
      const puts = [];
      const logTexts = [];
      const origPut = window.BattleCards?.put;
      const origPutMany = window.BattleCards?.putMany;
      const origLogAdd = window.BattleLog?.add;
      const capture = (unit, pile) => puts.push({ unit: unit?.ref, pile });
      if (origPut) window.BattleCards.put = function (...a) {
        puts.push({ unit: a[1]?.ref, pile: a[3] });
        return origPut.apply(this, a);
      };
      if (origPutMany) window.BattleCards.putMany = function (...a) {
        (a[2] || []).forEach(() => capture(a[1], a[3]));
        return origPutMany.apply(this, a);
      };
      if (origLogAdd) window.BattleLog.add = function (...a) {
        logTexts.push(a[1]);
        return origLogAdd.apply(this, a);
      };
      // 模拟 battle-card-resume-hooks.js: actor 是别的角色。
      window.NoaCharmSkills.balanceHand(st, other, window.BattleSystem.draw);
      // 【淫气改造】多于上限：不弹专用窗，开弃牌阶段同款挂起，
      // 再走真实 confirmDiscard → discardCards 一次性结算（挑末尾正好弃掉 extra）。
      const popup = b.noaCharmDiscard ? "noaCharmDiscard" : null;
      const need = b.noaCharmDiscard?.need || 0;
      const visible = noa.hand.filter(c => !c._pendingDraw);
      if (need > 0) {
        b.discardPick = {
          unitUid: noa.uid,
          indexes: visible.slice(-need).map(c => visible.indexOf(c)),
        };
        await window.BattleSystem.confirmDiscard(st, () => {});
      }
      if (origPut) window.BattleCards.put = origPut;
      if (origPutMany) window.BattleCards.putMany = origPutMany;
      if (origLogAdd) window.BattleLog.add = origLogAdd;
      const handAfter = (noa.hand || []).filter(c => !c._pendingDraw);
      const allPiles = (b.allies || []).concat(b.enemies || [])
        .flatMap(u => (u.discard || []).concat(u.consumed || []));
      // 同一对象既留在手牌又被放进牌堆 = 复制。
      const duplicated = handAfter.filter(c => allPiles.includes(c)).length;
      const ownerWrong = allPiles.filter(c => extra.includes(c) && !(noa.discard || []).includes(c)
        && !(noa.consumed || []).includes(c)).length;
      return {
        limit, before, after: handAfter.length,
        otherName: other.name, noaName: noa.name, sharedPile,
        foeDiscardDelta: (other.discard || []).length - foeDiscardBefore,
        noaDiscardDelta: (noa.discard || []).length - noaDiscardBefore,
        duplicated, ownerWrong, puts, logs: logTexts,
        stillInHand: extra.filter(c => handAfter.includes(c)).length,
        extraCount: extra.length, popup, need,
      };
    });
    T("D1 构造出诺亚手牌超限", r.before > r.limit, r);
    T("D1b 他人出牌后先开弃牌阶段同款挂起（不自动弃）",
      r.popup === "noaCharmDiscard" && r.need === r.extraCount, { popup: r.popup, need: r.need });
    T("D2 他人出牌后诺亚手牌被弃至上限", r.after === r.limit, r);
    T("D3 弃出的牌不再留在诺亚手牌", r.stillInHand === 0, r);
    T("D4 弃牌进入诺亚自己的牌堆（归属正确）", r.ownerWrong === 0 && r.noaDiscardDelta === r.extraCount, r);
    T("D5 put 归属全是诺亚、未落到他人/敌方", r.puts.length === r.extraCount
      && r.puts.every(p => p.unit === "noa"), { puts: r.puts, sharedPile: r.sharedPile });
    T("D6 没有出现同一张牌被复制", r.duplicated === 0, r);
    T("D7 战报归属写的是诺亚本人", r.logs.length >= 1
      && r.logs.every(l => l.includes(r.noaName)) && !r.logs.some(l => l.includes(r.otherName)), r.logs);
    T("D8 无页面错误", relevantErrors(errors).length === 0, relevantErrors(errors).slice(0, 3));
  } finally { await page.evaluate(() => clearInterval(window.__captionTimer)).catch(() => {}); await page.close(); }
}

// ---------- 通用推进循环 ----------
// 与 segC 同口径：狂暴场景的出牌阶段一闪而过，不能靠 waitNoaTurn 长期停在 phase 4。
// 返回 { snap, sawPlay }，sawPlay 记录是否真的进入过诺亚的出牌阶段。
async function advance(page, stop, maxTicks = 220) {
  let snap = null, sawPlay = false, step = null, stall = { sig: "", n: 0 };
  for (let i = 0; i < maxTicks; i++) {
    snap = await stateOf(page);
    step = await page.evaluate(() => {
      const b = window.state?.battle;
      const active = (b?.allies || []).concat(b?.enemies || []).find(u => u.uid === b?.activeUid);
      const noa = (b?.allies || []).find(u => u.ref === "noa");
      return {
        activeIsNoa: !!noa && active?.uid === noa.uid,
        activeAlly: !!active && active.side === "ally",
        phase: b?.phase, locked: b?.locked,
        charm: !!b?.noaCharmDiscard, charmNeed: b?.noaCharmDiscard?.need || 0,
        endBtn: !!document.querySelector("[data-end-play]"),
        confirmBtn: !!document.querySelector("[data-confirm-discard]"),
        skipBtn: [...document.querySelectorAll(
          "[data-skip-extract],[data-gerda-comfort-skip],[data-mieryula-skip]," +
          "[data-karuna-bubble-skip],[data-aileng-drill-skip]")]
          .some(el => !el.disabled),
      };
    });
    stall = stallOf(stall, JSON.stringify([step.activeIsNoa, step.activeAlly,
      step.phase, step.locked, step.endBtn, step.confirmBtn, step.skipBtn, step.charm]));
    if (step.activeIsNoa && step.phase === 4) sawPlay = true;
    // 挂起未清时即使 sawPlay 为真也不能返回：UI 没有「结束出牌」，
    // segE B 段会直接点 [data-end-play] 等 30s 超时。
    if (step.charm) { await settleCharmDiscard(page); continue; }
    if (stop(snap, sawPlay, step)) break;
    await dismissSpeech(page);
    if (step.skipBtn) {
      await page.evaluate(() => {
        const el = [...document.querySelectorAll(
          "[data-skip-extract],[data-gerda-comfort-skip],[data-mieryula-skip]," +
          "[data-karuna-bubble-skip],[data-aileng-drill-skip]")]
          .find(x => !x.disabled);
        if (el) el.click();
      });
    }
    if (step.phase === 5 && step.confirmBtn) {
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
    } else if (step.activeAlly && !step.activeIsNoa && step.phase === 4 && !step.locked && step.endBtn) {
      // 只推别人的回合，绝不点掉诺亚自己的出牌阶段。
      await page.locator("[data-end-play]").evaluate(el => el.click()).catch(() => {});
    } else if (stall.n >= 12 || i >= 80) {
      await forceAdvance(page, step.activeIsNoa);
    }
    await page.waitForTimeout(200);
  }
  return { snap, sawPlay, step };
}

// ---------- E 反向验证（运行时禁用对应技能） ----------
async function segE(browser) {
  // 逐项禁用，确认 A/B/C 的断言真的在把关。
  const cases = [
    { key: "playKill", label: "E1 禁用使用杀台词后 A3 必须变红", disable: "playKillLine", seg: "A" },
    { key: "endTurn", label: "E2 禁用结束阶段后 B1/B4 必须变红", disable: "endTurn", seg: "B" },
    { key: "beginPlay", label: "E3 禁用狂暴后 C1/C2 必须变红", disable: "beginPlayPhase", seg: "C" },
  ];
  for (const c of cases) {
    if (E_ONLY.length && !E_ONLY.includes(c.key)) continue;
    const { page } = await boot(browser, c.seg === "C" ? ["noa"] : ["noa", "lokar"]);
    try {
      await page.evaluate(key => {
        if (key === "playKillLine") window.NoaCharmSkills.playKillLine = () => {};
        if (key === "endTurn") window.NoaSideEffectSkills.endTurn = () => true;
        if (key === "beginPlayPhase") window.NoaSideEffectSkills.beginPlayPhase = () => false;
      }, c.disable);
      if (c.seg === "A") {
        const { sawPlay } = await advance(page, (_s, saw) => saw);
        let snap = null;
        if (sawPlay) {
          await page.evaluate(() => {
            const b = window.state.battle;
            const noa = b.allies.find(u => u.ref === "noa");
            const foe = b.enemies.find(u => u.hp > 0);
            const card = { name: "杀（普攻）", type: "slash", suit: "♠", power: 0, scale: "attack" };
            noa.hand.push(card);
            window.BattleSystem.useCard(window.state, noa, foe, card);
          });
          for (let i = 0; i < 30; i++) { snap = await stateOf(page); if (snap.captions.length) break; await page.waitForTimeout(100); }
        }
        T(c.label, sawPlay && !!snap && !snap.captions.some(t => t.includes(KILL_LINE)),
          { sawPlay, captions: snap?.captions || [] });
      } else if (c.seg === "B") {
        const { sawPlay } = await advance(page, (_s, saw) => saw);
        const before = await stateOf(page);
        const male = before.allies.find(u => u.gender === "male");
        if (sawPlay) {
          await settleCharmDiscard(page);
          await page.locator("[data-end-play]").evaluate(el => el.click());
        }
        let snap = null;
        for (let i = 0; i < 40; i++) { snap = await stateOf(page); if (snap.turn !== before.turn) break; await page.waitForTimeout(120); }
        const maleAfter = snap?.allies.find(u => u.gender === "male");
        const noHurt = !!male && !!maleAfter && male.hp === maleAfter.hp;
        const noLine = !snap?.captions.some(t => t.includes(HURT_LINE));
        T(c.label, noHurt && noLine, { sawPlay, noHurt, noLine, male: male?.hp, maleAfter: maleAfter?.hp });
      } else {
        // 禁用狂暴后：应能正常进入出牌阶段，且没有虚拟咬杀、没有 skipPlayPhase。
        const { snap, sawPlay } = await advance(page, (_s, saw) => saw, 200);
        T(c.label, sawPlay === true && !snap.log.some(l => l.includes("虚拟【咬杀】"))
          && snap.noa?.skip !== true, {
          sawPlay, log: snap.log.slice(0, 4), skip: snap.noa?.skip, phase: snap.phase,
        });
      }
    } finally { await page.evaluate(() => clearInterval(window.__captionTimer)).catch(() => {}); await page.close(); }
  }
}

(async () => {
  const browser = await chromium.launch();
  try {
    if (SEGS.includes("A")) await segA(browser);
    if (SEGS.includes("B")) await segB(browser);
    if (SEGS.includes("C")) await segC(browser);
    if (SEGS.includes("D")) await segD(browser);
    if (SEGS.includes("E")) await segE(browser);
  } finally { await browser.close(); }
  console.log(`\nRESULT ${pass}/${total}` + (REVERT ? ` REVERT=${REVERT}` : ""));
  if (pass !== total) process.exit(1);
})();
