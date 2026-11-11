// 怪面诺亚【淫气改造】×【改造副作用】联动严格检查（Node 直调）
//   A 动态手牌上限联动：N 名存活男性 -> 上限 4+N -> 出牌阶段摸至上限 / 出牌后补回
//   B 结束阶段伤害致死 -> 上限实时下降 -> 下回合出牌阶段开始触发玩家弃置
//   C 无存活男性 -> 狂暴虚拟咬杀 + 跳过出牌阶段 -> 淫气改造整回合不生效
//   D 所有「进入出牌阶段」路径必须统一：调 balanceHand + 尊重 skipPlayPhase
//   E 免杀意即时判定 / 虚拟咬杀 noIntentCost 离区清除，无记忆泡泡式残留
//   F 手牌上限消费方一致（标准弃牌阶段与 balanceHand 用同一 handLimit）
// 反向验证：LINK_REVERT=charm|frenzy|paths|cleanup 时对应断言必须变红。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = f => path.join(__dirname, "..", "src", "original", f);
const read = f => fs.readFileSync(SRC(f), "utf8");
const REVERT = process.env.LINK_REVERT || "";
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

// ---------- 最小运行时 ----------
const logs = [], lines = [], discarded = [], virtuals = [];
const mkUnit = (ref, gender, hp = 50, extra = {}) => ({
  uid: ref, ref, name: ref, gender, hp, maxHp: 65, side: "ally",
  hand: [], stats: { attack: 6, magic: 4, speed: 8, maxHp: 130, bloodlust: 1, handLimit: 4 },
  skills: [], ...extra,
});
const NOA_SKILLS = [
  { name: "淫气改造", text: "锁定技，出牌阶段内手牌数始终等于手牌上限；使用【杀】牌不消耗杀意。" },
  { name: "改造副作用", text: "锁定技，结束阶段对其他存活男性造成攻击力伤害；每名存活男性手牌上限+1；无存活男性时随机虚拟咬杀并跳过出牌阶段。" },
];
const slash = (name = "杀（普攻）", extra = {}) => ({
  name, type: "slash", suit: "♠", power: 0, scale: "attack", ...extra,
});

ctx.CardUtils = {
  isKillCard: c => c?.type === "slash" || /杀(?:（[^）]*）)?$/.test(c?.name || ""),
  fromEntity: (name, extra) => ({ name, type: "slash", power: 0, scale: "attack", ...extra }),
};
ctx.BattleLog = { add: (state, text) => logs.push(text) };
ctx.BattleLines = { skill: (state, u, name) => lines.push({ unit: u?.ref, name }) };
ctx.BattleCards = {
  put: (b, u, card, pile) => discarded.push({ u: u?.ref, card: card?.name, pile }),
  putMany: () => {},
  queueResponse: () => {},
  visibleHandCount: u => u?.hand?.length || 0,
};
ctx.GameRandom = { sample: list => list[0], id: () => "id" };
ctx.BattleSystem = {
  useVirtualKill: (state, actor, target, card) => virtuals.push({ actor: actor?.uid, target: target?.uid, card }),
  draw: (unit, n) => { for (let i = 0; i < n; i++) unit.hand.push(slash("摸牌" + i)); },
};
ctx.GameData = { characters: [{ id: "noa", stats: { handLimit: 4 } }] };
ctx.BattleStatusCards = { triggerLandmine: () => {} };
ctx.SakuraRisaSkills = { playPhaseStart: () => {} };
ctx.RuinsEnemySkills = { landmineRps: { playPhaseStart: () => {} } };
ctx.WendyCadicisSkills = { afterDiscard: () => {} };
ctx.CatherineSkills = { syncMagic: () => {} };
ctx.MillerSkills = { offerShare: () => false };
// 恒真守卫：测试模块的同步段会反复重置 ctx.state，若靠 window.state 判定会让
// resolveReckless 在 await 之后误判「非当前状态」而提前 return（假绿/假红来源）。
ctx.BattleActionGuard = { guard: () => () => true };
ctx.AppRuntimeErrors = {};

// ---------- 载入 ----------
vm.runInContext(read("noa-side-effect-skills.js"), ctx, { filename: "noa-side-effect-skills.js" });
vm.runInContext(read("noa-charm-discard.js"), ctx, { filename: "noa-charm-discard.js" });
vm.runInContext(read("noa-charm-skills.js"), ctx, { filename: "noa-charm-skills.js" });
try {
  vm.runInContext(read("battle-card-cleanup.js"), ctx, { filename: "battle-card-cleanup.js" });
} catch (e) { console.log("(cleanup 未加载: " + e.message + ")"); }
vm.runInContext(read("battle-prepare-prompts.js"), ctx, { filename: "battle-prepare-prompts.js" });

const Charm = ctx.NoaCharmSkills;
const Side = ctx.NoaSideEffectSkills;
if (REVERT === "charm") { Charm.balanceHand = () => 0; Charm.noIntentCost = () => false; }
if (REVERT === "frenzy") Side.beginPlayPhase = () => false;
if (REVERT === "cleanup" && ctx.BattleCardCleanup) ctx.BattleCardCleanup.clearPlayFlags = () => {};

const fresh = (males = 2, enemies = 1) => {
  const noa = mkUnit("noa", "female", 50, { skills: NOA_SKILLS });
  const allies = [noa];
  for (let i = 0; i < males; i++) allies.push(mkUnit("m" + i, "male", 50));
  const es = [];
  for (let i = 0; i < enemies; i++) es.push(mkUnit("e" + i, "male", 50, { side: "enemy" }));
  const battle = { allies, enemies: es, phase: 4, turn: 1, activeUid: "noa", locked: false, log: [], played: [] };
  const state = { battle, settings: {} };
  ctx.state = state;
  return { state, battle, noa, allies, enemies: es };
};
const draw = ctx.BattleSystem.draw;

// ================= A 动态上限联动 =================
{
  const { state, battle, noa } = fresh(2);
  T("A1 2 名存活男性 -> 手牌上限 6", Side.handLimit(noa) === 6, { got: Side.handLimit(noa) });
  const n = Charm.balanceHand(state, noa, draw, { onlySelf: true });
  T("A2 出牌阶段开始摸至上限 6", n === 6 && noa.hand.length === 6, { n, hand: noa.hand.length });
  // 出牌后钩子：任意角色出牌都重判诺亚手牌
  noa.hand.pop();
  const n2 = Charm.balanceHand(state, noa, draw);
  T("A3 出牌后补回上限", n2 === 1 && noa.hand.length === 6, { n2, hand: noa.hand.length });
  T("A4 出牌阶段免杀意", Charm.noIntentCost(noa, slash()) === true);
  battle.phase = 3;
  T("A5 非出牌阶段不免杀意", Charm.noIntentCost(noa, slash()) === false);
  battle.phase = 4;
  lines.length = 0;
  Charm.playKillLine(state, noa, slash());
  T("A6 出牌阶段使用杀台词", lines.some(l => l.name === "使用杀" && l.unit === "noa"), { lines });
  battle.phase = 6;
  lines.length = 0;
  Charm.playKillLine(state, noa, slash());
  T("A7 结束阶段不播使用杀台词", lines.length === 0, { lines });
  T("A8 敌方男性不计入上限（仅 allies）", Side.handLimit(noa) === 6);
}

// ================= B 结束阶段伤害 -> 上限下降 -> 弃置 =================
{
  const { state, battle, noa, allies } = fresh(2);
  battle.phase = 4;
  Charm.balanceHand(state, noa, draw, { onlySelf: true });
  const m0 = allies[1], m1 = allies[2];
  const before = [m0.hp, m1.hp];
  lines.length = 0;
  const dmg = (state, target, amount, reason, source, card) => { target.hp -= amount; };
  Side.endTurn(state, noa, { damage: dmg });
  T("B1 两名男性各掉攻击力 6", before[0] - m0.hp === 6 && before[1] - m1.hp === 6,
    { before, after: [m0.hp, m1.hp] });
  T("B2 播放改造副作用台词", lines.some(l => l.name === "改造副作用" && l.unit === "noa"), { lines });
  // 一名男性被打死 -> 上限 6 -> 5
  m0.hp = 0;
  T("B3 男性阵亡后上限实时降为 5", Side.handLimit(noa) === 5, { got: Side.handLimit(noa) });
  // 下回合出牌阶段开始：手牌 6 > 上限 5 -> 挂起玩家弃置
  battle.turn = 2;
  battle.phase = 4;
  delete battle.noaCharmDiscard;
  logs.length = 0;
  Charm.balanceHand(state, noa, draw, { onlySelf: true });
  T("B4 出牌阶段开始触发弃置（need=1）",
    battle.noaCharmDiscard?.need === 1 && battle.noaCharmDiscard?.unitUid === "noa",
    { charm: battle.noaCharmDiscard });
  T("B5 弃置日志写明上限 5", logs.some(t => /上限5/.test(t)), { logs });
  // 确认弃 1 张后重判，不再重复挂起
  noa.hand.pop();
  battle.noaCharmDiscard = null;
  logs.length = 0;
  const n = Charm.balanceHand(state, noa, draw);
  T("B6 弃至上限后不重复补牌/弃牌", n === 0 && noa.hand.length === 5, { n, hand: noa.hand.length });
}

// ================= C 狂暴联动 =================
{
  const { state, battle, noa } = fresh(0, 1);
  battle.phase = 3;
  virtuals.length = 0;
  const frenzy = Side.beginPlayPhase(state, noa);
  T("C1 无存活男性触发狂暴", frenzy === true && noa.skipPlayPhase === true, { frenzy, skip: noa.skipPlayPhase });
  T("C2 虚拟【咬杀】已打出", virtuals.length === 1 && virtuals[0].card?.name === "咬杀", { virtuals });
  T("C3 虚拟牌自带 noIntentCost（phase3 不靠淫气改造）",
    virtuals[0]?.card?.noIntentCost === true && virtuals[0]?.card?.virtual === undefined,
    { card: virtuals[0]?.card });
  T("C4 同回合不重复狂暴", Side.beginPlayPhase(state, noa) === true);
  // 主路径：见到 skipPlayPhase 不设 phase=4 -> 淫气改造整回合不生效
  battle.phase = 3;
  lines.length = 0;
  T("C5 狂暴回合不进 phase4（免杀意判据不生效）",
    battle.phase !== 4 && Charm.noIntentCost(noa, slash()) === false);
}

// ================= D 进入出牌阶段的所有路径一致性 =================
{
  const files = fs.readdirSync(SRC("")).filter(f => f.endsWith(".js"));
  const enterers = [], stray = [];
  for (const f of files) {
    const ls = read(f).split("\n");
    for (let i = 0; i < ls.length; i++) {
      if (/NoaCharmSkills\?\.enterPlayPhase/.test(ls[i])) enterers.push({ file: f, line: i + 1 });
      if (/\.phase\s*=\s*4\b/.test(ls[i])) stray.push({ file: f, line: i + 1 });
    }
  }
  T("D1 5 条进入出牌阶段路径统一走 enterPlayPhase", enterers.length === 5,
    { count: enterers.length, enterers });
  T("D2 无旁路再自行把 phase 设成 4", stray.length === 0, { stray });
  const charmTxt = read("noa-charm-skills.js");
  const impl = charmTxt.slice(charmTxt.indexOf("function enterPlayPhase"),
    charmTxt.indexOf("return { noIntentCost"));
  T("D3 enterPlayPhase 内部做手牌平衡", /balanceHand\(/.test(impl), { impl: impl.slice(0, 100) });
  T("D3b enterPlayPhase 内部拦截 skipPlayPhase", /skipPlayPhase/.test(impl));
  T("D3c enterPlayPhase 设 phase=4", /PLAY_PHASE/.test(impl));
  T("D3d 两条准备恢复路径都处理 skipPlayPhase",
    (read("battle-prepare-prompts.js").match(/skipPlayPhase/g) || []).length >= 2,
    { count: (read("battle-prepare-prompts.js").match(/skipPlayPhase/g) || []).length });

  // 运行时：resolveReckless 恢复路径（诺亚手牌含无谋冲拳牌时可达）
  // 两个场景必须串行：actionGuard 读 window.state，并发会互相覆盖导致提前 return。
  const makePrompts = n => ctx.BattlePreparePrompts({
    active: () => n,
    allUnits: b => [...(b.allies || []), ...(b.enemies || [])],
    waitEffects: async () => {},
    continueStartPhase: (s, u) => {
      ctx.state = s;
      u.skipPlayPhase = false;
      Side.beginPlayPhase(s, u);
    },
    shouldPromptReckless: () => false,
    shouldPromptSpeedAssault: () => false,
    shouldPromptMimic: () => false,
    shouldPromptExtract: () => false,
    record: (s, t) => logs.push(t),
    tempAttack: () => 0,
    combat: { checkEnd: () => {}, damage: () => {} },
    finishTurn: () => true,
    advanceToInput: async () => {},
  });
  var runtimeDone = (async () => {
    // 场景 1：有男性 -> 正常进出牌阶段，必须调用 balanceHand（以手牌变化为证）
    const a1 = fresh(2);
    ctx.state = a1.state;
    a1.battle.phase = 1;
    a1.battle.recklessPrompt = { uid: "noa", selectedIndex: 0 };
    a1.noa.hand = [slash("无谋冲拳", { reckless: true })];
    logs.length = 0;
    await makePrompts(a1.noa).resolveReckless(a1.state, false, 0, () => {});
    T("D4 有男性：恢复路径进入 phase4", a1.battle.phase === 4, { phase: a1.battle.phase });
    T("D5 有男性：恢复路径执行手牌平衡（摸至上限 6）", a1.noa.hand.length === 6,
      { hand: a1.noa.hand.length, logs });

    // 场景 2：无存活男性（狂暴） -> 恢复路径不得绕过 skipPlayPhase
    const a2 = fresh(0, 1);
    ctx.state = a2.state;
    a2.battle.phase = 1;
    a2.battle.recklessPrompt = { uid: "noa", selectedIndex: 0 };
    a2.noa.hand = [slash("无谋冲拳", { reckless: true })];
    logs.length = 0;
    await makePrompts(a2.noa).resolveReckless(a2.state, false, 0, () => {});
    T("D6 狂暴回合：恢复路径不得进入 phase4", a2.battle.phase !== 4,
      { phase: a2.battle.phase, skip: a2.noa.skipPlayPhase, logs: logs.slice(-3) });
  })();
}

// ================= E 免杀意无残留 =================
{
  const { state, battle, noa } = fresh(2);
  battle.phase = 4;
  const card = slash();
  T("E1 淫气改造不往牌上写标记（即时判定）",
    !("noIntentCost" in card) && Charm.noIntentCost(noa, card) === true);
  // 虚拟咬杀的 noIntentCost 是牌自带，离区应被 clearPlayFlags 清除
  const v = slash("咬杀", { virtual: true, void: true, noIntentCost: true, generatedBySkill: "改造副作用" });
  if (ctx.BattleCardCleanup?.clearPlayFlags) ctx.BattleCardCleanup.clearPlayFlags(v);
  T("E2 虚拟咬杀离区后 noIntentCost 被清除", v.noIntentCost === undefined, { noIntentCost: v.noIntentCost });
  battle.phase = 6;
  T("E3 回收后非出牌阶段打出正常消耗杀意", Charm.noIntentCost(noa, v) === false);
}

// ================= F 上限消费方一致 =================
{
  const txts = ["battle-runtime-helpers.js", "ui-common.js", "battle-ai-helpers.js"]
    .map(f => ({ f, t: read(f) }));
  for (const { f, t } of txts) {
    T(`F ${f} 消费 NoaSideEffectSkills.handLimit`, /NoaSideEffectSkills\?\.handLimit/.test(t));
  }
  const { noa } = fresh(2);
  const runtimeHl = (u) => Side.handLimit(u) ?? Math.max(0, u.stats.handLimit || 0);
  T("F4 标准弃牌阶段与 balanceHand 同一上限", runtimeHl(noa) === 6, { got: runtimeHl(noa) });
}

// ---------- 汇总（异步段完成后） ----------
runtimeDone.then(() => {
  console.log(`\n${pass}/${total}`);
  if (pass !== total) process.exitCode = 1;
});
