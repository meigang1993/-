// 怪面诺亚 · 两技能「其他 BUG」模块级边界检查（Node 直调，不依赖浏览器）
//   B1 狂暴目标池为空（单人 + 敌人全灭）不设 skip、不生成虚拟咬杀、不卡死
//   B2 狂暴目标池排除自己、包含敌方
//   B3 同回合重复 beginPlayPhase 幂等（只咬一次）
//   B4 endTurn 伤害 amount 在 tempAttack 为负时的表现（会不会传负伤害）
//   B5 手牌全是 _pendingDraw 时的溢出弃牌（autoDiscard 不重复/不漏）
//   B6 跨回合 resetBeginTurn 清 noaCharmDiscard
//   B7 handLimit / noIntentCost 依赖 window.state 的健壮性观测
//   B8 同一回合重复进入准备流程（continuePreparedTurn 两次）是否撤销狂暴 + 重复摸牌
// 支持 NOA_EDGE=B1,B2,... 分批。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const SRC = f => path.join(__dirname, "..", "src", "original", f);
const read = f => fs.readFileSync(SRC(f), "utf8");
const SEGS = (process.env.NOA_EDGE || "B1,B2,B3,B4,B5,B6,B7,B8,B9").split(",").filter(Boolean);
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

const logs = [], virtuals = [], damages = [], draws = [], discarded = [];
const NOA_SKILLS = [{ name: "魅力改造" }, { name: "改造副作用" }];
const mk = (uid, gender, side, extra = {}) => ({
  uid, ref: uid, name: uid, gender, side, hp: 130, maxHp: 130, hand: [],
  stats: { attack: 6, magic: 4, speed: 8, handLimit: 4 },
  skills: [], ...extra,
});
const slash = (name, extra = {}) => ({ name, type: "slash", suit: "♠", power: 0, scale: "attack", ...extra });

ctx.CardUtils = {
  isKillCard: c => c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || ""),
  fromEntity: (name, extra) => ({ name, type: "slash", power: 0, scale: "attack", ...extra }),
};
ctx.BattleLog = { add: (s, t) => logs.push(String(t)) };
ctx.BattleLines = { skill: () => {} };
ctx.BattleCards = {
  put: (b, u, card, pile) => discarded.push({ u: u?.ref, card: card?.name, pile }),
  putMany: () => {}, queueResponse: () => {},
  visibleHandCount: u => u?.hand?.length || 0,
};
ctx.GameRandom = { sample: list => list[0], id: () => "id" };
ctx.BattleSystem = {
  useVirtualKill: (s, a, t, c) => virtuals.push({ actor: a?.ref, target: t?.ref, card: c?.name }),
  draw: (u, n) => {
    draws.push({ unit: u?.ref, n });
    for (let i = 0; i < n; i++) u.hand.push(slash("摸牌" + i));
  },
};
ctx.GameData = { characters: [{ id: "noa", stats: { handLimit: 4 } }] };
ctx.CatherineSkills = { syncMagic: () => {} };
ctx.BattleStatusCards = { judgement: () => {}, triggerLandmine: () => {} };
ctx.UnderwaterTrainSkills = { judgement: () => {} };
ctx.UICommon = { skillsOf: () => [] };
ctx.BattleRelicTurns = { prepare: () => {}, finishPlay: () => {} };
ctx.BattlePrepareSequence = () => ({ resolve: () => true });
ctx.BattlePreparePrompts = () => ({
  resolveJudgement: () => {}, skipExtract: () => {}, resolveReckless: () => {},
  triggerReckless: () => {}, queueRecklessPrompt: () => {}, autoReckless: () => {},
});
ctx.SakuraRisaSkills = { playPhaseStart: () => {}, playPhaseEnd: () => {} };
ctx.RuinsEnemySkills = { landmineRps: { playPhaseStart: () => {} } };
ctx.BattleCounterTriggers = { pending: () => false };
ctx.BattleReactionQueue = { pending: () => false };
ctx.GuardKellySkills = { consumeFaceDown: () => false };
ctx.MieryulaTimeStop = { isSkillDisabled: () => false, shouldSkipTurn: () => false, consume: () => {} };
ctx.SakuraRisaSkills.pendingRevival = () => false;
ctx.ElranaAceNanaliSkills = { beforeBeginTurn: () => {} };
ctx.BertisGerlotSkills = { refreshArrogance: () => {} };
ctx.BakarSkills = { beginTurn: () => {} };
ctx.HoshinoSkills = { beginTurn: () => {} };
ctx.WendyCadicisSkills = { afterDiscard: () => {} };
ctx.MillerSkills = { offerShare: () => false };
ctx.RelicSystem = { hasEquipped: () => false };

vm.runInContext(read("noa-side-effect-skills.js"), ctx, { filename: "noa-side-effect-skills.js" });
vm.runInContext(read("noa-charm-skills.js"), ctx, { filename: "noa-charm-skills.js" });
vm.runInContext(read("battle-turn-state.js"), ctx, { filename: "battle-turn-state.js" });
vm.runInContext(read("battle-turn-start.js"), ctx, { filename: "battle-turn-start.js" });

const Side = ctx.NoaSideEffectSkills, Charm = ctx.NoaCharmSkills;
const TurnState = ctx.BattleTurnState;

const fresh = ({ males = 0, enemies = 2, deadEnemies = false } = {}) => {
  logs.length = 0; virtuals.length = 0; damages.length = 0; draws.length = 0; discarded.length = 0;
  const noa = mk("noa", "female", "ally", { skills: NOA_SKILLS });
  const allies = [noa];
  for (let i = 0; i < males; i++) allies.push(mk("m" + i, "male", "ally"));
  const es = [];
  for (let i = 0; i < enemies; i++) es.push(mk("e" + i, "male", "enemy", { hp: deadEnemies ? 0 : 130 }));
  const battle = { allies, enemies: es, phase: 1, turn: 1, activeUid: "noa", locked: false, log: [], played: [] };
  const state = { battle, settings: {} };
  ctx.state = state;
  return { state, battle, noa, allies, es };
};

// ---------- B1 目标池为空 ----------
if (SEGS.includes("B1")) {
  const { state, noa } = fresh({ enemies: 2, deadEnemies: true });
  const fired = Side.beginPlayPhase(state, noa);
  T("B1a 目标池为空时不狂暴（返回 false）", fired === false, { fired });
  T("B1b 不生成虚拟咬杀", virtuals.length === 0, { virtuals });
  T("B1c 不设 skipPlayPhase / 不写狂暴战报",
    !noa.skipPlayPhase && !logs.some(l => l.includes("没有存活的男性角色")),
    { skip: !!noa.skipPlayPhase, logs: logs.slice(0, 3) });
  T("B1d 不写 _noaFrenzyTurn 之外的残留标记",
    noa.skipPlayReason === undefined, { reason: noa.skipPlayReason || null });
}

// ---------- B2 目标池排除自己、包含敌方 ----------
if (SEGS.includes("B2")) {
  const { state, noa, es } = fresh({ enemies: 2 });
  Side.beginPlayPhase(state, noa);
  T("B2a 虚拟咬杀生成 1 次", virtuals.length === 1, { virtuals });
  T("B2b 目标不是诺亚自己", virtuals[0]?.target !== "noa", virtuals[0]);
  T("B2c 目标落在敌方池", es.some(e => e.ref === virtuals[0]?.target), virtuals[0]);
  T("B2d 设置 skipPlayPhase + reason", noa.skipPlayPhase === true
    && noa.skipPlayReason === "改造副作用", { skip: noa.skipPlayPhase, reason: noa.skipPlayReason });
}

// ---------- B3 同回合重复 beginPlayPhase 幂等 ----------
if (SEGS.includes("B3")) {
  const { state, noa } = fresh({ enemies: 2 });
  const r1 = Side.beginPlayPhase(state, noa);
  const r2 = Side.beginPlayPhase(state, noa);
  const r3 = Side.beginPlayPhase(state, noa);
  T("B3a 三次调用都返回 true（狂暴保持）", r1 === true && r2 === true && r3 === true,
    { r1, r2, r3 });
  T("B3b 只生成 1 次虚拟咬杀（不重复）", virtuals.length === 1, { count: virtuals.length });
  T("B3c _noaFrenzyTurn 锁在当前回合", noa._noaFrenzyTurn === 1, { t: noa._noaFrenzyTurn });
}

// ---------- B4 endTurn 负 tempAttack ----------
if (SEGS.includes("B4")) {
  const { state, noa, allies } = fresh({ males: 1, enemies: 1 });
  noa.tempAttack = -20;   // 攻击 6 + (-20) = -14
  Side.endTurn(state, noa, { damage: (...a) => damages.push(a) });
  T("B4a 有存活男性时确实触发伤害调用", damages.length === 1, { count: damages.length });
  const amount = damages[0]?.[2];
  T("B4b 负 tempAttack 被夹到 0，不会把负伤害传入 damage 管线",
    amount === 0, { amount, statsAttack: noa.stats.attack, tempAttack: noa.tempAttack });
  T("B4c 战报金额为 0（不出现 -14）",
    logs.some(l => l.includes("0点伤害")) && !logs.some(l => l.includes("-14")),
    logs.slice(0, 2));
}

// ---------- B5 全是 _pendingDraw 的溢出弃牌 ----------
if (SEGS.includes("B5")) {
  const { state, noa } = fresh({ enemies: 1 });
  state.battle.phase = 4;
  noa.hand = [
    slash("待落位0", { _pendingDraw: true }), slash("待落位1", { _pendingDraw: true }),
    slash("待落位2", { _pendingDraw: true }), slash("待落位3", { _pendingDraw: true }),
    slash("待落位4", { _pendingDraw: true }), slash("待落位5", { _pendingDraw: true }),
  ];
  const r = Charm.balanceHand(state, noa, ctx.BattleSystem.draw, { onlySelf: true });
  T("B5a 可见牌不足 -> 走自动弃兜底（返回负数或 0）", r <= 0, { r });
  T("B5b 弃后手牌恰为上限 4", noa.hand.length === 4, { hand: noa.hand.length });
  T("B5c 弃牌归属诺亚自己、无重复弃同一张",
    discarded.length === 2 && new Set(discarded.map(d => d.card)).size === 2,
    { discarded });
  T("B5d 不残留 noaCharmDiscard 挂起", !state.battle.noaCharmDiscard,
    { charm: state.battle.noaCharmDiscard || null });
}

// ---------- B6 跨回合清理 ----------
if (SEGS.includes("B6")) {
  const { battle, noa } = fresh();
  battle.noaCharmDiscard = { unitUid: "noa", need: 2 };
  battle.discardPick = { unitUid: "noa", indexes: [0, 1] };
  TurnState.resetBeginTurn(noa, battle, 1);
  T("B6a resetBeginTurn 清 noaCharmDiscard", !battle.noaCharmDiscard,
    { charm: battle.noaCharmDiscard || null });
  T("B6b resetBeginTurn 清 discardPick", !battle.discardPick, { pick: battle.discardPick || null });
  battle.noaCharmDiscard = { unitUid: "noa", need: 1 };
  TurnState.cleanupPrompts(battle);
  T("B6c cleanupPrompts 同样清 noaCharmDiscard", !battle.noaCharmDiscard,
    { charm: battle.noaCharmDiscard || null });
}

// ---------- B7 window.state 健壮性观测 ----------
if (SEGS.includes("B7")) {
  const { state, battle, noa } = fresh({ enemies: 1 });
  battle.phase = 4;
  const limit = Side.handLimit(noa);
  T("B7a 正常态 handLimit 读 window.state.battle 得 4", limit === 4, { limit });
  // 传入 state 与 window.state 不同：观测技能是否会用错战斗对象
  const other = { battle: { ...battle, allies: [noa, mk("x", "male", "ally")], turn: 9 }, settings: {} };
  const firedOnOther = Side.beginPlayPhase(other, noa);
  T("B7b ⚠ beginPlayPhase 用传入 state（other 有男性）-> 不狂暴",
    firedOnOther === false, { firedOnOther, windowTurn: ctx.state.battle.turn });
  const limitAfter = Side.handLimit(noa);
  T("B7c ⚠ handLimit 仍读 window.state（不随 other 变），两处口径不同源",
    limitAfter === 4, { limitAfter });
}

// ---------- B8 同一回合重复进入准备流程 ----------
if (SEGS.includes("B8")) {
  const { state, battle, noa } = fresh({ enemies: 2 });
  const api = {
    active: b => (b.allies || []).concat(b.enemies || []).find(u => u.uid === b.activeUid),
    allUnits: b => (b.allies || []).concat(b.enemies || []),
    combat: { useCard: () => {}, checkEnd: () => {}, damage: () => {} },
    draw: ctx.BattleSystem.draw,
    intentMax: () => 1,
    nextAnim: () => {},
    nextRoundUnit: b => b.allies[0],
    tempAttack: u => (u.stats?.attack || 0) + (u.tempAttack || 0),
    turnDrawCount: () => 3,
    record: (s, t) => logs.push(String(t)),
    waitEffects: async () => {},
    getFinishTurn: () => () => true,
    advanceToInput: async () => {},
  };
  const TurnStart = ctx.BattleTurnStart(api);
  TurnStart.continuePreparedTurn(state, noa);
  const first = {
    skip: !!noa.skipPlayPhase, reason: noa.skipPlayReason || null,
    virt: virtuals.length, hand: noa.hand.length, draws: draws.length,
    phase: battle.phase, frenzyTurn: noa._noaFrenzyTurn,
  };
  // 模拟同一回合另一条恢复路径（手动响应恢复 / 新月分享 / 无谋冲拳恢复）
  // 再次进入准备流程：continueStartPhase 会再重置 skipPlayPhase 并再摸一次牌。
  TurnStart.continuePreparedTurn(state, noa);
  const second = {
    skip: !!noa.skipPlayPhase, reason: noa.skipPlayReason || null,
    virt: virtuals.length, hand: noa.hand.length, draws: draws.length,
    phase: battle.phase, frenzyTurn: noa._noaFrenzyTurn,
  };
  console.log(`INFO B8 first=${JSON.stringify(first)}`);
  console.log(`INFO B8 second=${JSON.stringify(second)}`);
  T("B8a 第一次进入准备流程正常触发狂暴", first.skip === true && first.virt === 1
    && first.draws === 1, first);
  T("B8b ⚠ 同一回合重复进入准备流程后，狂暴是否被撤销（期望不撤销）",
    second.skip === true, second);
  T("B8c ⚠ 同一回合是否重复摸牌（期望只摸 1 次）",
    second.draws === 1, second);
  T("B8d 重复进入不会重复生成虚拟咬杀", second.virt === 1, second);
}


// ---------- B9 敌方回合的溢出重判不得弹玩家弃牌选择 ----------
if (SEGS.includes("B9")) {
  const { state, battle, noa, es } = fresh({ enemies: 1 });
  battle.phase = 4;
  battle.activeUid = es[0].uid;      // 敌方出牌阶段
  noa.hand = [slash("a"), slash("b"), slash("c"), slash("d"),
    slash("e"), slash("f"), slash("g")];   // 7 张 > 上限 4
  // 出牌后钩子调用（无 opts）：模拟敌方出牌后重判诺亚手牌
  const r = Charm.balanceHand(state, es[0], ctx.BattleSystem.draw);
  T("B9a 敌方回合溢出重判不挂起 noaCharmDiscard（不得弹玩家弃牌选择）",
    !battle.noaCharmDiscard, { charm: battle.noaCharmDiscard || null, r });
  T("B9b 自动弃至上限 4", noa.hand.length === 4, { hand: noa.hand.length });
  T("B9c 弃牌归属诺亚自己、无重复", discarded.length === 3
    && discarded.every(d => d.u === "noa")
    && new Set(discarded.map(d => d.card)).size === 3, { discarded });
}

console.log(`RESULT ${pass}/${total}`);
process.exit(pass === total ? 0 : 1);
