// 怪面诺亚：全女性队伍是否「跟单人一样一直狂暴」严格检查
//   A 全女性队伍连续 4 个诺亚回合：每回合都狂暴、每回合恰好 1 次咬杀、上限恒为 4
//   B 目标池「不分敌我」：含女性队友与敌人、不含自己；强制目标可落在队友身上
//   C 单人对照：目标池只剩敌人
//   D 加 1 名存活男性：不狂暴、上限 5
//   E 眩晕/麻痹/混乱 等已跳过出牌阶段时不再狂暴（耦合已堵）
//   F 反向：REVERT=frenzy|pool|stun 时对应断言必须变红
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = f => path.join(__dirname, "..", "src", "original", f);
const REVERT = process.env.REVERT || "";
let raw = fs.readFileSync(SRC("noa-side-effect-skills.js"), "utf8");
// 反向：把友方从目标池里剔除，模拟「只打敌人」的错误实现。
if (REVERT === "pool") raw = raw.replace(
  "const pool = (b.allies || []).concat(b.enemies || [])",
  "const pool = (b.enemies || [])");
// 反向：撤掉「其他原因跳过出牌阶段不狂暴」的堵点，复现旧耦合。
if (REVERT === "stun") raw = raw.replace(
  "    if (unit.skipPlayPhase) return false;\n    if (malesOf(b).length) return false;",
  "    if (malesOf(b).length) return false;");

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

const logs = [], virtuals = [], pools = [], damage = [];
const SKILLS = [{ name: "魅力改造" }, { name: "改造副作用" }];
const mk = (ref, gender, side = "ally", extra = {}) => ({
  uid: ref, ref, name: ref, gender, side, hp: 500, maxHp: 500,
  stats: { attack: 6, magic: 4, speed: 8, maxHp: 500, handLimit: 4 },
  hand: [], skills: [], ...extra,
});
ctx.CardUtils = {
  isKillCard: c => c?.type === "slash" || /杀$/.test(c?.name || ""),
  fromEntity: (name, extra) => ({ name, type: "slash", suit: "♠", ...extra }),
};
ctx.BattleLog = { add: (s, t) => logs.push(t) };
ctx.BattleLines = { skill: () => {} };
ctx.GameData = { characters: [{ id: "noa", stats: { handLimit: 4 } }] };
ctx.__force = null;
ctx.GameRandom = {
  sample: (list) => {
    pools.push(list.map(u => ({ uid: u.uid, ref: u.ref, side: u.side, gender: u.gender })));
    return ctx.__force || list[0];
  },
};
ctx.BattleSystem = {
  useVirtualKill: (s, a, t, c) => virtuals.push({
    actor: a?.uid, target: t?.uid, side: t?.side, card: c?.name,
  }),
};
vm.runInContext(raw, ctx, { filename: "noa-side-effect-skills.js" });
const Side = ctx.NoaSideEffectSkills;
if (REVERT === "frenzy") Side.beginPlayPhase = () => false;

function scene(team) {
  const noa = mk("noa", "female", "ally", { skills: SKILLS });
  const mates = team.map((g, i) => mk("m" + i, g));
  const enemies = [mk("e0", "male", "enemy"), mk("e1", "female", "enemy")];
  const battle = {
    allies: [noa, ...mates], enemies, phase: 3, turn: 1,
    activeUid: "noa", locked: false, log: [],
  };
  const state = { battle, settings: {}, battleLog: logs, log: [] };
  ctx.state = state;
  return { state, battle, noa, mates, enemies };
}
// 对应 battle-turn-start.js:47 —— 新回合 !repeated 时重置 skipPlayPhase，
// 随后 :61 调 beginPlayPhase。按真实回合链逐回合模拟，不是一次调用反复用。
const resetTurn = (s, noa, turn) => {
  noa.skipPlayPhase = false;
  noa.skipPlayReason = null;
  s.battle.turn = turn;
  s.battle.phase = 3;
  logs.length = 0; virtuals.length = 0; pools.length = 0; damage.length = 0;
};

// ---------- A 全女性队伍连续 4 回合 ----------
{
  const s = scene(["female", "female", "female"]);
  T("A0 队伍 4 人全为女性、无存活男性",
    s.battle.allies.length === 4 && s.battle.allies.every(u => u.gender === "female"));
  for (let turn = 1; turn <= 4; turn++) {
    resetTurn(s, s.noa, turn);
    const r = Side.beginPlayPhase(s.state, s.noa);
    T(`A${turn} 第${turn}回合仍狂暴（一直狂暴）`, r === true
      && s.noa.skipPlayPhase === true && virtuals.length === 1
      && s.noa._noaFrenzyTurn === turn,
      { r, skip: s.noa.skipPlayPhase, virtuals: virtuals.length, mark: s.noa._noaFrenzyTurn });
    T(`A${turn}b 每回合恰好一次咬杀、跳过原因恒为「改造副作用」`,
      virtuals.length === 1 && virtuals[0].card === "咬杀"
      && s.noa.skipPlayReason === "改造副作用",
      { virtuals, reason: s.noa.skipPlayReason });
  }
  T("A5 全女性队伍手牌上限恒为基础 4（与单人一致）",
    Side.handLimit(s.noa) === 4, { got: Side.handLimit(s.noa) });
  Side.endTurn(s.state, s.noa, { damage: (st, t, amt) => damage.push({ uid: t.uid, amt }) });
  T("A6 结束阶段无存活男性可打（不造成伤害、不播台词）",
    damage.length === 0 && !logs.some(t => t.includes("各造成")), { damage, logs });
}

// ---------- B 目标池「不分敌我」 ----------
{
  const s = scene(["female", "female"]);
  resetTurn(s, s.noa, 1);
  ctx.__force = null;
  Side.beginPlayPhase(s.state, s.noa);
  const pool = pools[0] || [];
  T("B1 狂暴目标池同时含女性队友与敌人、且不含诺亚自己",
    pool.some(u => u.side === "ally" && u.gender === "female")
    && pool.some(u => u.side === "enemy")
    && !pool.some(u => u.ref === "noa"), { pool });
  T("B2 咬杀可落在女性队友身上（不分敌我）", (() => {
    resetTurn(s, s.noa, 2);
    ctx.__force = s.mates[0];
    Side.beginPlayPhase(s.state, s.noa);
    ctx.__force = null;
    return virtuals.length === 1 && virtuals[0].target === "m0"
      && virtuals[0].side === "ally";
  })(), { virtuals });
  T("B3 咬杀也可落在敌方身上", (() => {
    resetTurn(s, s.noa, 3);
    ctx.__force = s.enemies[0];
    Side.beginPlayPhase(s.state, s.noa);
    ctx.__force = null;
    return virtuals.length === 1 && virtuals[0].target === "e0"
      && virtuals[0].side === "enemy";
  })(), { virtuals });
}

// ---------- C 单人对照 ----------
{
  const s = scene([]);
  resetTurn(s, s.noa, 1);
  Side.beginPlayPhase(s.state, s.noa);
  const pool = pools[0] || [];
  T("C1 单人战斗目标池只剩敌人（无友方目标）",
    pool.length === 2 && pool.every(u => u.side === "enemy")
    && !pool.some(u => u.ref === "noa"), { pool });
  T("C2 单人同样触发狂暴并跳过出牌阶段",
    s.noa.skipPlayPhase === true && virtuals.length === 1,
    { skip: s.noa.skipPlayPhase, virtuals: virtuals.length });
}

// ---------- D 加 1 名存活男性 ----------
{
  const s = scene(["male", "female"]);
  resetTurn(s, s.noa, 1);
  const r = Side.beginPlayPhase(s.state, s.noa);
  T("D1 有存活男性 -> 不狂暴、正常进入出牌阶段",
    r === false && !s.noa.skipPlayPhase && virtuals.length === 0,
    { r, skip: s.noa.skipPlayPhase, virtuals: virtuals.length });
  T("D2 上限升至 5", Side.handLimit(s.noa) === 5, { got: Side.handLimit(s.noa) });
  Side.endTurn(s.state, s.noa, { damage: (st, t, amt) => damage.push({ uid: t.uid, amt }) });
  T("D3 结束阶段只打该名存活男性 6 点",
    damage.length === 1 && damage[0].uid === "m0" && damage[0].amt === 6, { damage });
}

// ---------- E 眩晕耦合已堵：其他原因跳过出牌阶段时不再狂暴 ----------
{
  const s = scene(["female", "female"]);
  s.noa.skipPlayPhase = true;
  s.noa.skipPlayReason = "眩晕";
  s.noa._noaFrenzyTurn = 8;
  s.battle.turn = 9;
  s.battle.phase = 3;
  logs.length = 0; virtuals.length = 0;
  const r = Side.beginPlayPhase(s.state, s.noa);
  T("E1 眩晕回合不再打咬杀、跳过原因保持「眩晕」",
    r === false && virtuals.length === 0
    && s.noa.skipPlayPhase === true && s.noa.skipPlayReason === "眩晕",
    { r, virtuals: virtuals.length, reason: s.noa.skipPlayReason });
  T("E2 眩晕回合不写狂暴战报",
    !logs.some(t => t.includes("改造副作用发作")), { logs });
}

console.log(`RESULT ${pass}/${total}` + (REVERT ? ` REVERT=${REVERT}` : ""));
if (!REVERT) process.exit(pass === total ? 0 : 1);
