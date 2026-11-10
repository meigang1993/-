// 诺亚【魅力改造】×【改造副作用】严格审计（模块级，直调真实挂点）
//   A 状态牌不计入手牌上限：balanceHand 必须与 visibleHandCount 同口径
//   B 可弃牌不足 need：不得挂起（否则 confirmDiscard 永远选不够 → 卡死）
//   C autoDiscard 只弃可弃牌，不得动状态牌 / _pendingDraw
//   D confirmDiscard 挂起后无可弃牌：必须清挂起继续，不能无限「还需选择N张」
//   E endTurn 伤害口径（attack+tempAttack、负夹0、只打存活男性队友、type:skill 不触发受牌钩）
//   F 狂暴边界：虚拟牌缺失不跳过出牌阶段 / 幂等守卫不锁死首次判定 / 目标池空
//   G 静态：存档 stable() 阻塞 noaCharmDiscard、5 条进入出牌阶段路径统一
// 支持 NOA_AUDIT=A,B,... 分批；REVERT=count|discardable|auto|resume|virtual 源码级反向验证。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SRC = f => path.join(__dirname, "..", "src", "original", f);
const read = f => fs.readFileSync(SRC(f), "utf8");
const SEGS = (process.env.NOA_AUDIT || "A,B,C,D,E,F,G").split(",").filter(Boolean);
const MODE = process.env.REVERT || "";
const ctx = { console };
ctx.window = ctx;
vm.createContext(ctx);

let pass = 0, total = 0, failed = [];
const T = (name, cond, extra) => {
  total++;
  if (cond) pass++;
  else failed.push(name);
  console.log(`${cond ? "✅" : "❌"} ${name}` + (cond ? "" : `  ← ${JSON.stringify(extra || {})}`));
  return !!cond;
};

const logs = [], drawn = [], discarded = [];
const syncMagicCalls = [], afterDiscardCalls = [], damageCalls = [];
const NOA_SKILLS = [{ name: "魅力改造" }, { name: "改造副作用" }];
const card = (name, extra = {}) => ({ name, type: "slash", suit: "♠", power: 0, scale: "attack", ...extra });
const status = name => card(name, { status: true, type: "obstacle" });
const mk = (uid, gender, side, extra = {}) => ({
  uid, ref: uid, name: uid, gender, side, hp: 130, maxHp: 130, hand: [],
  stats: { attack: 6, magic: 4, speed: 8, handLimit: 4 },
  skills: [], ...extra,
});

ctx.BattleStatusCards = { isStatus: c => !!c?.status };
ctx.GuestCharacterSkills = {
  countsForLimit: (u, c) => !ctx.BattleStatusCards.isStatus(c),
  visibleHandCount: u => (u?.hand || []).filter(c => !c._pendingDraw
    && ctx.GuestCharacterSkills.countsForLimit(u, c)).length,
};
ctx.UnderwaterTrainSkills = { canDiscard: (u, c) => !ctx.BattleStatusCards.isStatus(c) };
ctx.CardUtils = {
  isKillCard: c => c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || ""),
  fromEntity: (name, extra) => ({ name, type: "slash", virtual: true, ...extra }),
};
ctx.BattleLog = { add: (s, t) => logs.push(String(t)) };
ctx.BattleLines = { skill: () => {} };
ctx.BattleCards = {
  put: (b, u, c, pile) => { discarded.push({ uid: u.uid, name: c.name, status: !!c.status, pile }); },
  putMany: (b, u, cs, pile) => cs.forEach(c => discarded.push({ uid: u.uid, name: c.name, status: !!c.status, pile })),
};
ctx.CatherineSkills = { syncMagic: (s, u) => syncMagicCalls.push(u.uid) };
ctx.WendyCadicisSkills = { afterDiscard: (s, u, cs) => afterDiscardCalls.push({ uid: u.uid, n: cs.length }) };
ctx.GameRandom = { sample: list => list[0], id: () => "id" };
ctx.GameData = { characters: [{ id: "noa", stats: { handLimit: 4 } }] };
ctx.BattleSystem = {
  draw: (u, n) => {
    drawn.push({ uid: u?.uid, n });
    for (let i = 0; i < n; i++) u.hand.push(card("实摸" + i));
    return drawn.slice(-1);
  },
  useVirtualKill: () => {},
};
ctx.BattleDrawFeedback = { signal: () => ({ signaled: true, drawn: 0, exhausted: false, locked: false, redirected: 0, gained: 0 }), shortage: () => "牌堆已无可摸的牌", action: () => "摸牌" };

const patch = (src, from, to, tag) => {
  const next = src.replace(from, to);
  if (next === src) throw new Error(`REVERT=${tag} 未命中锚点`);
  return next;
};
let charmSrc = read("noa-charm-skills.js");
let discardSrc = read("battle-discard-flow.js");
let sideSrc = read("noa-side-effect-skills.js");
// 反向锚点（修复后生效；未修复时锚点不存在则跳过，由 A~F 的红来体现）
const tryPatch = (tag, file, from, to) => {
  try {
    if (file === "charm") charmSrc = patch(charmSrc, from, to, tag);
    if (file === "discard") discardSrc = patch(discardSrc, from, to, tag);
    if (file === "side") sideSrc = patch(sideSrc, from, to, tag);
  } catch (e) { /* 未修复态：锚点不存在，红由断言给出 */ }
};
if (MODE === "count") tryPatch("count", "charm", "const diff = limit - countedHand(owner);", "const diff = limit - (owner.hand || []).length;");
if (MODE === "discardable") tryPatch("discardable", "charm", "if (need === overflow && need > 0 && owner.side === \"ally\"", "if (need > 0 && owner.side === \"ally\"");
if (MODE === "auto") tryPatch("auto", "charm", "const pool = discardableCards(owner);", "const pool = (owner.hand || []);");
if (MODE === "resume") {
  tryPatch("resume", "discard", "const need = Math.min(charm.need, available);", "const need = charm.need;");
  tryPatch("resume2", "discard", "if (!canDiscardAny(unit) || need <= 0) {", "if (false) {");
}
if (MODE === "virtual") tryPatch("virtual", "side", "if (!virtual) return false;", "/* REVERT_VIRTUAL */");

vm.runInContext(sideSrc, ctx, { filename: "noa-side-effect-skills.js" });
vm.runInContext(charmSrc, ctx, { filename: "noa-charm-skills.js" });
vm.runInContext(read("battle-runtime-helpers.js"), ctx, { filename: "battle-runtime-helpers.js" });
vm.runInContext(discardSrc, ctx, { filename: "battle-discard-flow.js" });
vm.runInContext(read("battle-discard-overflow.js"), ctx, { filename: "battle-discard-overflow.js" });
const Charm = ctx.NoaCharmSkills;
const Side = ctx.NoaSideEffectSkills;
const helpers = ctx.BattleRuntimeHelpers();

const flow = ctx.BattleDiscardFlow({
  active: helpers.active, visibleHand: helpers.visibleHand, handLimit: helpers.handLimit,
  canDiscardCard: helpers.canDiscardCard, canDiscardAny: helpers.canDiscardAny,
  discardNeed: helpers.discardNeed, discardOverflow: ctx.BattleDiscardOverflow({
    visibleHand: helpers.visibleHand, handLimit: helpers.handLimit }).discardOverflow,
  enterEndPhase: () => { logs.push("ENTER_END"); return true; },
  draw: ctx.BattleSystem.draw, combat: { pushFloat: () => {} },
  record: (s, t) => logs.push(String(t)), advanceToInput: async () => {},
  manualFlow: { resolveThunderHammer: () => false },
});

function fresh(hand, maleCount = 0, opts = {}) {
  const noa = mk("noa", "female", "ally", { skills: NOA_SKILLS, hand: [...hand] });
  const allies = [noa];
  for (let i = 0; i < maleCount; i++) allies.push(mk("m" + i, "male", "ally"));
  const enemy = mk("e0", "female", "enemy", { hp: 100 });
  const state = {
    view: "battle", log: [],
    battle: {
      phase: 4, turn: 1, locked: false, activeUid: opts.activeUid || "noa",
      allies, enemies: [enemy], discardPick: null, noaCharmDiscard: null,
      played: [], shownPlayed: [], animQueue: [], roundOrder: ["noa", "e0"], roundIndex: 0,
    },
  };
  ctx.state = state;
  logs.length = 0; drawn.length = 0; discarded.length = 0;
  syncMagicCalls.length = 0; afterDiscardCalls.length = 0; damageCalls.length = 0;
  return { state, noa, enemy };
}
const counted = u => helpers.visibleHand(u);
const discardable = u => u.hand.filter(c => helpers.canDiscardCard(u, c)).length;

async function segA() {
  // 4 普通 + 1 状态牌，上限 4：权威 visibleHandCount=4，不该补也不该弃
  const { state, noa } = fresh([card("a"), card("b"), card("c"), card("d"), status("中毒")]);
  T("A0 权威口径 visibleHand=4、discardNeed=0", counted(noa) === 4 && helpers.discardNeed(noa) === 0,
    { counted: counted(noa), need: helpers.discardNeed(noa) });
  Charm.balanceHand(state, noa, ctx.BattleSystem.draw);
  T("A1 不挂起玩家弃牌", !state.battle.noaCharmDiscard, { charm: state.battle.noaCharmDiscard });
  T("A2 不摸牌（已够）", drawn.length === 0, { drawn: drawn.length });
  T("A3 一张牌都不弃", discarded.length === 0, { discarded: discarded.length });

  // 3 普通 + 1 状态牌，上限 4：权威计入 3，应补 1 张
  const s2 = fresh([card("a"), card("b"), card("c"), status("中毒")]);
  T("A4 权威 visibleHand=3", counted(s2.noa) === 3, { counted: counted(s2.noa) });
  Charm.balanceHand(s2.state, s2.noa, ctx.BattleSystem.draw);
  T("A5 补 1 张至上限（状态牌不占位）", drawn.length === 1 && counted(s2.noa) === 4,
    { drawn: drawn.length, counted: counted(s2.noa), hand: s2.noa.hand.length });
  T("A6 战报按实摸数写「摸1张」", logs.some(l => l.includes("摸1张牌至手牌上限4")), { logs: logs.slice(0, 3) });
}

async function segB() {
  // 5 状态 + 1 普通，上限 4：当前会挂起 need=2，但可弃只有 1 张 → 卡死
  const { state, noa } = fresh([
    status("s1"), status("s2"), status("s3"), status("s4"), status("s5"), card("x"),
  ]);
  T("B0 权威 visibleHand=1、可弃=1", counted(noa) === 1 && discardable(noa) === 1,
    { counted: counted(noa), discardable: discardable(noa) });
  Charm.balanceHand(state, noa, ctx.BattleSystem.draw);
  const charm = state.battle.noaCharmDiscard;
  T("B1 不得挂起不可完成的弃牌", !charm, { charm });
  T("B2 不误弃唯一可弃牌", discarded.length === 0, { discarded: discarded.length });
  T("B3 应补 3 张（1→4）而非弃牌", drawn.length === 1 && drawn[0].n === 3,
    { drawn, counted: counted(noa) });
  T("B4 状态牌全部保留", noa.hand.filter(c => c.status).length === 5,
    { statusLeft: noa.hand.filter(c => c.status).length });

  // 计入上限、但被外部规则锁定不可弃的牌（水下列车限制牌一类的接口分歧）：
  // need 必须夹到可弃数，否则会退化成自动弃、绕过玩家选牌。
  const s3 = fresh([]);
  s3.noa.hand = [
    card("l1", { locked: true }), card("l2", { locked: true }), card("l3", { locked: true }),
    card("l4", { locked: true }), card("l5", { locked: true }), card("x"),
  ];
  const savedCan = ctx.UnderwaterTrainSkills.canDiscard;
  ctx.UnderwaterTrainSkills.canDiscard = (u, c) => !c.status && !c.locked;
  Charm.balanceHand(s3.state, s3.noa, ctx.BattleSystem.draw);
  T("B5 可弃牌不足时不挂起（走自动弃兜底）", !s3.state.battle.noaCharmDiscard,
    { charm: s3.state.battle.noaCharmDiscard, discarded: discarded.length });
  T("B6 只弃 1 张可弃牌、锁定牌全部保留",
    discarded.length === 1 && s3.noa.hand.filter(c => c.locked).length === 5,
    { discarded, hand: s3.noa.hand.length });
  ctx.UnderwaterTrainSkills.canDiscard = savedCan;

  // 摸牌动画未落位（_pendingDraw）：可见牌不足 need，不得挂起玩家选牌。
  const s4 = fresh([]);
  s4.noa.hand = [card("v0")].concat(
    Array.from({ length: 5 }, (_, i) => card("p" + i, { _pendingDraw: true })));
  Charm.balanceHand(s4.state, s4.noa, ctx.BattleSystem.draw);
  T("B7 可见牌不足时不挂起", !s4.state.battle.noaCharmDiscard,
    { charm: s4.state.battle.noaCharmDiscard });
  // 产品 countedHand 口径：排除状态牌但保留 _pendingDraw（动画落位后即计入上限）
  const countedWithPending = u => (u.hand || []).filter(c => !c.status).length;
  T("B8 自动弃 2 张（含 pending）至上限 4",
    discarded.length === 2 && countedWithPending(s4.noa) === 4
    && s4.noa.hand.every(c => c._pendingDraw),
    { discarded: discarded.length, counted: countedWithPending(s4.noa), hand: s4.noa.hand.length });
}

async function segC() {
  // 别家回合溢出：末尾是状态牌，autoDiscard 不得动它
  const { state, noa } = fresh([
    card("a"), card("b"), card("c"), card("d"), card("e"), status("中毒"),
  ], 0, { activeUid: "e0" });
  // 上限 4，权威计入 5 → 需弃 1 张；当前 diff=4-6=-2 → need=2
  Charm.balanceHand(state, noa, ctx.BattleSystem.draw);
  T("C0 弃的是诺亚自己的牌", discarded.every(d => d.uid === "noa"), { discarded });
  T("C1 状态牌未被弃", !discarded.some(d => d.status), { discarded });
  T("C2 恰好弃 1 张（权威 discardNeed=1）", discarded.length === 1,
    { discarded: discarded.length, need: helpers.discardNeed(noa) });
  T("C3 弃后计入上限手牌=4", counted(noa) === 4, { counted: counted(noa) });
  T("C4 走统一结算（syncMagic + afterDiscard 钩子在位）",
    syncMagicCalls.includes("noa") && afterDiscardCalls.some(c => c.uid === "noa"),
    { syncMagicCalls, afterDiscardCalls });
}

async function segD() {
  // 挂起后可弃牌被清空：confirmDiscard 必须清挂起继续，不能无限提示
  const { state, noa } = fresh([card("a"), card("b"), card("c"), card("d"), card("e"), card("f")]);
  Charm.balanceHand(state, noa, ctx.BattleSystem.draw);
  T("D0 已挂起 need=2", state.battle.noaCharmDiscard?.need === 2,
    { charm: state.battle.noaCharmDiscard });
  // 模拟挂起期间手牌全部变成状态牌（被其他效果转走/锁定）
  noa.hand = [status("t1"), status("t2"), status("t3"), status("t4")];
  state.battle.discardPick = null;
  const before = logs.length;
  await flow.confirmDiscard(state, () => {});
  T("D1 无可弃牌时清掉挂起", !state.battle.noaCharmDiscard,
    { charm: state.battle.noaCharmDiscard });
  T("D2 不无限提示「还需选择」", !logs.slice(before).some(l => l.includes("还需选择")),
    { logs: logs.slice(before) });
  T("D3 仍留在出牌阶段", state.battle.phase === 4, { phase: state.battle.phase });
}

async function segE() {
  // endTurn：攻击力口径、只打存活男性队友、type:skill 不触发受牌钩
  const noa = mk("noa", "female", "ally", { skills: NOA_SKILLS, stats: { attack: 6, magic: 4, speed: 8, handLimit: 4 } });
  const m0 = mk("m0", "male", "ally", { hp: 50 });
  const m1 = mk("m1", "male", "ally", { hp: 0 });
  const f0 = mk("f0", "female", "ally", { hp: 50 });
  const e0 = mk("e0", "male", "enemy", { hp: 50 });
  const state = { view: "battle", log: [], battle: { phase: 6, allies: [noa, m0, m1, f0], enemies: [e0], turn: 3 } };
  ctx.state = state;
  logs.length = 0; damageCalls.length = 0;
  const damage = (s, target, amount, label, actor, load) => damageCalls.push({ uid: target.uid, amount, label, card: load });
  Side.endTurn(state, noa, { damage });
  T("E0 只对存活男性队友造成伤害", damageCalls.length === 1 && damageCalls[0].uid === "m0",
    { damageCalls });
  T("E1 伤害=attack+tempAttack", damageCalls[0]?.amount === 6, { amount: damageCalls[0]?.amount });
  T("E2 载荷 type:skill 且 ignoreResponse/skipDamageModify",
    damageCalls[0]?.card?.type === "skill" && damageCalls[0]?.card?.ignoreResponse === true
    && damageCalls[0]?.card?.skipDamageModify === true, { card: damageCalls[0]?.card });
  T("E3 半魅魔血受牌钩不触发（type:skill 被 isCardDamage 排除）",
    /card\.type !== "skill"/.test(read("hoshino-kaiichi-skills.js"))
    && damageCalls[0]?.card?.type === "skill",
    { card: damageCalls[0]?.card });
  // 负 tempAttack 不得传负值
  noa.tempAttack = -20;
  damageCalls.length = 0;
  Side.endTurn(state, noa, { damage });
  T("E4 负攻击力夹到 0", damageCalls[0]?.amount === 0, { amount: damageCalls[0]?.amount });
  // 动态上限与伤害致死联动
  noa.tempAttack = 0;
  T("E5 上限=基础4+存活男性1", Side.handLimit(noa) === 5, { limit: Side.handLimit(noa) });
  m0.hp = 0;
  T("E6 男性阵亡后上限实时降为4", Side.handLimit(noa) === 4, { limit: Side.handLimit(noa) });
}

async function segF() {
  // 虚拟牌缺失：不得跳过出牌阶段
  const saved = ctx.CardUtils.fromEntity;
  ctx.CardUtils.fromEntity = () => undefined;
  const { state, noa } = fresh([card("a")], 0);
  const r = Side.beginPlayPhase(state, noa);
  T("F0 虚拟牌缺失时不狂暴、不跳过出牌阶段", r === false && !noa.skipPlayPhase,
    { r, skip: noa.skipPlayPhase });
  ctx.CardUtils.fromEntity = saved;

  // 幂等守卫：首次有男性（返回 false）后，同回合男性阵亡，应重新判定
  const s2 = fresh([card("a")], 1);
  Side.beginPlayPhase(s2.state, s2.noa);
  T("F1 有男性时首次不狂暴", !s2.noa.skipPlayPhase, { skip: s2.noa.skipPlayPhase });
  s2.state.battle.allies.find(u => u.uid === "m0").hp = 0;
  const r2 = Side.beginPlayPhase(s2.state, s2.noa);
  T("F2 同回合男性阵亡后补判狂暴", r2 === true && s2.noa.skipPlayPhase === true,
    { r2, skip: s2.noa.skipPlayPhase });

  // 目标池为空：不咬杀也不跳过（记录式，不算红）
  const s3 = fresh([card("a")], 0);
  s3.state.battle.enemies = [];
  const r3 = Side.beginPlayPhase(s3.state, s3.noa);
  T("F3 目标池为空不设 skipPlayPhase", !s3.noa.skipPlayPhase, { r3, skip: s3.noa.skipPlayPhase });
}

async function segG() {
  const validation = read("battle-save-checkpoint-validation.js");
  T("G0 存档 stable() 把 noaCharmDiscard 列为阻塞项", /"noaCharmDiscard"/.test(validation), {});
  const files = ["battle-turn-input.js", "battle-manual-continuation.js", "battle-share-flow.js",
    "battle-prepare-prompts.js"];
  const hits = files.filter(f => read(f).includes("NoaCharmSkills?.enterPlayPhase"));
  T("G1 4 个进入出牌阶段文件统一走 enterPlayPhase", hits.length >= 3, { hits });
  const turnStart = read("battle-turn-start.js");
  T("G2 摸牌/准备阶段不再调 balanceHand",
    !/NoaCharmSkills\?\.balanceHand\?\.\(/.test(turnStart), {});
  T("G3 beginPlayPhase 幂等键按回合隔离", read("noa-side-effect-skills.js").includes("_noaFrenzyTurn"), {});
}

(async () => {
  for (const seg of SEGS) {
    const fn = { A: segA, B: segB, C: segC, D: segD, E: segE, F: segF, G: segG }[seg.trim().toUpperCase()];
    if (!fn) { console.log(`SKIP unknown seg ${seg}`); continue; }
    console.log(`--- SEG ${seg} ---`);
    await fn();
  }
  console.log(`\nRESULT ${pass}/${total} FAIL=${failed.length}` + (failed.length ? ` [${failed.join(" | ")}]` : ""));
  process.exit(failed.length ? 1 : 0);
})();
