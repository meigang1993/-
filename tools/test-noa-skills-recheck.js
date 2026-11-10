// 诺亚【魅力改造】×【改造副作用】复查严格检查（模块级，直调真实挂点）
//   H 补牌夹状态牌：补齐判定必须按 countedHand，不能按 hand.length 增量
//   I 溢出但一张都弃不了：不得写「一次性弃置 。」空战报
//   J 摸牌信号（耗尽 / 封魔 / 转交）在补齐循环里仍生效
//   L beginPlayPhase 同回合重复调用幂等（不重复咬杀）
//   M 既有边界复核：负攻击夹 0、眩晕不狂暴、虚拟牌缺失不跳过、免杀意离区
// 支持 NOA_RECHECK=H,I,J,L,M 分批；REVERT=counted|empty 源码级反向验证。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SRC = f => path.join(__dirname, "..", "src", "original", f);
const read = f => fs.readFileSync(SRC(f), "utf8");
const SEGS = (process.env.NOA_RECHECK || "H,I,J,L,M").split(",").filter(Boolean);
const MODE = process.env.REVERT || "";
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);
const has = s => SEGS.includes(s);

let pass = 0, total = 0, failed = [];
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  else failed.push(name);
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

const logs = [], drawn = [], discarded = [], lines = [], damageCalls = [];
const card = (name, extra = {}) => ({ name, type: "slash", suit: "♠", power: 0, scale: "attack", ...extra });
const mk = (uid, gender, side, extra = {}) => ({
  uid, ref: uid, name: uid, gender, side, hp: 130, maxHp: 130, hand: [],
  stats: { attack: 6, magic: 4, speed: 8, handLimit: 4 }, skills: [], ...extra,
});
const noa = () => mk("noa", "female", "ally", { skills: [{ name: "魅力改造" }, { name: "改造副作用" }] });
const battle = (o = {}) => ({ turn: 1, phase: 4, allies: [], enemies: [], activeUid: "noa", locked: false, ...o });
const counted = u => (u?.hand || []).filter(c => ctx.GuestCharacterSkills.countsForLimit(u, c)).length;

ctx.BattleStatusCards = { isStatus: c => !!c?.status };
ctx.GuestCharacterSkills = { countsForLimit: (u, c) => !ctx.BattleStatusCards.isStatus(c) };
ctx.UnderwaterTrainSkills = { canDiscard: (u, c) => !ctx.BattleStatusCards.isStatus(c) };
ctx.CardUtils = {
  isKillCard: c => c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || ""),
  fromEntity: (n, extra = {}) => card(n, { virtual: true, ...extra }),
};
ctx.BattleLog = { add: (s, t) => logs.push(String(t)) };
ctx.BattleLines = { skill: (s, u, k) => lines.push({ uid: u?.uid, key: k }) };
ctx.BattleCards = {
  put: (b, u, c, pile) => discarded.push({ uid: u.uid, name: c.name, pile }),
  putMany: (b, u, cs, pile) => cs.forEach(c => discarded.push({ uid: u.uid, name: c.name, pile })),
};
ctx.CatherineSkills = { syncMagic: () => {} };
ctx.WendyCadicisSkills = { afterDiscard: (s, u, cs) => {} };
ctx.GameRandom = { sample: l => l[0] };
ctx.GameData = { characters: [{ id: "noa", stats: { handLimit: 4 } }] };
ctx.BattleSystem = { draw: (u, n) => { for (let i = 0; i < n; i++) u.hand.push(card("摸" + i)); return []; }, useVirtualKill: () => {} };
ctx.BattleDrawFeedback = {
  signal: (result, unit, requested, gained) => {
    const raw = Array.isArray(result) ? result.drawSignal : result?.drawSignal;
    const drawnN = raw ? Number(raw.drawn) || 0 : Math.max(0, Number(gained) || 0);
    return {
      signaled: !!raw, requested, drawn: drawnN, gained: Math.max(0, Number(gained) || 0),
      exhausted: raw ? !!raw.exhausted : drawnN === 0,
      locked: raw ? !!raw.locked : !!unit?.drawLockedThisTurn,
      redirected: raw ? Number(raw.redirected) || 0 : 0,
    };
  },
  shortage: sig => sig?.locked ? "因封魔无法摸牌" : sig?.exhausted ? "牌堆已无可摸的牌" : "本次摸牌未到手",
  action: () => "摸牌",
};

const patch = (src, from, to, tag) => {
  const next = src.replace(from, to);
  if (next === src) throw new Error(`REVERT=${tag} 未命中锚点`);
  return next;
};
let charmSrc = read("noa-charm-skills.js");
if (MODE === "counted") {
  charmSrc = patch(charmSrc,
    "while (countedHand(owner) < limit && rounds < maxRounds)",
    "while (gained < diff && rounds < maxRounds)", "counted-while");
  charmSrc = patch(charmSrc,
    "if (countedHand(owner) >= limit) break;",
    "if (gained >= diff) break;", "counted-break");
}
if (MODE === "empty") {
  charmSrc = patch(charmSrc,
    "    if (!extra.length) return 0;\n", "", "empty");
}
vm.runInContext(charmSrc, ctx, { filename: "noa-charm-skills.js" });
vm.runInContext(read("noa-side-effect-skills.js"), ctx, { filename: "noa-side-effect-skills.js" });

// ---------------- H 补牌夹状态牌 ----------------
if (has("H")) {
  const n = noa(); n.hand = [card("杀1")];
  const b = battle({ allies: [n], enemies: [mk("e0", "male", "enemy")], activeUid: "noa" });
  const state = { battle: b, log: [] }; ctx.state = state;
  logs.length = 0;
  let calls = 0;
  const mixedDraw = (u, k) => {
    calls++;
    const got = [];
    for (let i = 0; i < k; i++) {
      // 只有第一轮夹一张不计入上限的状态牌，之后全普通牌
      const c = calls === 1 && i === 0
        ? card("眩晕", { status: true, type: "obstacle" })
        : card(`摸${calls}-${i}`);
      u.hand.push(c); got.push(c);
    }
    got.drawSignal = { requested: k, drawn: k, exhausted: false, locked: false, redirected: 0 };
    drawn.push({ calls, k });
    return got;
  };
  const ret = ctx.NoaCharmSkills.balanceHand(state, n, mixedDraw);
  const finalCounted = counted(n);
  const last = logs[logs.length - 1] || "";
  console.log("H 观测:", JSON.stringify({ finalCounted, handTotal: n.hand.length, calls, ret, logs }));
  T("H1 计入上限的手牌真的补齐到 4", finalCounted === 4, { finalCounted });
  T("H2 第一轮夹状态牌后没有提前收工（draw 调用 ≥2）", calls >= 2, { calls });
  T("H3 战报写「至手牌上限4」且不写「仍差」", last.includes("至手牌上限4") && !last.includes("仍差"), { last });
  T("H4 状态牌没有从手牌里被误删", n.hand.some(c => c.status), { hand: n.hand.map(c => c.name) });
}

// ---------------- I 溢出但一张都弃不了 ----------------
if (has("I")) {
  const n = noa(); n.hand = [card("a"), card("b"), card("c"), card("d"), card("e")];
  const b = battle({ allies: [n], enemies: [mk("e0", "male", "enemy")], activeUid: "noa" });
  const state = { battle: b, log: [] }; ctx.state = state;
  logs.length = 0; discarded.length = 0;
  const saved = ctx.UnderwaterTrainSkills.canDiscard;
  ctx.UnderwaterTrainSkills.canDiscard = () => false;   // 全部不可弃
  const r1 = ctx.NoaCharmSkills.balanceHand(state, n, ctx.BattleSystem.draw);
  const r2 = ctx.NoaCharmSkills.balanceHand(state, n, ctx.BattleSystem.draw);
  ctx.UnderwaterTrainSkills.canDiscard = saved;
  const emptyLogs = logs.filter(l => /一次性弃置\s*。/.test(l));
  console.log("I 观测:", JSON.stringify({ r1, r2, logs }));
  T("I1 不写「一次性弃置 。」空战报", emptyLogs.length === 0, { emptyLogs });
  T("I2 两次重判都不产生弃牌", discarded.length === 0 && r1 === 0 && r2 === 0, { r1, r2, discarded: discarded.length });
  T("I3 不挂起玩家弃牌选择", !b.noaCharmDiscard, { charm: b.noaCharmDiscard || null });
}

// ---------------- J 摸牌信号仍生效 ----------------
if (has("J")) {
  const mkSig = (raw, nPush) => {
    const n = noa(); n.hand = [card("杀1")];
    const b = battle({ allies: [n], enemies: [mk("e0", "male", "enemy")], activeUid: "noa" });
    const state = { battle: b, log: [] }; ctx.state = state;
    logs.length = 0;
    let calls = 0;
    const d = (u, k) => {
      calls++;
      const got = [];
      for (let i = 0; i < nPush; i++) { const c = card(`摸${calls}-${i}`); u.hand.push(c); got.push(c); }
      got.drawSignal = raw;
      return got;
    };
    ctx.NoaCharmSkills.balanceHand(state, n, d);
    return { counted: counted(n), calls, logs };
  };
  const j1 = mkSig({ requested: 3, drawn: 0, exhausted: true, locked: false, redirected: 0 }, 0);
  T("J1 牌堆耗尽只摸一轮即停", j1.calls === 1, j1);
  T("J2 耗尽如实写「牌堆已无可摸的牌」", j1.logs.some(l => l.includes("牌堆已无可摸的牌")), j1.logs);
  const j2 = mkSig({ requested: 3, drawn: 0, exhausted: false, locked: true, redirected: 0 }, 0);
  T("J3 封魔只摸一轮即停", j2.calls === 1, j2);
  T("J4 封魔如实写「因封魔无法摸牌」", j2.logs.some(l => l.includes("因封魔无法摸牌")), j2.logs);
  const j3 = mkSig({ requested: 3, drawn: 3, exhausted: false, locked: false, redirected: 3 }, 0);
  T("J5 全被转交只摸一轮即停", j3.calls === 1, j3);
  const j4 = mkSig({ requested: 1, drawn: 1, exhausted: false, locked: false, redirected: 0 }, 1);
  T("J6 每轮只到手 1 张时一直补到齐", j4.counted === 4 && j4.calls === 3, j4);
}

// ---------------- L 同回合幂等 ----------------
if (has("L")) {
  const n = noa(); const e0 = mk("e0", "male", "enemy");
  const b = battle({ allies: [n], enemies: [e0], activeUid: "noa" });
  const state = { battle: b, log: [] }; ctx.state = state;
  logs.length = 0;
  const r1 = ctx.NoaSideEffectSkills.beginPlayPhase(state, n);
  const r2 = ctx.NoaSideEffectSkills.beginPlayPhase(state, n);
  const frenzyLogs = logs.filter(l => l.includes("咬杀"));
  T("L1 两次调用都返回 true", r1 === true && r2 === true, { r1, r2 });
  T("L2 只发动一次狂暴咬杀", frenzyLogs.length === 1, { frenzyLogs });
  T("L3 跳过原因保持「改造副作用」", n.skipPlayReason === "改造副作用" && n.skipPlayPhase === true, { reason: n.skipPlayReason });
  // 眩晕优先：不狂暴、不覆盖原因
  const n2 = noa(); n2.skipPlayPhase = true; n2.skipPlayReason = "眩晕";
  const b2 = battle({ allies: [n2], enemies: [mk("e0", "male", "enemy")], activeUid: "noa" });
  const s2 = { battle: b2, log: [] }; ctx.state = s2;
  logs.length = 0;
  const r3 = ctx.NoaSideEffectSkills.beginPlayPhase(s2, n2);
  T("L4 眩晕回合不发动狂暴", r3 === false && !logs.some(l => l.includes("咬杀")), { r3, logs });
  T("L5 眩晕原因不被覆盖", n2.skipPlayReason === "眩晕", { reason: n2.skipPlayReason });
}

// ---------------- M 既有边界复核 ----------------
if (has("M")) {
  // 负攻击夹 0（既有 E4 契约：仍走 damage，但不得为负）
  const n = noa(); n.stats.attack = 0; n.tempAttack = -20;
  const m = mk("m0", "male", "ally", { hp: 50 });
  const b = battle({ allies: [n, m], enemies: [] });
  const state = { battle: b, log: [] }; ctx.state = state;
  damageCalls.length = 0;
  ctx.NoaSideEffectSkills.endTurn(state, n, { damage: (...a) => damageCalls.push(a) });
  T("M1 负攻击力夹到 0（不为负、不回血）", damageCalls[0]?.[2] === 0, { amount: damageCalls[0]?.[2] });
  // 虚拟牌造不出来：不跳过出牌阶段
  const n2 = noa(); const b2 = battle({ allies: [n2], enemies: [mk("e0", "male", "enemy")] });
  const s2 = { battle: b2, log: [] }; ctx.state = s2;
  const saved = ctx.CardUtils.fromEntity;
  ctx.CardUtils.fromEntity = () => null;
  const r = ctx.NoaSideEffectSkills.beginPlayPhase(s2, n2);
  ctx.CardUtils.fromEntity = saved;
  T("M2 虚拟牌缺失不跳过出牌阶段", r === false && !n2.skipPlayPhase, { r, skip: n2.skipPlayPhase });
  // 免杀意是即时判定，不往牌上写标记
  const n3 = noa(); const b3 = battle({ allies: [n3], enemies: [] });
  ctx.state = { battle: b3, log: [] };
  const k = card("杀");
  const free = ctx.NoaCharmSkills.noIntentCost(n3, k);
  T("M3 免杀意生效", free === true, { free });
  T("M4 免杀意不往牌上写标记", JSON.stringify(k) === JSON.stringify(card("杀")), { k });
  // 非出牌阶段不生效
  const b4 = battle({ allies: [n3], enemies: [], phase: 3 });
  ctx.state = { battle: b4, log: [] };
  T("M5 非出牌阶段不免杀意", ctx.NoaCharmSkills.noIntentCost(n3, card("杀")) === false);
  // 目标池排除自己
  const n5 = noa(); const b5 = battle({ allies: [n5], enemies: [] });
  const s5 = { battle: b5, log: [] }; ctx.state = s5;
  logs.length = 0;
  const r5 = ctx.NoaSideEffectSkills.beginPlayPhase(s5, n5);
  T("M6 目标池为空时不跳过出牌阶段", r5 === false && !n5.skipPlayPhase, { r5 });
}

console.log(`RESULT ${pass}/${total}` + (failed.length ? ` FAILED=${failed.join("|")}` : ""));
process.exit(failed.length ? 1 : 0);
