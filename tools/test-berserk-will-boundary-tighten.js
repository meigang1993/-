// 【狂战意志】四条边界收口复查：
//  ① 自伤一次记 2 枚 —— 明确不改，钉住既有数值口径（涉及收益，需另行拍板）
//  ② 护甲全额吸收不攒标记 —— 收口：blockLoss 传入执行块并按「生命或护甲伤害」判定
//  ③ 执行块自身无出牌阶段守卫 —— 收口：加 phase / 本人行动兜底
//  ④ 敌人全灭仍被置灰 —— 收口：self 目标技能从「需存活敌方」分组摘出
// REVERT=block|phase|enemy 为源码级反向验证，撤掉对应改动后应精准打红。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "../src/original");
const REVERT = process.env.REVERT || "";
let pass = 0;
const reds = [];
function T(name, cond, extra) {
  if (cond) { pass += 1; return; }
  reds.push(name);
  if (REVERT) console.log(`  RED ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}
function read(file) { return fs.readFileSync(path.join(ROOT, file), "utf8"); }
function hit(before, after, tag) {
  assert.notStrictEqual(after, before, `REVERT=${REVERT} must hit ${tag}`);
  return after;
}
const GUARD = `    const b = state?.battle;
    if (b && ((b.phase != null && b.phase !== 4)
      || (b.activeUid != null && actor?.uid != null
        && b.activeUid !== actor.uid))) return true;`;
function src(file) {
  let s = read(file);
  if (REVERT === "block" && file === "angelica-luka-skills.js")
    return hit(s, s.replace("    if (!(hpLoss > 0 || (deps?.blockLoss || 0) > 0)) return;",
      "    if (!hpLoss) return;"), "blockLoss guard");
  if (REVERT === "block" && file === "battle-damage-triggers.js")
    return hit(s, s.replace("{ damage, draw: deps.draw, pushFloat: ctx.pushFloat, blockLoss }",
      "{ damage, draw: deps.draw, pushFloat: ctx.pushFloat }"), "blockLoss wiring");
  if (REVERT === "phase" && file === "angelica-luka-skills.js")
    return hit(s, s.replace(GUARD, ""), "execution-block phase guard");
  if (REVERT === "enemy" && file === "battle-card-playability.js")
    return hit(s, s.replace("card.speedAssault || card.withererPeek || card.crazySlaughter\n      || card.bestaEndSlash",
      "card.speedAssault || card.withererPeek || card.crazySlaughter\n      || card.berserkWill || card.bestaEndSlash"), "living-enemy group");
  return s;
}

// ── A 静态接线 ─────────────────────────────────────────────────────────────
const sk = src("angelica-luka-skills.js");
const tr = src("battle-damage-triggers.js");
const pl = src("battle-card-playability.js");
T("A1 执行块按 hpLoss 或 blockLoss 判定", /\(deps\?\.blockLoss \|\| 0\) > 0/.test(sk));
T("A2 伤害触发链把 blockLoss 传给狂战执行块",
  /pushFloat: ctx\.pushFloat, blockLoss \}/.test(tr));
T("A3 主动执行块自带出牌阶段 / 本人行动兜底守卫", sk.includes(GUARD));
T("A4 狂战意志不再列入「需存活敌方」分组",
  !/card\.berserkWill \|\| card\.bestaEndSlash/.test(pl));
T("A5 其余四项仍保留「需存活敌方」判据",
  /card\.speedAssault \|\| card\.withererPeek \|\| card\.crazySlaughter/.test(pl)
  && /card\.bestaEndSlash\) && !livingEnemy\(\)/.test(pl));
T("A6 守卫失败返回 true 而非 false（避免 resolveCard 走普通牌兜底）",
  /b\.activeUid !== actor\.uid\)\)\) return true;/.test(sk));
T("A7 一次性与旧档字段口径未被本轮改动",
  /usedBerserkWill/.test(sk) && /usedCrimsonRampage/.test(sk));

// ── 真实模块装配（vm） ─────────────────────────────────────────────────────
const logs = [];
const win = {
  state: { battle: null },
  BattleLog: { add: (_s, text) => logs.push(text) },
  BattleLines: { skill: () => {} },
  BattleHpValue: {
    healPctStacks: (unit, pct, n) => Math.max(1, Math.round((unit?.maxHp ?? unit?.stats?.maxHp ?? 0) * Math.max(0, pct) / 100)) * Math.max(0, Math.round(n)),
    healCap: (u, n) => Math.max(0, Math.min(n, (u.maxHp || 0) - (u.hp || 0))),
    applyHeal: (u, n) => { u.hp += n; },
  },
  BattleDrawFeedback: { action: (_u, _w, drawn) => `摸${drawn}张牌` },
  AngelicaBerserkerSkinFX: {
    rageGain() {}, rageSpend() {}, berserkWill() {}, might() {}, queueEntry() {},
  },
  CardUtils: { isKillCard: c => c?.type === "slash" },
  MieryulaTimeStop: { isSkillDisabled: () => false },
  MieryulaSkills: { blocksTactic: () => false },
  GameData: { enemies: {} },
  console,
};
function load(file) {
  const ctx = { window: win, GameData: win.GameData, Math, Number, Array, Object,
    Set, Map, JSON, String, RegExp, console };
  vm.runInNewContext(src(file), ctx, { filename: file });
}
["data-characters-extra.js", "angelica-luka-skills.js", "skill-once-per-turn.js",
  "character-skill-access.js", "battle-playability-registries.js",
  "battle-card-playability.js", "battle-damage-triggers.js"].forEach(load);

const A = win.AngelicaLukaSkills;
const template = win.GameDataCharactersExtra.find(u => u.id === "angelica");
const willCard = Object.assign({ _skill: true },
  template.skills.find(s => s.name === "狂战意志").card);
const slash = { name: "杀（普攻）", type: "slash" };
const baseDeps = { draw: () => 0, pushFloat() {} };
function unit(extra = {}) {
  return Object.assign({
    uid: "a0", name: "安洁莉卡", ref: "angelica", side: "ally",
    hp: 20, maxHp: 40, rageMarks: 0, intent: 1, hand: [],
    skills: template.skills,
  }, extra);
}
function st(b) { win.state = { battle: b, log: logs }; return win.state; }
function mkState(a, extra = {}) {
  const b = Object.assign({
    allies: [a], enemies: [{ uid: "e0", name: "敌", side: "enemy", hp: 10, hand: [] }],
    activeUid: a.uid, phase: 4, turn: 1, played: [], shownPlayed: [],
  }, extra);
  return { b, s: st(b) };
}

// ── B 边界②：护甲全额吸收也攒标记 ──────────────────────────────────────────
{
  const a = unit(), t = unit({ uid: "e0", ref: "guard", side: "enemy" });
  A.afterDamage(st({ turn: 1 }), a, t, slash, 0, { ...baseDeps, blockLoss: 5 });
  T("B1 hpLoss=0 / blockLoss=5：造成伤害方仍得 1 枚", a.rageMarks === 1, a.rageMarks);
}
{
  const a = unit();
  A.afterDamage(st({ turn: 1 }), a, unit({ uid: "e0", ref: "guard" }), slash, 0, baseDeps);
  T("B2 hpLoss=0 / 无 blockLoss：真无伤仍 0 枚", a.rageMarks === 0, a.rageMarks);
}
{
  const a = unit();
  A.afterDamage(st({ turn: 1 }), a, unit({ uid: "e0", ref: "guard" }), slash, 3, baseDeps);
  T("B3 hpLoss>0：原行为不变，仍得 1 枚", a.rageMarks === 1, a.rageMarks);
}
{
  const a = unit();
  A.afterDamage(st({ turn: 1 }), unit({ uid: "e0", ref: "guard" }), a, slash, 0,
    { ...baseDeps, blockLoss: 3 });
  T("B4 受击方是安洁莉卡且护甲全额吸收：同样得 1 枚", a.rageMarks === 1, a.rageMarks);
}
{
  const a = unit({ rageMarks: 10 });
  A.afterDamage(st({ turn: 1 }), a, unit({ uid: "e0", ref: "guard" }), slash, 0,
    { ...baseDeps, blockLoss: 9 });
  T("B5 上限 10 不被护甲伤害突破", a.rageMarks === 10, a.rageMarks);
}
const triggers = win.BattleDamageTriggers({
  deps: { isKillCard: c => c?.type === "slash", draw: () => 0 },
  ctx: { hasSkill: () => false, pushFloat() {}, statOf: () => 0, queueSlashPlay() {} },
  damage: {},
  directDamage: () => ({ dodged: false, hpLoss: 0, blockLoss: 0 }),
});
{
  const a = unit(), t = unit({ uid: "e0", ref: "guard", side: "enemy" });
  const { s } = mkState(a);
  triggers.afterDamage(s, a, t, slash, 0, 5, a);
  T("B6 端到端：真实伤害触发链把 blockLoss 送达执行块", a.rageMarks === 1, a.rageMarks);
}
{
  const a = unit(), t = unit({ uid: "e0", ref: "guard", side: "enemy" });
  const { s } = mkState(a);
  triggers.afterDamage(s, a, t, slash, 0, 0, a);
  T("B7 端到端：护甲与生命都无损时仍不发标记", a.rageMarks === 0, a.rageMarks);
}

// ── C 边界③：执行块兜底守卫 ────────────────────────────────────────────────
function fire(extra, omit = []) {
  const a = unit({ rageMarks: 3 });
  const { b, s } = mkState(a, extra);
  omit.forEach(k => delete b[k]);
  const draws = [];
  const ret = A.handleSpecialCard(s, a, a, { ...willCard },
    { draw: (_u, n) => { draws.push(n); return n; }, pushFloat() {} },
    { pushFloat() {} });
  return { a, s, draws, ret };
}
{
  const r = fire({});
  T("C1 phase4 / 本人行动：正常结算（弃标记 / 摸牌 / 置一次性）",
    r.ret === true && r.a.rageMarks === 0 && r.draws.length === 1
    && r.a.usedBerserkWill === true,
    { ret: r.ret, marks: r.a.rageMarks, draws: r.draws });
}
{
  const r = fire({ phase: 1 });
  T("C2 准备阶段直接调执行块也不结算，且返回 true",
    r.ret === true && r.a.rageMarks === 3 && r.draws.length === 0
    && !r.a.usedBerserkWill,
    { ret: r.ret, marks: r.a.rageMarks, draws: r.draws });
}
{
  const r = fire({ phase: 6 });
  T("C3 结束阶段直接调执行块也不结算",
    r.a.rageMarks === 3 && r.draws.length === 0 && !r.a.usedBerserkWill,
    { marks: r.a.rageMarks, draws: r.draws });
}
{
  const r = fire({ activeUid: "other" });
  T("C4 非本人行动直接调执行块也不结算",
    r.a.rageMarks === 3 && r.draws.length === 0 && !r.a.usedBerserkWill,
    { marks: r.a.rageMarks, draws: r.draws });
}
{
  const r = fire({}, ["phase", "activeUid"]);
  T("C5 字段缺失的模块级夹具按放行处理（既有单测口径不变）",
    r.ret === true && r.a.rageMarks === 0 && r.draws.length === 1,
    { ret: r.ret, marks: r.a.rageMarks, draws: r.draws });
}
T("C6 正常链路仍由 useCard 先过 canResolve（守卫是第二道，不是替代）",
  /CharacterSkillAccess\?\.canResolve/.test(read("battle-combat.js")));

// ── D 边界④：self 目标不再因敌人全灭置灰 ──────────────────────────────────
// 注意：登记表要求「有狂战标记 + 本回合未发动」才可点，夹具必须给足标记；
// 测「其它项仍在分组」时还要给角色补上对应技能授权，否则 canActor 先一步
// 返回 false，断言就验不到 livingEnemy 判据。
const play = win.BattleCardPlayability({ isKillCard: win.CardUtils.isKillCard });
function dUnit(extra = {}, extraSkills = []) {
  const a = unit(Object.assign({ rageMarks: 3 }, extra));
  a.skills = a.skills.concat(extraSkills);
  return a;
}
function canPlay(a, enemies, flags = {}) {
  const { b } = mkState(a, { enemies });
  return play.canPlay(a, Object.assign({ _skill: true }, flags), b);
}
{
  const a = dUnit();
  T("D1 敌人全灭时狂战意志仍可点（不再被误置灰）",
    canPlay(a, [], { berserkWill: true }) === true,
    { marks: a.rageMarks });
}
{
  const a = dUnit();
  T("D2 有存活敌人时仍可点",
    canPlay(a, [{ uid: "e0", side: "enemy", hp: 10, hand: [] }], { berserkWill: true }) === true);
}
{
  const a = dUnit({}, [{ name: "神速之袭", type: "active", card: { speedAssault: true } }]);
  T("D3 神速之袭仍因敌人全灭被置灰（没误删其它项）",
    canPlay(a, [], { speedAssault: true }) === false);
}
{
  const a = dUnit({}, [{ name: "疯狂屠戮", type: "active", card: { crazySlaughter: true } },
    { name: "终焉鬼影斩", type: "active", card: { bestaEndSlash: true } }]);
  T("D4 疯狂屠戮 / 终焉鬼影斩仍因敌人全灭被置灰",
    canPlay(a, [], { crazySlaughter: true }) === false
    && canPlay(a, [], { bestaEndSlash: true }) === false);
}
{
  const a = dUnit({ usedBerserkWill: true });
  T("D5 本回合已发动仍置灰（登记表未被破坏）",
    canPlay(a, [], { berserkWill: true }) === false);
}
{
  const a = dUnit({ rageMarks: 0 });
  T("D6 无狂战标记仍置灰（原有可用性判据不变）",
    canPlay(a, [], { berserkWill: true }) === false);
}

// ── E 边界①：明确不收口，钉住既有口径 ─────────────────────────────────────
{
  const a = unit();
  A.afterDamage(st({ turn: 1 }), a, a, slash, 3, baseDeps);
  T("E1 自伤仍是 2 枚（造成伤害 +1 / 受到伤害 +1），本轮明确不改",
    a.rageMarks === 2, a.rageMarks);
}
T("E2 两次 gainRage 调用保持原样，未做去重",
  /gainRage\(state, actor, "狂战造成伤害", target\);\n      gainRage\(state, target, "狂战受到伤害", actor\);/.test(sk));

const total = pass + reds.length;
console.log(`RESULT ${pass}/${total}` + (REVERT ? ` REVERT=${REVERT} REDS=${reds.length}` : ""));
if (reds.length && !REVERT) { reds.forEach(r => console.log("  RED", r)); process.exit(1); }
