// 【淫气改造】「出牌阶段开始时手牌小于上限是否摸齐」严格检查（Node 直调真实挂点）
//   与既有测试不同：这里不直接调 balanceHand，而是驱动 enterPlayPhase /
//   BattleTurnInput.advanceToInput（真实「出牌阶段开始」入口），再观察手牌。
//   A 主路径（battle-turn-input.js 注入 draw）
//   B 动态上限（存活男性 +1）
//   C 四条旁路（manual-continuation / share-flow / prepare-prompts ×2）
//   D 边界：恰好等于上限 / _pendingDraw / skipPlayPhase / 非出牌阶段 /
//     牌堆空（不再谎报、确认耗尽即停）/ 摸牌被转交（不再谎报、确认即停）
//   E 静态：5 条进入出牌阶段路径统一、无第二阶段开始挂点
//   F 反向：REVERT=hook 撤掉 enterPlayPhase 内的平衡调用 → A 段必须变红
//   G 按实际摸到数记录 + 按 draw 信号判定耗尽：部分摸到(2+1)补齐 /
//     只摸到2张如实写2张 / 无信号旧 draw 两轮0张如实收尾 /
//     真实信号牌堆空·封魔·转交各一轮即停 / 真实信号三轮补齐（不固定2轮）
//   H 静态与反向：真实 draw 挂 drawSignal、战报模块暴露 signal/shortage；
//     REVERT=signal 撤掉信号读取 → 退化成无信号重试
// 支持 NOA_START=A,B,... 分批；REVERT=hook|count|recheck|signal 做源码级反向验证。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SRC = f => path.join(__dirname, "..", "src", "original", f);
const read = f => fs.readFileSync(SRC(f), "utf8");
const SEGS = (process.env.NOA_START || "A,B,C,D,E,F,G,H").split(",").filter(Boolean);
const MODE = process.env.REVERT || "";          // hook | count | recheck | signal
const REVERT = MODE === "hook";                 // 供 A~F 沿用既有反向口径
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);

let pass = 0, total = 0;
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

const logs = [], records = [], draws = [];
const NOA_SKILLS = [{ name: "淫气改造" }, { name: "改造副作用" }];
const mk = (uid, gender, side, extra = {}) => ({
  uid, ref: uid, name: uid, gender, side, hp: 130, maxHp: 130, hand: [],
  stats: { attack: 6, magic: 4, speed: 8, handLimit: 4 },
  skills: [], ...extra,
});
const card = (name, extra = {}) => ({ name, type: "slash", suit: "♠", power: 0, scale: "attack", ...extra });

ctx.CardUtils = {
  isKillCard: c => c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || ""),
};
ctx.BattleLog = { add: (s, t) => logs.push(String(t)) };
ctx.BattleLines = { skill: () => {} };
ctx.BattleCards = {
  put: () => {}, putMany: () => {}, queueResponse: () => {},
  visibleHandCount: u => u?.hand?.length || 0,
};
ctx.GameRandom = { sample: list => list[0], id: () => "id" };
ctx.GameData = { characters: [{ id: "noa", stats: { handLimit: 4 } }] };
const systemDraw = (u, n) => {
  draws.push({ via: "BattleSystem", uid: u?.uid, n });
  for (let i = 0; i < n; i++) u.hand.push(card("实摸" + i));
};
ctx.BattleSystem = { draw: systemDraw, useVirtualKill: () => {} };
ctx.SakuraRisaSkills = { playPhaseStart: () => {} };
ctx.RuinsEnemySkills = { landmineRps: { playPhaseStart: () => {} } };
ctx.AppRuntimeErrors = undefined;

// 加载技能模块（REVERT 源码级反向：hook 撤挂点 / count 谎报差额 / recheck 撤重判）
let charmSrc = read("noa-charm-skills.js");
const noaDiscardSrc = read("noa-charm-discard.js");
const HOOK = "balanceHand(state, unit, draw || window.BattleSystem?.draw, { onlySelf: true });";
const ANCHOR_COUNT = "实际摸到${gained}张牌";
const ANCHOR_RECHECK = "const maxRounds = Math.max(2, Math.min(8, diff + 2));";
const ANCHOR_SIGNAL = "window.BattleDrawFeedback?.signal?.(result, owner, remaining, toHand)";
const applyRevert = (src, from, to, tag) => {
  const next = src.replace(from, to);
  if (next === src) throw new Error(`REVERT=${tag} 未命中锚点`);
  return next;
};
if (REVERT) charmSrc = applyRevert(charmSrc, HOOK, "/* NOA_START_REVERT */", "hook");
if (MODE === "count") charmSrc = applyRevert(charmSrc, ANCHOR_COUNT,
  "实际摸到${diff}张牌", "count");
if (MODE === "recheck") charmSrc = applyRevert(charmSrc, ANCHOR_RECHECK,
  "const maxRounds = 1;", "recheck");
if (MODE === "signal") charmSrc = applyRevert(charmSrc, ANCHOR_SIGNAL, "undefined", "signal");
const reverted = charmSrc;
vm.runInContext(read("battle-draw-feedback.js"), ctx, { filename: "battle-draw-feedback.js" });
vm.runInContext(read("noa-side-effect-skills.js"), ctx, { filename: "noa-side-effect-skills.js" });
vm.runInContext(noaDiscardSrc, ctx, { filename: "noa-charm-discard.js" });
vm.runInContext(charmSrc, ctx, { filename: "noa-charm-skills.js" });
vm.runInContext(read("battle-turn-input.js"), ctx, { filename: "battle-turn-input.js" });
const Charm = ctx.NoaCharmSkills;

function fresh(handCount, maleCount = 0, opts = {}) {
  const noa = mk("noa", "female", "ally", { skills: NOA_SKILLS.slice() });
  for (let i = 0; i < handCount; i++) noa.hand.push(card("原手牌" + i, opts.pending ? { _pendingDraw: true } : {}));
  const allies = [noa];
  for (let i = 0; i < maleCount; i++) allies.push(mk("m" + i, "male", "ally"));
  const battle = {
    phase: opts.phase ?? 3, activeUid: "noa", allies, enemies: [mk("e0", "male", "enemy")],
    locked: false, animQueue: [],
  };
  if (opts.skip) { noa.skipPlayPhase = true; noa.skipPlayReason = "狂暴"; }
  const state = { battle };
  ctx.state = state;
  logs.length = 0; records.length = 0; draws.length = 0;
  return { state, battle, noa };
}
const limitOf = noa => ctx.NoaSideEffectSkills.handLimit(noa);

// 主路径：真实 BattleTurnInput.advanceToInput
async function mainPath(f, injected) {
  const localDraws = [];
  const draw = injected || ((u, n, b) => {
    localDraws.push({ via: "injected", uid: u?.uid, n, battle: !!b });
    for (let i = 0; i < n; i++) u.hand.push(card("注入摸" + i));
  });
  const api = {
    combat: { checkEnd: () => {} },
    draw,
    record: (s, t) => records.push(String(t)),
    waitEffects: async () => {},
    isCurrentState: () => true,
    runEnemyPlayPhase: async () => true,
    getFinishTurn: () => () => true,
    beginTurn: () => f.noa,
  };
  const flow = ctx.BattleTurnInput(api);
  await flow.advanceToInput(f.state, () => {});
  return localDraws;
}

(async () => {
  if (SEGS.includes("A")) {
    const f = fresh(1);
    const localDraws = await mainPath(f);
    const limit = limitOf(f.noa);
    T("A1 主路径：出牌阶段开始手牌 1<上限4 → 摸齐到 4",
      REVERT ? (f.noa.hand.length === 1) : (f.noa.hand.length === limit),
      { hand: f.noa.hand.length, limit, phase: f.battle.phase });
    T("A2 主路径：phase 被设为 4", f.battle.phase === 4, { phase: f.battle.phase });
    T("A3 主路径：注入 draw 被调用且 n=差额",
      REVERT ? (localDraws.length === 0) : (localDraws.length === 1 && localDraws[0].n === 3 && localDraws[0].uid === "noa"),
      localDraws);
    T("A4 主路径：战报记录「摸3张牌至手牌上限4」",
      REVERT ? !logs.some(l => l.includes("摸3张牌")) : logs.some(l => l.includes("摸3张牌至手牌上限4")),
      logs.slice(-3));
    T("A5 主路径：记录「可以出牌」", records.some(l => l.includes("可以出牌")), records);
  }

  if (SEGS.includes("B")) {
    const f = fresh(0, 1);
    const localDraws = await mainPath(f);
    const limit = limitOf(f.noa);
    T("B1 动态上限：1 名存活男性 → 上限 5", limit === 5, { limit });
    T("B2 动态上限：手牌 0 → 摸 5 张补齐",
      REVERT ? (f.noa.hand.length === 0) : (f.noa.hand.length === 5 && localDraws[0]?.n === 5),
      { hand: f.noa.hand.length, draws: localDraws });
  }

  if (SEGS.includes("C")) {
    // 旁路 1/2：manual-continuation / prepare-prompts 传 undefined → 靠 BattleSystem 兜底
    const f1 = fresh(2);
    const r1 = Charm.enterPlayPhase(f1.state, f1.noa, undefined);
    T("C1 旁路（draw=undefined）：BattleSystem.draw 兜底摸齐到 4",
      REVERT ? (f1.noa.hand.length === 2) : (r1 === true && f1.noa.hand.length === 4 && draws[0]?.n === 2),
      { r1, hand: f1.noa.hand.length, draws });
    // 旁路 3：share-flow / turn-input 传显式 draw
    const f2 = fresh(1);
    let injected = 0;
    const r2 = Charm.enterPlayPhase(f2.state, f2.noa, (u, n) => { injected += n; for (let i = 0; i < n; i++) u.hand.push(card("旁" + i)); });
    T("C2 旁路（显式 draw）：摸齐到 4",
      REVERT ? (f2.noa.hand.length === 1) : (r2 === true && f2.noa.hand.length === 4 && injected === 3),
      { r2, hand: f2.noa.hand.length, injected });
    // 旁路 4：兜底也缺失时不崩、不补（降级行为，如实观测）
    const f3 = fresh(1);
    const saved = ctx.BattleSystem.draw;
    ctx.BattleSystem.draw = undefined;
    let threw = null;
    try { Charm.enterPlayPhase(f3.state, f3.noa, undefined); } catch (e) { threw = String(e.message); }
    ctx.BattleSystem.draw = saved;
    T("C3 draw 完全缺失：不抛错、不补牌（降级而非崩溃）", threw === null && f3.noa.hand.length === 1,
      { threw, hand: f3.noa.hand.length });
  }

  if (SEGS.includes("D")) {
    const d1 = fresh(4);
    await mainPath(d1);
    T("D1 恰好等于上限：不摸牌", d1.noa.hand.length === 4 && draws.length === 0, { hand: d1.noa.hand.length });
    const d2 = fresh(3, 0, { pending: true });
    await mainPath(d2);
    T("D2 手牌含 _pendingDraw：按 hand 总数计，只补 1 张不重复摸",
      d2.noa.hand.length === (REVERT ? 3 : 4), { hand: d2.noa.hand.length });
    const d3 = fresh(1, 0, { skip: true });
    const r3 = Charm.enterPlayPhase(d3.state, d3.noa, undefined);
    T("D3 狂暴 skipPlayPhase：不进出牌阶段、不摸牌",
      r3 === false && d3.battle.phase === 3 && d3.noa.hand.length === 1,
      { r3, phase: d3.battle.phase, hand: d3.noa.hand.length });
    const d4 = fresh(1, 0, { phase: 3 });
    const r4 = Charm.balanceHand(d4.state, d4.noa, systemDraw, { onlySelf: true });
    T("D4 非出牌阶段：balanceHand 直接 return，不摸牌", r4 === 0 && d4.noa.hand.length === 1,
      { r4, hand: d4.noa.hand.length });
    // 牌堆耗尽：两轮 draw 都产不出牌 → 不再谎报「摸3张」，且确认耗尽即停
    const d5 = fresh(1);
    let d5Calls = 0;
    const emptyDeckDraw = (u, n) => { d5Calls++; draws.push({ via: "emptyDeck", n }); /* 不 push 任何牌 */ };
    const r5 = Charm.enterPlayPhase(d5.state, d5.noa, emptyDeckDraw);
    T("D5 牌堆空：按实摸数记录（不再谎报摸3张）且确认耗尽即停",
      REVERT
        ? (d5.noa.hand.length === 1 && d5Calls === 0 && logs.length === 0)
        : (r5 === true && d5.noa.hand.length === 1 && d5Calls === 2
           && !logs.some(l => l.includes("摸3张"))
           && logs.some(l => l.includes("未能补齐"))),
      { hand: d5.noa.hand.length, d5Calls, logs: logs.slice(-3) });
    // 吸魔邪眼把摸到的牌转交给别人：诺亚一张拿不到，同样按实摸数收尾
    const d6 = fresh(1);
    let d6Calls = 0;
    const redirected = (u, n) => {
      d6Calls++;
      const foe = d6.state.battle.enemies[0];
      for (let i = 0; i < n; i++) foe.hand.push(card("被转交"));
    };
    const r6 = Charm.enterPlayPhase(d6.state, d6.noa, redirected);
    T("D6 摸牌被转交：不再谎报、重判一次后如实收尾",
      REVERT
        ? (d6.noa.hand.length === 1 && d6Calls === 0)
        : (r6 === true && d6.noa.hand.length === 1 && d6Calls === 2
           && !logs.some(l => l.includes("摸3张"))
           && logs.some(l => l.includes("未能补齐"))),
      { hand: d6.noa.hand.length, d6Calls, logs: logs.slice(-3) });
  }

  if (SEGS.includes("E")) {
    const files = ["battle-turn-input.js", "battle-manual-continuation.js",
      "battle-share-flow.js", "battle-prepare-prompts.js"];
    const calls = files.reduce((n, f) => n + (read(f).match(/NoaCharmSkills\?\.enterPlayPhase/g) || []).length, 0);
    T("E1 4 个文件共 5 条进入出牌阶段路径全部走 enterPlayPhase", calls === 5, { calls });
    T("E2 摸牌阶段/结束阶段没有第二处 balanceHand 挂点",
      !read("battle-turn-start.js").includes("NoaCharmSkills?.balanceHand")
      && !read("battle-end-phase.js").includes("NoaCharmSkills?.balanceHand"));
    T("E3 enterPlayPhase 内部确实调用 balanceHand（REVERT 时相反）",
      REVERT ? !reverted.includes(HOOK) : charmSrc.includes(HOOK));
  }

  if (SEGS.includes("F")) {
    const f = fresh(1);
    const saved = Charm.enterPlayPhase;
    Charm.enterPlayPhase = (state, unit, draw, onStep) => { state.battle.phase = 4; return true; };
    await mainPath(f);
    Charm.enterPlayPhase = saved;
    T("F1 运行时反向：换成「只设 phase」的旧入口 → 不摸齐",
      f.noa.hand.length === 1 && f.battle.phase === 4, { hand: f.noa.hand.length });
  }

  // 带 drawSignal 的 draw：模拟真实 BattleSession.draw 的返回值（数组 + 信号）
  const mkSignaledDraw = perRound => {
    let round = 0;
    const calls = [];
    const fn = (u, n) => {
      const spec = perRound[round] || { give: 0, drawn: 0 };
      round += 1;
      calls.push({ round, n, ...spec });
      const give = Math.min(spec.give || 0, n);
      for (let i = 0; i < give; i += 1) u.hand.push(card("信" + round + "_" + i));
      const result = Array.from({ length: spec.drawn ?? give }, (_, i) => card("抽" + i));
      result.drawSignal = {
        drawn: result.length, exhausted: result.length === 0,
        locked: !!spec.locked, redirected: spec.redirected || 0,
      };
      return result;
    };
    return { fn, calls };
  };
  const runSignal = perRound => {
    const f = fresh(1);
    f.battle.phase = 4;
    f.battle.activeUid = "noa";
    logs.length = 0;
    const { fn, calls } = mkSignaledDraw(perRound);
    const r = Charm.balanceHand(f.state, f.noa, fn, { onlySelf: true });
    return { f, calls, r, logs: logs.slice() };
  };

  // G 按实际摸到数记录 + 不足时按信号判定是否继续（自定义 draw 按轮次给出「实际到手数」）
  if (SEGS.includes("G")) {
    const mkPartialDraw = perRound => {
      let round = 0;
      const calls = [];
      const fn = (u, n) => {
        const give = Math.min(perRound[round] ?? 0, n);
        calls.push({ round, n, give });
        for (let i = 0; i < give; i++) u.hand.push(card("补" + round + "_" + i));
        round++;
      };
      return { fn, calls };
    };
    const run = perRound => {
      const f = fresh(1);
      f.battle.phase = 4;
      f.battle.activeUid = "noa";
      logs.length = 0;
      const { fn, calls } = mkPartialDraw(perRound);
      const r = Charm.balanceHand(f.state, f.noa, fn, { onlySelf: true });
      return { f, calls, r, logs: logs.slice() };
    };

    const g1 = run([2, 1]);
    T("G1 部分摸到(2+1)：不足时再重判一次，补齐到上限 4",
      g1.f.noa.hand.length === 4 && g1.calls.length === 2
      && g1.calls[0].n === 3 && g1.calls[1].n === 1
      && g1.r === 3 && g1.logs.some(l => l.includes("摸3张牌至手牌上限4")),
      { hand: g1.f.noa.hand.length, calls: g1.calls, r: g1.r, logs: g1.logs });

    const g2 = run([2, 0]);
    T("G2 按实际摸到数记录：只摸到 2 张就写 2 张，不谎报「摸3张」",
      g2.f.noa.hand.length === 3 && g2.calls.length === 2
      && g2.r === 2 && g2.logs.some(l => l.includes("实际摸到2张牌"))
      && !g2.logs.some(l => l.includes("摸3张牌至手牌上限4")),
      { hand: g2.f.noa.hand.length, calls: g2.calls, r: g2.r, logs: g2.logs });

    const g3 = run([0, 0]);
    T("G3 两轮都摸不到：如实写「未能补齐」，不谎报差额",
      g3.f.noa.hand.length === 1 && g3.calls.length === 2
      && g3.r === 0 && g3.logs.some(l => l.includes("未能补齐"))
      && !g3.logs.some(l => l.includes("摸3张")),
      { hand: g3.f.noa.hand.length, calls: g3.calls, r: g3.r, logs: g3.logs });

    T("G4 重判有上限：牌堆空时 draw 恰好 2 次，不无限重试",
      g3.calls.length === 2 && g3.calls[0].n === 3 && g3.calls[1].n === 3,
      g3.calls);

    const g5 = runSignal([{ give: 0, drawn: 0 }]);
    T("G5 真实信号·牌堆耗尽：1 轮确认即停，不再空摸第二次",
      g5.calls.length === 1 && g5.f.noa.hand.length === 1 && g5.r === 0
      && g5.logs.some(l => l.includes("未能补齐"))
      && g5.logs.some(l => l.includes("牌堆已无可摸的牌")),
      { calls: g5.calls, logs: g5.logs });

    const g6 = runSignal([{ give: 0, drawn: 0, locked: true }]);
    T("G6 真实信号·封魔：1 轮确认即停，原因写「因封魔无法摸牌」",
      g6.calls.length === 1 && g6.f.noa.hand.length === 1
      && g6.logs.some(l => l.includes("未能补齐"))
      && g6.logs.some(l => l.includes("因封魔无法摸牌")),
      { calls: g6.calls, logs: g6.logs });

    const g7 = runSignal([{ give: 0, drawn: 3, redirected: 3 }]);
    T("G7 真实信号·吸魔邪眼转交：抽出3张但0张到手，1 轮即停且原因精确",
      g7.calls.length === 1 && g7.f.noa.hand.length === 1 && g7.r === 0
      && g7.logs.some(l => l.includes("未能补齐"))
      && g7.logs.some(l => l.includes("吸魔邪眼转交")),
      { calls: g7.calls, logs: g7.logs });

    const g8 = runSignal([
      { give: 1, drawn: 1 }, { give: 1, drawn: 1 }, { give: 1, drawn: 1 },
    ]);
    T("G8 真实信号·每轮只到手1张：一直补到齐（3 轮），不再固定 2 轮",
      g8.f.noa.hand.length === 4 && g8.calls.length === 3 && g8.r === 3
      && g8.logs.some(l => l.includes("摸3张牌至手牌上限4")),
      { hand: g8.f.noa.hand.length, calls: g8.calls, logs: g8.logs });
  }

  if (SEGS.includes("H")) {
    const h1 = runSignal([{ give: 0, drawn: 0 }]);
    T("H1 反向：撤掉 signal 读取后无法确认耗尽，退化为重试一次",
      MODE === "signal" ? h1.calls.length === 2 : h1.calls.length === 1,
      { calls: h1.calls });
    T("H2 静态：真实 draw 挂 drawSignal（封魔早返回也有信号）",
      read("battle-session.js").includes("withSignal([], {")
      && read("battle-session.js").includes("exhausted: cards.length === 0"));
    T("H3 静态：战报模块暴露 signal/shortage，补牌不再写重复的「未摸到牌」",
      read("battle-draw-feedback.js").includes("function signal(result")
      && read("battle-draw-feedback.js").includes("function shortage(sig)")
      && !read("noa-charm-skills.js").includes("未摸到牌（牌堆耗尽或摸牌被转交）"));
    T("H4 静态：补牌循环不再固定 2 轮",
      !read("noa-charm-skills.js").includes("round < 2")
      && read("noa-charm-skills.js").includes("maxRounds"));
  }

  console.log(`\nNOA_START ${pass}/${total}` + (MODE ? `  [REVERT=${MODE} 反向态]` : ""));
  if (pass !== total) process.exitCode = 1;
})().catch(e => { console.error("FATAL", e); process.exitCode = 2; });
