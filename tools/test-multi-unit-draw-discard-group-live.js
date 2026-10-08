// 专项：多角色「摸牌 / 弃牌」必须合并成一次性动画（drawGroup / discardGroup）
//
// 背景：draw() / put() 每调用一次各推一条 drawBatch / discardBatch，队列串行播放
// → N 名角色连播 N 段飞牌动画，人越多越慢。物资补给、开局摸牌早已收进
// drawGroup 并行，但仍有技能在「多角色循环」里逐个 draw / put 却没调 pack。
//
// 本轮补齐的 5 处（全库枚举出）：
//   A 萌虎慰劳（gerda）        2 名角色各摸 2
//   B 偶像之星（hoshino_yi）   actor + nonoka 各摸 1
//   C 读书的智慧（wendy）      多名温蒂各摸 1
//   D 模仿（nonoka_loki）      每个模仿者触发一次摸牌
//   E 梦想真理（hoshino_yi）   敌方全体各弃 1
//
// 判据（可证伪）：
//  · 多角色摸牌后，队列里出现 1 条 drawGroup（batches >= 2），而不是 N 条 drawBatch
//  · 多角色弃牌后，队列里出现 1 条 discardGroup（batches >= 2），而不是 N 条 discardBatch
//  · 合并不能吞掉实际效果：手牌确实增加 / 牌确实进弃牌堆
//
// 防假通过：
//  1) 前置断言构造成功（角色在位、牌堆有牌、敌人有手牌），否则"摸 0 张"也算通过；
//  2) 同时统计 drawBatch 条数，确认确实是"合并了"而不是"压根没推事件"；
//  3) 反向验证：撤掉 pack 调用后 A/B/E 应重新出现多条 batch。
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH
  || "/data/workspace/.pw-browsers";
const path = require("path");
const { chromium } = require("playwright");
const { startRegressionBattle } = require(
  path.join(__dirname, "..", "tests", "helpers", "preview-game.js"));

let pass = 0, fail = 0;
function check(name, cond, extra = "") {
  if (cond) { pass += 1; console.log(`✅ ${name}${extra ? " — " + extra : ""}`); }
  else { fail += 1; console.log(`❌ ${name}${extra ? " — " + extra : ""}`); }
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await startRegressionBattle(page);

  // ---------- A 萌虎慰劳：2 名角色各摸 2 ----------
  const A = await page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    const g = b.allies[0], o = b.allies[1];
    if (!g || !o) return { skip: "allies<2" };
    g.ref = "gerda"; o.hp = Math.max(o.hp, 1); g.hp = Math.max(g.hp, 1);
    [g, o].forEach(u => {
      u.pileStats = u.pileStats || {};
      u.pileStats.deck = [];
      for (let i = 0; i < 12; i++) u.pileStats.deck.push(
        window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
      u.hand = [];
    });
    b.animQueue = []; b.locked = false;
    b.gerdaComfort = { unitUid: g.uid };
    const deckBefore = g.pileStats.deck.length;
    window.GerdaSkills.resolveComfort(st, o.uid, { draw: window.BattleSystem.draw });
    const q = b.animQueue || [];
    return {
      deckBefore,
      groups: q.filter(e => e && e.type === "drawGroup").length,
      groupBatches: (q.find(e => e && e.type === "drawGroup")?.batches || []).length,
      batches: q.filter(e => e && e.type === "drawBatch").length,
      gHand: g.hand.length, oHand: o.hand.length,
    };
  })()`);
  if (A.skip) { check("A 构造：2 名友方", false, A.skip); }
  else {
    check("A0 前置：牌堆已构造", A.deckBefore >= 12, `deck=${A.deckBefore}`);
    check("A1 萌虎慰劳 合并为 1 条 drawGroup", A.groups === 1, `groups=${A.groups}`);
    check("A2 drawGroup 内 2 条子批次", A.groupBatches === 2, `batches=${A.groupBatches}`);
    check("A3 队列无残留 drawBatch", A.batches === 0, `drawBatch=${A.batches}`);
    check("A4 双方各摸到 2 张（合并未吞牌）",
      A.gHand === 2 && A.oHand === 2, `g=${A.gHand} o=${A.oHand}`);
  }

  // ---------- B 偶像之星：actor + nonoka 各摸 1 ----------
  const B = await page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    const a = b.allies[0], n = b.allies[1];
    if (!a || !n) return { skip: "allies<2" };
    a.ref = "hoshino_yi"; n.ref = "nonoka";
    a.hp = Math.max(a.hp, 1); n.hp = Math.max(n.hp, 1);
    // hasSkill 判定的是 skill.name，skills 是对象数组而非字符串数组。
    a.skills = [{ name: "偶像之星" }];
    [a, n].forEach(u => {
      u.pileStats = u.pileStats || {};
      u.pileStats.deck = [];
      for (let i = 0; i < 8; i++) u.pileStats.deck.push(
        window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
      u.hand = [];
    });
    a.hoshinoLastColor = "red"; a.hoshinoLastSuit = "♥";
    a.hoshinoSuitSet = [];
    b.animQueue = []; b.locked = false;
    window.HoshinoYiSkills.afterCardPlayed(
      st, a, b.enemies[0], { suit: "♠", type: "slash" },
      { draw: window.BattleSystem.draw, damage: () => ({ hpLoss: 0 }) });
    const q = b.animQueue || [];
    return {
      groups: q.filter(e => e && e.type === "drawGroup").length,
      groupBatches: (q.find(e => e && e.type === "drawGroup")?.batches || []).length,
      batches: q.filter(e => e && e.type === "drawBatch").length,
      aHand: a.hand.length, nHand: n.hand.length,
    };
  })()`);
  if (B.skip) { check("B 构造：2 名友方", false, B.skip); }
  else {
    check("B1 偶像之星 合并为 1 条 drawGroup", B.groups === 1, `groups=${B.groups}`);
    check("B2 drawGroup 内 2 条子批次", B.groupBatches === 2, `batches=${B.groupBatches}`);
    check("B3 队列无残留 drawBatch", B.batches === 0, `drawBatch=${B.batches}`);
    check("B4 双方各摸到 1 张（合并未吞牌）",
      B.aHand === 1 && B.nHand === 1, `a=${B.aHand} n=${B.nHand}`);
  }

  // ---------- C 读书的智慧：多名温蒂各摸 1 ----------
  const C = await page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    const w1 = b.allies[0], w2 = b.allies[1];
    if (!w1 || !w2) return { skip: "allies<2" };
    w1.ref = "wendy"; w2.ref = "wendy";
    w1.hp = Math.max(w1.hp, 1); w2.hp = Math.max(w2.hp, 1);
    [w1, w2].forEach(u => {
      u.pileStats = u.pileStats || {};
      u.pileStats.deck = [];
      for (let i = 0; i < 8; i++) u.pileStats.deck.push(
        window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
      u.hand = [];
    });
    b.animQueue = []; b.locked = false;
    window.WendySkills.afterCardPlayed(st, b.allies[0],
      { type: "tactic", name: "战术牌" },
      { draw: window.BattleSystem.draw });
    const q = b.animQueue || [];
    return {
      groups: q.filter(e => e && e.type === "drawGroup").length,
      groupBatches: (q.find(e => e && e.type === "drawGroup")?.batches || []).length,
      batches: q.filter(e => e && e.type === "drawBatch").length,
      w1Hand: w1.hand.length, w2Hand: w2.hand.length,
    };
  })()`);
  if (C.skip) { check("C 构造：2 名友方", false, C.skip); }
  else {
    check("C1 读书的智慧 合并为 1 条 drawGroup", C.groups === 1, `groups=${C.groups}`);
    check("C2 drawGroup 内 2 条子批次", C.groupBatches === 2, `batches=${C.groupBatches}`);
    check("C3 队列无残留 drawBatch", C.batches === 0, `drawBatch=${C.batches}`);
    check("C4 两名温蒂各摸到 1 张",
      C.w1Hand === 1 && C.w2Hand === 1, `w1=${C.w1Hand} w2=${C.w2Hand}`);
  }

  // ---------- D 模仿（nonoka_loki）：每个模仿者触发一次摸牌 ----------
  const D = await page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    const a = b.allies[0];
    const owners = [b.allies[1], b.allies[2] || b.enemies[0]].filter(Boolean);
    if (!a || owners.length < 2) return { skip: "owners<2" };
    a.hp = Math.max(a.hp, 1);
    owners.forEach(u => { u.hp = Math.max(u.hp, 1); });
    [a].concat(owners).forEach(u => {
      u.pileStats = u.pileStats || {};
      u.pileStats.deck = [];
      for (let i = 0; i < 8; i++) u.pileStats.deck.push(
        window.CardUtils.fromEntity("杀（普攻）", { virtual: false }));
      u.hand = [];
    });
    // 两名模仿者都模仿 a 的行动 → triggerMimic 循环 2 次，各推一条 drawBatch
    b.mimicLinks = owners.map(o => ({ targetUid: a.uid, ownerUid: o.uid }));
    b.animQueue = []; b.locked = false;
    window.NonokaLokiSkills.afterCardPlayed(st, a, b.enemies[0],
      { suit: "♠", type: "slash" }, { draw: window.BattleSystem.draw });
    const q = b.animQueue || [];
    return {
      groups: q.filter(e => e && e.type === "drawGroup").length,
      groupBatches: (q.find(e => e && e.type === "drawGroup")?.batches || []).length,
      batches: q.filter(e => e && e.type === "drawBatch").length,
      totalCards: q.filter(e => e && (e.type === "drawGroup" || e.type === "drawBatch"))
        .reduce((n, e) => n + (e.type === "drawGroup"
          ? (e.batches || []).reduce((m, x) => m + ((x.cards || []).length), 0)
          : (e.cards || []).length), 0),
      allyCount: b.allies.length,
    };
  })()`);
  if (D.skip) { check("D 构造：2 名模仿者", false, D.skip); }
  else {
    // 两名模仿者可能摸给同一名角色（leastAlly 取手牌最少者），此时
    // mergeDrawBatch 会把它们并成 1 条；摸给不同角色则应收进 drawGroup。
    // 两种都满足"不再串行播放 N 段"，故判据是"独立飞行段 <= 1 或 groups==1"。
    const segs = D.groups === 1 ? 1 : D.batches;
    check("D1 模仿 未产生 N 段串行飞牌", segs <= 1,
      `groups=${D.groups} groupBatches=${D.groupBatches} drawBatch=${D.batches}`);
    check("D2 合并成组时为 1 条 drawGroup（含 2 条子批次）",
      D.groups !== 1 || D.groupBatches === 2,
      `groups=${D.groups} batches=${D.groupBatches}`);
    check("D3 摸牌总数 == 模仿者数（合并未吞牌）", D.totalCards === 2,
      `cards=${D.totalCards}`);
  }

  // ---------- E 梦想真理：敌方全体各弃 1 ----------
  const E = await page.evaluate(`(async () => {
    const st = window.state, b = st.battle;
    const a = b.allies[0];
    if (!a || !b.enemies || b.enemies.length < 2) return { skip: "enemies<2" };
    a.ref = "hoshino_yi"; a.hp = Math.max(a.hp, 1);
    a.hoshinoMissionResult = "failure";
    a.hoshinoSuitSet = ["♠", "♥", "♣"];
    b.enemies.forEach(e => {
      e.hp = Math.max(e.hp, 1);
      e.hand = [window.CardUtils.fromEntity("杀（普攻）", { virtual: false })];
      e.pileStats = e.pileStats || {};
      e.pileStats.discard = [];
    });
    const enemyCount = b.enemies.length;
    b.animQueue = []; b.locked = false;
    window.HoshinoYiSkills.afterCardPlayed(
      st, a, b.enemies[0], { suit: "♦", type: "slash" },
      { draw: window.BattleSystem.draw, damage: () => ({ hpLoss: 0 }) });
    const q = b.animQueue || [];
    const discards = b.enemies.reduce((n, e) =>
      n + ((e.pileStats?.discard || []).length), 0);
    return {
      enemyCount,
      groups: q.filter(e => e && e.type === "discardGroup").length,
      groupBatches: (q.find(e => e && e.type === "discardGroup")?.batches || []).length,
      batches: q.filter(e => e && e.type === "discardBatch").length,
      discards,
    };
  })()`);
  if (E.skip) { check("E 构造：2 名敌人", false, E.skip); }
  else {
    check("E0 前置：敌方均有手牌", E.enemyCount >= 2, `enemies=${E.enemyCount}`);
    check("E1 梦想真理 合并为 1 条 discardGroup", E.groups === 1, `groups=${E.groups}`);
    check("E2 discardGroup 内 >=2 条子批次", E.groupBatches >= 2, `batches=${E.groupBatches}`);
    check("E3 队列无残留 discardBatch", E.batches === 0, `discardBatch=${E.batches}`);
    check("E4 牌确实进弃牌堆（合并未吞牌）",
      E.discards >= 2, `discard=${E.discards}`);
  }

  check("无页面错误", errors.length === 0, errors.slice(0, 2).join(" | "));
  console.log(`\n通过 ${pass} / 失败 ${fail}`);
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error("FATAL", e); process.exit(1); });
