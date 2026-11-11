// 怪面诺亚【淫气改造】×【改造副作用】严格检查：状态牌跳过出牌阶段耦合 + 其他边界
//   A 眩晕 / 麻痹 / 混乱(无同伴) 已跳过出牌阶段 -> 不狂暴、不覆盖跳过原因
//   B 连续回合：眩晕不咬 -> 下回合正常咬 -> 麻痹不咬 -> 再下回合正常咬（不残留/不漏判）
//   C 不受影响对照：封魔 / 冻结 / 眩晕判定失败 -> 仍狂暴
//   D 眩晕 + 有男性：不狂暴（本就不该狂暴）、结束阶段伤害与上限照常
//   E 观测：混乱(有同伴) 不设 skipPlayPhase，狂暴照常（两个锁定技叠加）
//   F 其他边界：幂等、同回合男性阵亡补判、跨回合残留、空池、虚拟牌缺失、
//               负攻击夹零、性别不可变、跳过原因缺失、动态上限、结束阶段口径
//   G 静态链路：判定与狂暴的先后顺序、5 处 skip 消费方、enterPlayPhase 拦截
//   H 反向：REVERT=block|frenzy|clamp 时对应断言必须变红
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = f => path.join(__dirname, "..", "src", "original", f);
const REVERT = process.env.REVERT || "";
let raw = fs.readFileSync(SRC("noa-side-effect-skills.js"), "utf8");
if (REVERT === "block") raw = raw.replace(
  "    if (unit.skipPlayPhase) return false;\n    if (malesOf(b).length) return false;",
  "    if (malesOf(b).length) return false;");
if (REVERT === "clamp") raw = raw.replace(
  "const amount = Math.max(0, (unit.stats?.attack || 0) + (unit.tempAttack || 0));",
  "const amount = (unit.stats?.attack || 0) + (unit.tempAttack || 0);");

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

const logs = [], virtuals = [], pools = [], damage = [], lines = [];
const SKILLS = [{ name: "淫气改造" }, { name: "改造副作用" }];
const mk = (ref, gender, side = "ally", extra = {}) => ({
  uid: ref, ref, name: ref, gender, side, hp: 500, maxHp: 500,
  stats: { attack: 6, magic: 4, speed: 8, maxHp: 500, handLimit: 4 },
  hand: [], skills: [], ...extra,
});
ctx.CardUtils = {
  fromEntity: (name, extra) => ctx.__noVirtual ? null : ({ name, type: "slash", suit: "♠", ...extra }),
};
ctx.BattleLog = { add: (s, t) => logs.push(t) };
ctx.BattleLines = { skill: (s, u, n) => lines.push(n) };
ctx.GameData = { characters: [{ id: "noa", stats: { handLimit: 4 } }] };
ctx.__force = null;
ctx.GameRandom = {
  sample: (list) => {
    pools.push(list.map(u => ({ uid: u.uid, side: u.side, gender: u.gender, hp: u.hp })));
    return ctx.__force || list[0];
  },
};
ctx.BattleSystem = {
  useVirtualKill: (s, a, t, c) => virtuals.push({ actor: a?.uid, target: t?.uid, card: c?.name }),
};
vm.runInContext(raw, ctx, { filename: "noa-side-effect-skills.js" });
const Side = ctx.NoaSideEffectSkills;
if (REVERT === "frenzy") Side.beginPlayPhase = () => false;

const clear = () => {
  logs.length = 0; virtuals.length = 0; pools.length = 0;
  damage.length = 0; lines.length = 0;
  ctx.__force = null; ctx.__noVirtual = false;
};
function scene(team = ["female", "female"], opts = {}) {
  const noa = mk("noa", "female", "ally", { skills: SKILLS });
  const mates = team.map((g, i) => mk("m" + i, g));
  const enemies = opts.noEnemies ? [] : [mk("e0", "male", "enemy"), mk("e1", "female", "enemy")];
  const battle = {
    allies: [noa, ...mates], enemies, phase: 3, turn: 1,
    activeUid: "noa", locked: false, log: [],
  };
  const state = { battle, settings: {}, battleLog: logs, log: [] };
  ctx.state = state;
  return { state, battle, noa, mates, enemies };
}
// 对应 battle-turn-start.js:47 新回合 !repeated 时重置 skipPlayPhase。
const resetTurn = (s, turn) => {
  s.noa.skipPlayPhase = false;
  s.noa.skipPlayReason = null;
  s.battle.turn = turn;
  s.battle.phase = 3;
  clear();
};
// 模拟判定阶段 BattleStatusCardTriggers.judgement 置位。
const applySkip = (s, reason, extra = {}) => {
  s.noa.skipPlayPhase = true;
  s.noa.skipPlayReason = reason;
  Object.assign(s.noa, extra);
};
const endTurn = s => Side.endTurn(s.state, s.noa, {
  damage: (st, t, amt) => damage.push({ uid: t.uid, amt }),
});
const noFrenzyLog = () => !logs.some(t => t.includes("改造副作用发作"));

// ---------- A 三种原因跳过出牌阶段 ----------
{
  for (const [reason, extra] of [
    ["眩晕", {}],
    ["麻痹", { noResponse: true, noResponseReason: "麻痹" }],
    ["混乱", {}],
  ]) {
    const s = scene();
    resetTurn(s, 9);
    applySkip(s, reason, extra);
    const r = Side.beginPlayPhase(s.state, s.noa);
    T(`A-${reason} 不再打咬杀、跳过原因保持「${reason}」`,
      r === false && virtuals.length === 0 && pools.length === 0
      && s.noa.skipPlayPhase === true && s.noa.skipPlayReason === reason,
      { r, virtuals: virtuals.length, reason: s.noa.skipPlayReason });
    T(`A-${reason}-log 不写狂暴战报、不播改造副作用台词`,
      noFrenzyLog() && !lines.includes("改造副作用"), { logs, lines });
    T(`A-${reason}-mark 不写 _noaFrenzyTurn`,
      s.noa._noaFrenzyTurn !== 9, { mark: s.noa._noaFrenzyTurn });
  }
}

// ---------- B 连续回合不残留 / 不漏判 ----------
{
  const s = scene();
  const flow = [];
  resetTurn(s, 1); applySkip(s, "眩晕");
  flow.push({ t: 1, r: Side.beginPlayPhase(s.state, s.noa), v: virtuals.length });
  resetTurn(s, 2);
  flow.push({ t: 2, r: Side.beginPlayPhase(s.state, s.noa), v: virtuals.length });
  resetTurn(s, 3); applySkip(s, "麻痹", { noResponse: true });
  flow.push({ t: 3, r: Side.beginPlayPhase(s.state, s.noa), v: virtuals.length });
  resetTurn(s, 4);
  flow.push({ t: 4, r: Side.beginPlayPhase(s.state, s.noa), v: virtuals.length });
  T("B1 四回合交替：眩晕不咬 / 正常咬 / 麻痹不咬 / 正常咬",
    flow[0].r === false && flow[0].v === 0
    && flow[1].r === true && flow[1].v === 1
    && flow[2].r === false && flow[2].v === 0
    && flow[3].r === true && flow[3].v === 1, { flow });
  T("B2 第4回合跳过原因回到「改造副作用」而非残留眩晕/麻痹",
    s.noa.skipPlayReason === "改造副作用" && s.noa._noaFrenzyTurn === 4,
    { reason: s.noa.skipPlayReason, mark: s.noa._noaFrenzyTurn });
}

// ---------- C 不跳过出牌阶段的对照 ----------
{
  const seal = scene(); resetTurn(seal, 1);
  seal.noa.skipDrawPhase = true; seal.noa.drawLockedThisTurn = true;
  const r1 = Side.beginPlayPhase(seal.state, seal.noa);
  T("C1 封魔（只跳过摸牌）仍狂暴、原因不被覆盖",
    r1 === true && virtuals.length === 1 && seal.noa.skipPlayReason === "改造副作用",
    { r1, virtuals: virtuals.length });

  const freeze = scene(); resetTurn(freeze, 2);
  freeze.noa.frozenSlash = true;
  const r2 = Side.beginPlayPhase(freeze.state, freeze.noa);
  T("C2 冻结（只禁杀）仍狂暴", r2 === true && virtuals.length === 1, { r2 });

  const miss = scene(); resetTurn(miss, 3);
  miss.noa.skipPlayPhase = false; // 眩晕判定失败
  const r3 = Side.beginPlayPhase(miss.state, miss.noa);
  T("C3 眩晕判定失败仍狂暴", r3 === true && virtuals.length === 1, { r3 });
}

// ---------- D 眩晕 + 有存活男性 ----------
{
  const s = scene(["male", "female"]);
  resetTurn(s, 1);
  applySkip(s, "眩晕");
  const r = Side.beginPlayPhase(s.state, s.noa);
  T("D1 有男性时不狂暴（与有无眩晕无关）",
    r === false && virtuals.length === 0 && s.noa.skipPlayReason === "眩晕",
    { r, virtuals: virtuals.length });
  T("D2 动态上限仍为 5", Side.handLimit(s.noa) === 5, { got: Side.handLimit(s.noa) });
  endTurn(s);
  T("D3 结束阶段仍只打存活男性 6 点（跳过出牌阶段不影响结束阶段）",
    damage.length === 1 && damage[0].uid === "m0" && damage[0].amt === 6, { damage });
}

// ---------- E 观测：混乱(有同伴) ----------
{
  const s = scene(["female"]);
  resetTurn(s, 1);
  const r = Side.beginPlayPhase(s.state, s.noa);
  T("E1 混乱有同伴时不设 skipPlayPhase，狂暴照常触发（两锁定技叠加）",
    r === true && virtuals.length === 1 && s.noa.skipPlayReason === "改造副作用",
    { r, virtuals: virtuals.length });
  console.log("OBSERVE 混乱(有同伴) 的虚拟【杀】与狂暴的虚拟【咬杀】同为"
    + "「出牌阶段开始」时点的锁定技，二者叠加属设计，非 BUG。");
}

// ---------- F 其他边界 ----------
{
  const s = scene(); resetTurn(s, 1);
  const r1 = Side.beginPlayPhase(s.state, s.noa);
  const r2 = Side.beginPlayPhase(s.state, s.noa);
  T("F1 同回合重复调用幂等：只咬一次、不重复写战报",
    r1 === true && r2 === true && virtuals.length === 1
    && logs.filter(t => t.includes("改造副作用发作")).length === 1,
    { r1, r2, virtuals: virtuals.length });
}
{
  const s = scene(["male"]); resetTurn(s, 1);
  const r1 = Side.beginPlayPhase(s.state, s.noa);
  s.mates[0].hp = 0; // 同回合男性阵亡
  const r2 = Side.beginPlayPhase(s.state, s.noa);
  T("F2 同回合男性阵亡后仍补判狂暴（幂等不锁死首次调用）",
    r1 === false && r2 === true && virtuals.length === 1,
    { r1, r2, virtuals: virtuals.length });
}
{
  const s = scene(); resetTurn(s, 6);
  s.noa.skipPlayPhase = true; s.noa.skipPlayReason = "改造副作用";
  s.noa._noaFrenzyTurn = 5; // 跨回合残留标记
  const r = Side.beginPlayPhase(s.state, s.noa);
  T("F3 本技能标记跨回合残留时不重复咬（按没有出牌阶段处理）",
    r === false && virtuals.length === 0 && noFrenzyLog(),
    { r, virtuals: virtuals.length });
}
{
  const s = scene([], { noEnemies: true }); resetTurn(s, 1);
  const r = Side.beginPlayPhase(s.state, s.noa);
  T("F4 目标池为空时不跳过出牌阶段", r === false && !s.noa.skipPlayPhase,
    { r, skip: s.noa.skipPlayPhase });
}
{
  const s = scene(); resetTurn(s, 1); ctx.__noVirtual = true;
  const r = Side.beginPlayPhase(s.state, s.noa);
  T("F5 虚拟【咬杀】造不出来时不跳过出牌阶段",
    r === false && virtuals.length === 0 && !s.noa.skipPlayPhase,
    { r, skip: s.noa.skipPlayPhase });
  ctx.__noVirtual = false;
}
{
  const s = scene(); resetTurn(s, 1);
  const saved = ctx.BattleSystem.useVirtualKill;
  delete ctx.BattleSystem.useVirtualKill;
  const r = Side.beginPlayPhase(s.state, s.noa);
  ctx.BattleSystem.useVirtualKill = saved;
  T("F6 useVirtualKill 接口缺失时不跳过出牌阶段",
    r === false && !s.noa.skipPlayPhase, { r, skip: s.noa.skipPlayPhase });
}
{
  const s = scene(["male"]); resetTurn(s, 1);
  s.noa.tempAttack = -20;
  endTurn(s);
  T("F7 负 tempAttack 夹零（不会经伤害管线变成回血）",
    damage.length === 1 && damage[0].amt === 0, { damage });
}
{
  const s = scene(); resetTurn(s, 1);
  s.noa.skipPlayPhase = true; delete s.noa.skipPlayReason;
  const r = Side.beginPlayPhase(s.state, s.noa);
  T("F8 跳过原因缺失但已跳过出牌阶段时同样不狂暴",
    r === false && virtuals.length === 0, { r, virtuals: virtuals.length });
}
{
  const s = scene(); resetTurn(s, 1);
  applySkip(s, "时停");
  const r = Side.beginPlayPhase(s.state, s.noa);
  T("F9 任意其它跳过原因都不被本技能覆盖",
    r === false && s.noa.skipPlayReason === "时停" && virtuals.length === 0,
    { r, reason: s.noa.skipPlayReason });
}
{
  const s = scene(["male", "male", "female"]); resetTurn(s, 1);
  const before = Side.handLimit(s.noa);
  s.mates[1].hp = 0;
  const after = Side.handLimit(s.noa);
  endTurn(s);
  T("F10 上限随存活男性实时增减、死者不计",
    before === 6 && after === 5, { before, after });
  T("F11 结束阶段只打存活男性、不打自己/女性/敌方/死者",
    damage.length === 1 && damage[0].uid === "m0" && damage[0].amt === 6, { damage });
}
{
  // 全库是否存在改性别的效果：若存在，handLimit 不排除自己的口径就会变成真 BUG。
  const dir = path.join(__dirname, "..", "src", "original");
  const assign = fs.readdirSync(dir).filter(f => f.endsWith(".js"))
    .filter(f => /\.gender\s*=[^=]/.test(fs.readFileSync(path.join(dir, f), "utf8")));
  T("F12 全库无改性别赋值 -> handLimit 不排除自己的口径不可达",
    assign.length === 0, { assign });
}

// ---------- G 静态链路 ----------
{
  const turnStart = fs.readFileSync(SRC("battle-turn-start.js"), "utf8");
  const ij = turnStart.indexOf("resolveJudgement(unit, state)");
  const ib = turnStart.indexOf("NoaSideEffectSkills?.beginPlayPhase");
  T("G1 判定阶段严格早于狂暴判定（continueStartPhase 顺序）",
    ij > 0 && ib > ij, { ij, ib });
  const charm = fs.readFileSync(SRC("noa-charm-skills.js"), "utf8");
  T("G2 enterPlayPhase 拦截任何 skipPlayPhase（不补牌/不开 phase4）",
    /if \(unit\?\.skipPlayPhase\) return false;/.test(charm));
  const consumers = [
    "battle-turn-input.js", "battle-manual-continuation.js",
    "battle-share-flow.js", "battle-prepare-prompts.js",
  ];
  const missing = consumers.filter(f =>
    !fs.readFileSync(SRC(f), "utf8").includes("skipPlayReason"));
  T("G3 4 处跳过分支都显示真实 skipPlayReason（眩晕不再被改写成改造副作用）",
    missing.length === 0, { missing });
  const triggers = fs.readFileSync(SRC("battle-status-card-triggers.js"), "utf8");
  T("G4 眩晕/麻痹/混乱(无同伴) 三处都会设 skipPlayPhase",
    (triggers.match(/unit\.skipPlayPhase = true/g) || []).length >= 3,
    { count: (triggers.match(/unit\.skipPlayPhase = true/g) || []).length });
}

console.log(`RESULT ${pass}/${total}` + (REVERT ? ` REVERT=${REVERT}` : ""));
console.log("EXPECT_RED=" + (REVERT ? {
  block: "A 段 9 项, B1, F3, F8, F9（共 13）",
  frenzy: "C1, C2, C3, E1, F1, F2",
  clamp: "F7",
}[REVERT] || "none" : "none"));
if (!REVERT) process.exit(pass === total ? 0 : 1);
