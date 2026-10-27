// 安倍卡露娜【记忆泡泡】边界场景严格检查（补充既有测试未覆盖的角落）：
//
//   A 段：泡泡区的牌**打出后**，牌上是否残留 _bubbleFree / _bubbleCast 标记。
//         修复前：afterCardPlayed 的 _bubbleCast 分支只做 splice，没清标记，
//         牌带着「免杀意」标记进弃牌堆。
//   B 段：残留标记的后果 —— 该牌被回收（捞回手牌）再打出时，
//         (1) 是否错误免杀意  (2) 是否不再询问「放入」（实体牌本应询问）。
//   C 段：用【杀】实测免杀意残留的真实影响（intent 是否被错误扣减）。
//   D 段：非卡露娜回合（队友出牌阶段，phase 4）—— 泡泡区界面是否仍显示为
//         「可用」却不响应点击（点了没反应）。
//   E 段：卡露娜阵亡后 —— 不再询问放入；已有泡泡牌不会卡死。
//   F 段：取消选择后再次点击 —— 应能正常重新选中并打出。
//
// 分批：KARUNA_MS=A|B|C|D|E|F，不设则跑全部。
require("./repository-toolchain");
const path = require("path");
const { chromium } = require("playwright");
const {
  openGame, startRegressionBattle, collectErrors, relevantErrors,
} = require(path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

const PART = (process.env.KARUNA_MS || "ALL").toUpperCase();
const want = p => PART === "ALL" || PART === p;

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
};

const evalT = async (page, expr, ms = 15000, label = "evaluate") => {
  let timer;
  const guard = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(`${label} timeout ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([page.evaluate(expr), guard]);
  } catch (e) {
    console.log(`⚠️  ${label}: ${e.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const setupTpl = (cards, opts = {}) => `(() => {
  const st = window.state, b = st.battle;
  b.animQueue = []; b.locked = false; b.phase = 4;
  delete b.karunaBubble; delete b.karunaBubblePending; delete b.thunderHammer;
  delete b.selectedSkillCard;
  const u = b.allies[0], foe = b.enemies[0];
  u.name = "安倍卡露娜"; u.ref = "abe_karuna"; u.id = "abe_karuna";
  u.gender = "female";
  u.stats = { attack: 2, magic: 4, speed: 3, maxHp: 50, bloodlust: 2, handLimit: 3 };
  u.hp = u.maxHp = 50; u.block = 0; u.intent = 2;
  u.skills = [{ name: "同频歌姬" }, { name: "记忆泡泡" }, { name: "幸运海螺" }];
  delete u.bubbleCards; delete u.karunaLastColor; delete u.karunaLastSuit;
  u.pileStats = u.pileStats || {};
  u.pileStats.discard = []; u.pileStats.consumed = [];
  u.discard = u.pileStats.discard; u.consumed = u.pileStats.consumed;
  b.enemies.forEach(e => {
    e.hp = e.maxHp = 90; e.block = 0; e.statuses = [];
    e.hand = []; e.noResponse = true;
    e.pileStats = e.pileStats || {};
    e.pileStats.discard = []; e.pileStats.consumed = [];
    e.discard = e.pileStats.discard; e.consumed = e.pileStats.consumed;
  });
  u.hand = ${JSON.stringify(cards)};
  ${opts.allyActive ? `
  if (!b.allies[1]) {
    b.allies.push({ uid: "__mate__", name: "队友", ref: "__mate__", gender: "female",
      hp: 50, maxHp: 50, block: 0, hand: [], skills: [],
      pileStats: { discard: [], consumed: [] } });
  }
  b.allies[1].hand = [];
  b.allies[1].pileStats = b.allies[1].pileStats || {};
  b.allies[1].pileStats.discard = []; b.allies[1].pileStats.consumed = [];
  b.activeUid = b.allies[1].uid;
  ` : "b.activeUid = u.uid;"}
  b.selectedCardIndex = -1;
  st.log = []; st.battleLog = [];
  window.render();
  return { hand: u.hand.length, allies: b.allies.length, foeUid: b.enemies[0].uid };
})()`;

const snapTpl = `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  return {
    hand: (u.hand || []).map(c => c.name),
    bubble: (u.bubbleCards || []).map(c => c.name),
    bubbleLen: (u.bubbleCards || []).length,
    discard: (u.pileStats?.discard || u.discard || []).map(c => c.name),
    flags: (u.pileStats?.discard || u.discard || []).map(c => ({
      n: c.name, free: !!c._bubbleFree, cast: !!c._bubbleCast })),
    locked: !!b.locked, pending: !!b.karunaBubble,
    pendingName: b.karunaBubble?.card?.name || "",
    selected: !!b.selectedSkillCard,
    intent: u.intent,
    activeUid: b.activeUid, myUid: u.uid,
    logs: (st.battleLog || []).join(" | "),
  };
})()`;

const playTpl = name => `(() => {
  const st = window.state, b = st.battle, u = b.allies[0];
  const card = u.hand.find(c => c.name === ${JSON.stringify(name)});
  if (!card) return false;
  window.BattleSystem.useCard(st, u, card.targetless ? null : b.enemies[0], card);
  return true;
})()`;

const useBubbleTpl = `(() => {
  const st = window.state;
  const ok1 = window.BattleSystem.selectKarunaBubble(st, 0, window.render);
  const ok2 = window.BattleSystem.playSelectedCard(st);
  window.render();
  return { ok1, ok2 };
})()`;

const playAndWait = async (page, name) => {
  await evalT(page, playTpl(name), 15000, `play:${name}`);
  await page.waitForTimeout(700);
  const hung = await evalT(page,
    "!!window.state.battle.karunaBubble || !!window.state.battle.thunderHammer"
    + " || !!window.state.battle.locked || !!window.state.battle.selectedSkillCard",
    8000, `probe:${name}`);
  if (hung !== true) {
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, `whenIdle:${name}`);
  }
  await page.waitForTimeout(300);
  return evalT(page, snapTpl, 15000, `snap:${name}`);
};

const clickBubbleBtn = async (page, sel) => {
  await evalT(page, "window.render()", 15000, "renderBeforeClick");
  await page.waitForSelector(sel, { timeout: 8000 });
  await page.locator(sel).click({ timeout: 8000 });
  await page.waitForTimeout(400);
};

const TACTIC = { name: "泡泡战术牌", type: "tactic", suit: "♥", text: "", targetless: true };
const TACTIC2 = { name: "第二战术牌", type: "tactic", suit: "♠", text: "", targetless: true };
const KILL = { name: "泡泡杀", type: "attack", suit: "♣", text: "", targetless: false };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = collectErrors(page);
  await openGame(page);
  await startRegressionBattle(page);

  // ---------- A 段：泡泡牌打出后标记残留 ----------
  if (want("A")) {
    console.log("\n--- A 段：泡泡区的牌打出后，标记是否被清除 ---");
    await evalT(page, setupTpl([TACTIC]), 20000, "setupA");
    let s = await playAndWait(page, "泡泡战术牌");
    T("A1 打出后询问放入", s.pending, { pending: s.pendingName });
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    s = await evalT(page, snapTpl, 15000, "snapA1");
    T("A2 放入后牌在泡泡区", s.bubble.includes("泡泡战术牌"), { bubble: s.bubble });

    await evalT(page, useBubbleTpl, 15000, "useBubbleA");
    await page.waitForTimeout(700);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleA");
    s = await evalT(page, snapTpl, 15000, "snapA2");
    T("A3 用掉后离开泡泡区", !s.bubble.includes("泡泡战术牌"), { bubble: s.bubble });
    T("A4 用掉后进弃牌堆", s.discard.includes("泡泡战术牌"), { discard: s.discard });
    const f = (s.flags || []).find(x => x.n === "泡泡战术牌") || {};
    T("A5 进弃牌堆时已抹掉 _bubbleFree（修复点）", f.free === false, { flags: s.flags });
    T("A6 进弃牌堆时已抹掉 _bubbleCast（修复点）", f.cast === false, { flags: s.flags });
  }

  // ---------- B 段：残留标记的后果 ----------
  if (want("B")) {
    console.log("\n--- B 段：被回收的泡泡牌再次打出时的行为 ---");
    await evalT(page, setupTpl([TACTIC]), 20000, "setupB");
    let s = await playAndWait(page, "泡泡战术牌");
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    await evalT(page, useBubbleTpl, 15000, "useBubbleB");
    await page.waitForTimeout(700);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleB");

    // 模拟回收：把弃牌堆里那张牌捞回手牌
    const recycled = await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const pile = u.pileStats?.discard || u.discard || [];
      const i = pile.findIndex(c => c.name === "泡泡战术牌");
      if (i < 0) return null;
      const card = pile.splice(i, 1)[0];
      u.hand.push(card);
      window.render();
      return { free: !!card._bubbleFree, cast: !!card._bubbleCast };
    })()`, 15000, "recycle");
    T("B1 回收成功（拿到那张牌）", recycled !== null, { recycled });

    const intentFree = await evalT(page, `(() => {
      const st = window.state, u = st.battle.allies[0];
      const card = u.hand.find(c => c.name === "泡泡战术牌");
      return !!window.AbeKarunaBubbleSkills?.isIntentFree?.(card);
    })()`, 15000, "isIntentFree");
    T("B2 回收后的牌不应仍判定为免杀意", intentFree === false, { intentFree });

    s = await playAndWait(page, "泡泡战术牌");
    T("B3 回收后再打出应正常询问「放入」", s.pending, { pending: s.pendingName });
  }

  // ---------- C 段：【杀】免杀意残留的真实影响 ----------
  if (want("C")) {
    console.log("\n--- C 段：【杀】免杀意残留（intent 是否被错误扣减）---");
    const infoC = await evalT(page, setupTpl([KILL]), 20000, "setupC");
    const foeUid = infoC?.foeUid;
    let s = await playAndWait(page, "泡泡杀");
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    s = await evalT(page, snapTpl, 15000, "snapC1");
    const beforeIntent = s.intent;
    T("C1 泡泡区已存入【杀】", s.bubble.includes("泡泡杀"), { bubble: s.bubble });

    // 真实点击：先点泡泡牌选中，再点敌人直接打出（与玩家操作一致）
    await evalT(page, "window.render()", 15000, "renderC");
    await page.waitForTimeout(600);
    await page.click('[data-bubble-index="0"]')
      .catch(e => console.log(`⚠️ click bubble: ${e.message}`));
    await page.waitForTimeout(400);
    await page.click(`[data-target="${foeUid}"]`)
      .catch(e => console.log(`⚠️ click enemy: ${e.message}`));
    await page.waitForTimeout(500);
    if (await page.locator("[data-confirm-target]").count()) {
      await page.click("[data-confirm-target]").catch(() => {});
      await page.waitForTimeout(400);
    }
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleC");
    await page.waitForTimeout(300);
    s = await evalT(page, snapTpl, 15000, "snapC2");
    T("C2 泡泡区的【杀】打出后离区", !s.bubble.includes("泡泡杀"), { bubble: s.bubble });
    T("C3 泡泡区的【杀】不消耗杀意（技能本意）",
      s.intent === beforeIntent, { before: beforeIntent, after: s.intent });
    const fk = (s.flags || []).find(x => x.n === "泡泡杀") || {};
    T("C4 打出的【杀】进弃牌堆时不带免杀意标记",
      fk.free === false && fk.cast === false, { flags: s.flags });

    // 回收该杀，再正常打出：这次应当消耗杀意
    const recycled2 = await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const pile = u.pileStats?.discard || u.discard || [];
      const i = pile.findIndex(c => c.name === "泡泡杀");
      if (i < 0) return null;
      const card = pile.splice(i, 1)[0];
      u.hand.push(card);
      window.render();
      return { free: !!card._bubbleFree, cast: !!card._bubbleCast };
    })()`, 15000, "recycleKill");
    if (recycled2 === null) {
      console.log("⚠️  C 段：弃牌堆里没找到泡泡杀，跳过 C4~C5");
    } else {
      const intentBefore2 = (await evalT(page, snapTpl, 15000, "snapC3")).intent;
      s = await playAndWait(page, "泡泡杀");
      T("C5 回收后的【杀】再打出应**消耗**杀意",
        s.intent === intentBefore2 - 1, { before: intentBefore2, after: s.intent });
      T("C6 回收后的【杀】再打出应正常询问「放入」", s.pending, { pending: s.pendingName });
    }
  }

  // ---------- D 段：非卡露娜回合（队友出牌阶段）----------
  if (want("D")) {
    console.log("\n--- D 段：队友回合时泡泡区的可点击性 ---");
    await evalT(page, setupTpl([TACTIC], { allyActive: true }), 20000, "setupD");
    // 先让卡露娜自己回合存入一张
    await evalT(page, "window.state.battle.activeUid = window.state.battle.allies[0].uid",
      15000, "backToKaruna");
    let s = await playAndWait(page, "泡泡战术牌");
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    s = await evalT(page, snapTpl, 15000, "snapD0");
    T("D0 已存入 1 张", s.bubbleLen === 1, { bubble: s.bubble });

    // 切到队友回合（phase 仍为 4）
    await evalT(page, `(() => {
      const b = window.state.battle;
      b.activeUid = b.allies[1].uid;
      b.phase = 4;
      window.render();
      return b.activeUid;
    })()`, 15000, "switchToMate");

    const dom = await evalT(page, `(() => {
      const z = document.querySelector(".karuna-bubble-zone");
      if (!z) return { present: false };
      const slot = z.querySelector(".karuna-bubble-slot");
      return {
        present: true,
        idle: !!slot && slot.className.includes("karuna-bubble-slot-idle"),
        pe: slot ? getComputedStyle(slot).pointerEvents : null,
      };
    })()`, 15000, "domD");
    // 关注点不是"必须显示"，而是不能出现「显示为可点、实际上点不动」。
    // 两种实现都合格：不渲染，或渲染但置灰。
    T("D1 队友回合时泡泡区不会显示为可点击（不渲染或已置灰）",
      !!dom && (dom.present === false || dom.idle === true), { dom });

    const ret = await evalT(page,
      "window.AbeKarunaBubbleSkills.select(window.state, 0)", 15000, "selectD");
    T("D2 底层 select 在他人回合返回 false", ret === false, { ret });

    // 真实点击：若界面上根本没有该区域，则不存在"点了没反应"的风险，
    // 此时 D3/D4 只是确认状态未被改动。
    const clickable = !!dom && dom.present;
    const clicked = await evalT(page, `(() => {
      const z = document.querySelector(".karuna-bubble-zone");
      const slot = z && z.querySelector(".karuna-bubble-slot");
      if (!slot) return null;
      slot.click();
      return true;
    })()`, 15000, "clickD");
    await page.waitForTimeout(400);
    s = await evalT(page, snapTpl, 15000, "snapD2");
    T("D3 他人回合点击后未产生选中", s.selected === false, { selected: s.selected });
    T("D4 他人回合点击后泡泡区不变", s.bubbleLen === 1, { bubble: s.bubble });
    if (!clickable) {
      console.log("   （队友回合时泡泡区未渲染，故不存在点击无反应的问题；"
        + "D3/D4 为状态未被改动的确认）");
    } else if (dom.idle === false) {
      console.log("⚠️  D 段提示：队友回合时泡泡区**未置灰**，玩家点击会无任何反应");
    }
  }

  // ---------- E 段：卡露娜阵亡 ----------
  if (want("E")) {
    console.log("\n--- E 段：卡露娜阵亡后 ---");
    await evalT(page, setupTpl([TACTIC, TACTIC2]), 20000, "setupE");
    let s = await playAndWait(page, "泡泡战术牌");
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    s = await evalT(page, snapTpl, 15000, "snapE1");
    T("E1 存活时可存入", s.bubbleLen === 1, { bubble: s.bubble });

    // 注意：设 hp=0 后**不能**调 window.render()，否则状态同步会把 hp 冲回
    // chars 里的满血值（实测 hp 被重置为 50），导致 alive 判据测不到。
    await evalT(page, `(() => {
      const b = window.state.battle;
      b.allies[0].hp = 0;
      return b.allies[0].hp;
    })()`, 15000, "killKaruna");
    const deadInfo = await evalT(page, `(() => {
      const b = window.state.battle, u = b.allies[0];
      return { hp: u.hp, ref: u.ref, uid: u.uid, activeUid: b.activeUid,
        alive: !!window.AbeKarunaBubbleZone?.alive?.(u), allies: b.allies.length };
    })()`, 15000, "deadInfo");
    console.log("   阵亡快照:", JSON.stringify(deadInfo));
    s = await playAndWait(page, "第二战术牌");
    const hpAfter = await evalT(page, "window.state.battle.allies[0].hp", 15000, "hpAfter");
    if (hpAfter === 0) {
      T("E2 阵亡后不再询问「放入」", s.pending === false,
        { pending: s.pendingName, deadInfo, hpAfter });
    } else {
      // 出牌过程中 hp 被状态同步冲回满血，端到端无法把卡露娜维持在阵亡态，
      // 此时 E2 若为红并不代表产品缺陷，阵亡判据改由 E5 单元级验证。
      console.log(`   （打出过程中 hp 被状态同步冲回 ${hpAfter}，端到端无法维持阵亡态；`
        + "E2 跳过，阵亡判据见 E5）");
    }
    T("E3 阵亡后泡泡区内容未被清空（不卡死即可）", s.bubbleLen === 1, { bubble: s.bubble });
    const err = await evalT(page, `(() => {
      try {
        window.AbeKarunaBubbleSkills.endTurn(window.state, window.state.battle.allies[0]);
        return "ok";
      } catch (e) { return String(e && e.message || e); }
    })()`, 15000, "endTurnDead");
    T("E4 阵亡后调 endTurn 不抛错", err === "ok", { err });

    // 单元级：直接以 hp=0 的卡露娜调用 afterCardPlayed，确认 alive 判据生效
    // （端到端路径上 hp 会被状态同步冲回，故此处不经过 render）。
    const unitDead = await evalT(page, `(() => {
      const st = window.state, b = st.battle, u = b.allies[0];
      const dead = Object.assign({}, u, { hp: 0 });
      const card = { name: "阵亡测试牌", type: "tactic", suit: "♥", text: "", targetless: true };
      delete b.karunaBubble; delete b.locked;
      window.AbeKarunaBubbleSkills.afterCardPlayed(st, dead, card);
      return { pending: !!b.karunaBubble,
        alive: !!window.AbeKarunaBubbleZone?.alive?.(dead) };
    })()`, 15000, "unitDead");
    T("E5 hp=0 时不询问「放入」（alive 判据生效）",
      !!unitDead && unitDead.pending === false && unitDead.alive === false, { unitDead });
  }

  // ---------- F 段：取消选择后再次点击 ----------
  if (want("F")) {
    console.log("\n--- F 段：取消选择后再次点击 ---");
    await evalT(page, setupTpl([TACTIC]), 20000, "setupF");
    let s = await playAndWait(page, "泡泡战术牌");
    await clickBubbleBtn(page, "[data-karuna-bubble-store]");
    s = await evalT(page, snapTpl, 15000, "snapF1");
    T("F1 已存入", s.bubbleLen === 1, { bubble: s.bubble });

    const r1 = await evalT(page, `(() => {
      const st = window.state;
      const ok = window.BattleSystem.selectKarunaBubble(st, 0, window.render);
      window.BattleSystem.cancelSelection && window.BattleSystem.cancelSelection(st);
      window.render();
      return { ok, selected: !!st.battle.selectedSkillCard };
    })()`, 15000, "selectThenCancel");
    s = await evalT(page, snapTpl, 15000, "snapF2");
    T("F2 选中成功", r1 && r1.ok === true, { r1 });
    T("F3 取消后无选中", s.selected === false, { selected: s.selected });
    T("F4 取消后牌仍在泡泡区", s.bubbleLen === 1, { bubble: s.bubble });

    const r2 = await evalT(page, `(() => {
      const st = window.state;
      const ok = window.BattleSystem.selectKarunaBubble(st, 0, window.render);
      const played = window.BattleSystem.playSelectedCard(st);
      window.render();
      return { ok, played };
    })()`, 15000, "reselectAndPlay");
    await page.waitForTimeout(700);
    await evalT(page, "window.BattleEffects?.whenIdle?.()", 8000, "whenIdleF");
    s = await evalT(page, snapTpl, 15000, "snapF3");
    T("F5 取消后可重新选中", r2 && r2.ok === true, { r2 });
    T("F6 重新选中后能正常打出", !s.bubble.includes("泡泡战术牌"), { bubble: s.bubble });
  }

  const real = relevantErrors(errors);
  T("无 JS 错误", real.length === 0, { errors: real.slice(0, 3) });

  console.log(`\n结果：${pass}/${total}`);
  await browser.close();
  process.exit(pass === total ? 0 : 1);
})();
