// 【狂战意志】合并复查：主动效果是否真的「出牌阶段限一次」+ 原锁定技是否仍生效。
// 真实模块装配（vm），覆盖 UI 状态模型 / 技能入口 / 一次性登记表 / 回合重置 /
// 被动逐段结算 / 抵杀意 / 力量爆发 / 头像标记，外加静态挂载点核对。
// REVERT=phase|once|reset|passive|intent 为源码级反向验证，撤掉对应改动后应精准打红。
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
function src(file) {
  let s = read(file);
  if (REVERT === "phase" && file === "character-skill-access.js") {
    return hit(s, s.replace("if (!def.prepare) return battle?.phase === 4;",
      "if (!def.prepare) return true;"), "phase guard");
  }
  if (REVERT === "once" && file === "angelica-luka-skills.js") {
    return hit(s, s.replace("if (!canUseBerserkWill(actor)) return true;",
      "if (!(actor.rageMarks || 0)) return true;"), "once guard");
  }
  if (REVERT === "reset" && file === "battle-turn-state.js") {
    return hit(s, s.replace("unit.usedBerserkWill = false; unit.usedCrimsonRampage = false; ",
      ""), "begin-turn reset");
  }
  if (REVERT === "passive" && file === "angelica-luka-skills.js") {
    return hit(s, s.replace("      gainRage(state, actor, \"狂战造成伤害\", target);\n      gainRage(state, target, \"狂战受到伤害\", actor);",
      "      void 0;"), "passive rage gain");
  }
  if (REVERT === "intent" && file === "angelica-luka-skills.js") {
    return hit(s, s.replace("    if (!canPayIntentWithRage(actor, card)) return false;",
      "    if (true) return false;"), "intent replacement");
  }
  return s;
}

// ── 真实模块装配 ───────────────────────────────────────────────────────────
const logs = [];
const win = {
  state: { battle: null },
  BattleLog: { add: (_s, text) => logs.push(text) },
  BattleLines: { skill: () => {} },
  BattleHpValue: {
    healCap: (u, n) => Math.max(0, Math.min(n, (u.maxHp || 0) - (u.hp || 0))),
    applyHeal: (u, n) => { u.hp += n; },
  },
  BattleDrawFeedback: { action: (_u, _want, drawn) => `摸${drawn}张牌` },
  AngelicaBerserkerSkinFX: { rageGain() {}, rageSpend() {}, berserkWill() {}, might() {} },
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
["skill-once-per-turn.js", "angelica-luka-skills.js", "character-skill-access.js",
  "battle-playability-registries.js", "battle-card-playability.js",
  "battle-turn-state.js", "ui-common-skill-model.js", "ui-info-marks.js",
  "data-characters-extra.js"].forEach(load);

const play = win.BattleCardPlayability({ isKillCard: win.CardUtils.isKillCard });
win.BattleSystem = { canPlay: (actor, card, battle) => play.canPlay(actor, card, battle),
  active: battle => battle?.allies?.find(u => u.uid === battle.activeUid) };
const skillModel = win.UICommonSkillModel();
const infoMarks = win.GameUIInfoMarks();
const template = win.GameDataCharactersExtra.find(u => u.id === "angelica");
const will = template.skills.find(s => s.name === "狂战意志");
const card = () => Object.assign({ _skill: true }, will.card);

function actor(extra = {}) {
  return Object.assign({
    uid: "a0", name: "安洁莉卡", ref: "angelica", side: "ally", hp: 20, maxHp: 40,
    rageMarks: 3, intent: 1, hand: [{ name: "杀（普攻）", type: "slash" }],
    skills: template.skills,
  }, extra);
}
function battle(a, extra = {}) {
  return Object.assign({
    allies: [a], enemies: [{ uid: "e0", side: "enemy", hp: 10, hand: [] }],
    activeUid: a.uid, phase: 4, turn: 1, played: [], shownPlayed: [],
  }, extra);
}
function state(b) { win.state = { battle: b, log: logs }; return win.state; }
const canResolve = (s, a, c, target) =>
  win.CharacterSkillAccess.canResolve(s, a, target || a, c, (u, k, b) => play.canPlay(u, k, b));
const skillState = (b, a) => skillModel.skillState(a, will, b);
function resetTurn(a, b) { win.BattleTurnState.resetBeginTurn(a, b, 3); }

// ── A 出牌阶段限制 ─────────────────────────────────────────────────────────
{
  const a = actor(), b = battle(a), s = state(b), c = card();
  T("A1 出牌阶段（phase4 / 本人行动 / 有标记 / 未发动）可发动",
    canResolve(s, a, c) === true && skillState(b, a).usable === true,
    { resolve: canResolve(s, a, c), ui: skillState(b, a) });
}
{
  const a = actor(), b = battle(a, { phase: 1 }), s = state(b), c = card();
  T("A2 准备阶段（phase1）技能入口拒绝",
    canResolve(s, a, c) === false && skillState(b, a).usable === false
    && /只能在出牌阶段发动/.test(skillState(b, a).reason),
    { resolve: canResolve(s, a, c), ui: skillState(b, a) });
}
{
  const a = actor(), b = battle(a, { phase: 6 }), s = state(b), c = card();
  T("A3 结束阶段（phase6）技能入口拒绝",
    canResolve(s, a, c) === false && skillState(b, a).usable === false,
    { resolve: canResolve(s, a, c), ui: skillState(b, a) });
}
{
  const other = { uid: "a1", side: "ally", hp: 10 };
  const a = actor(), b = battle(a, { activeUid: "a1", allies: [a, other] });
  const s = state(b), c = card();
  T("A4 不是当前行动角色时拒绝",
    canResolve(s, a, c) === false && skillState(b, a).usable === false,
    { resolve: canResolve(s, a, c), ui: skillState(b, a) });
}
{
  const a = actor(), b = battle(a, { locked: true }), s = state(b), c = card();
  // canResolve 不判 locked（分层设计）：UI 置灰 + 点击绑定 + resolveCard 结算层三重兜底。
  const bind = read("battle-action-hand-bindings.js");
  T("A5 战斗结算锁定（locked）：UI 置灰 + 点击拦截 + 结算层兜底",
    skillState(b, a).usable === false
    && /state\.battle\?\.locked \|\| BattleEffects\.animating/.test(bind)
    && /if \(state\.battle\?\.locked\) return;/.test(read("battle-combat.js")),
    { ui: skillState(b, a), resolve: canResolve(s, a, c) });
}
{
  const a = actor(), b = battle(a), s = state(b), c = card();
  T("A6 target=self：指向他人时拒绝",
    canResolve(s, a, c, b.enemies[0]) === false);
}
{
  const view = read("ui-common-skill-view.js");
  T("A7 置灰按钮不输出 data-skill-index（点击绑定不会挂上）",
    /clickable && skill\?\.type === "active" && !disabled/.test(view)
    && /\$\{disabled \? "disabled" : ""\}/.test(view));
  const combat = read("battle-combat.js");
  T("A8 出牌统一入口 useCard 先过 CharacterSkillAccess.canResolve",
    /CharacterSkillAccess\?\.canResolve/.test(combat)
    && /canResolve\(\s*state, actor, target, card, canPlay\s*\)/.test(combat));
}

// ── B 限一次 + 每回合重置 ──────────────────────────────────────────────────
{
  const a = actor(), b = battle(a), s = state(b), c = card();
  const draws = [];
  const deps = { draw: (_u, n) => { draws.push(n); return n; }, pushFloat() {} };
  const fire = () => win.AngelicaLukaSkills.handleSpecialCard(s, a, a, c, deps, { pushFloat() {} });
  T("B1 首次发动：弃3枚标记 / 摸3张 / 回血 3×40×10%=12 / 置 used",
    fire() === true && a.rageMarks === 0 && draws.length === 1 && draws[0] === 3
    && a.hp === 32 && a.usedBerserkWill === true,
    { marks: a.rageMarks, draws, hp: a.hp, used: a.usedBerserkWill });
  const hp = a.hp;
  a.rageMarks = 3;
  T("B2 同回合二次：登记表置灰 + 入口拒绝 + 直接执行块也不结算",
    win.SkillOncePerTurn.blocked(a, c, b) === true
    && canResolve(s, a, c) === false
    && play.canPlay(a, c, b) === false
    && skillState(b, a).usable === false
    && fire() === true && a.rageMarks === 3 && a.hp === hp && draws.length === 1,
    { marks: a.rageMarks, hp: a.hp, draws });
}
{
  const a = actor({ usedCrimsonRampage: true }), b = battle(a);
  T("B3 旧档 usedCrimsonRampage 本回合仍受限",
    !win.AngelicaLukaSkills.canUseBerserkWill(a)
    && win.SkillOncePerTurn.blocked(a, card(), b) === true);
  resetTurn(a, b);
  T("B4 回合开始重置同时清理旧档字段",
    a.usedBerserkWill === false && a.usedCrimsonRampage === false);
  T("B5 下一回合攒到标记后可再次发动",
    win.AngelicaLukaSkills.canUseBerserkWill(a) === true
    && win.SkillOncePerTurn.blocked(a, card(), b) === false
    && canResolve(state(b), a, card()) === true);
  const draws = [];
  win.AngelicaLukaSkills.handleSpecialCard(state(b), a, a, card(),
    { draw: (_u, n) => { draws.push(n); return n; } }, { pushFloat() {} });
  T("B6 下一回合第二次发动确实结算（不是永久只用一次）",
    draws.length === 1 && draws[0] === 3 && a.rageMarks === 0,
    { draws, marks: a.rageMarks });
}
{
  const t = read("battle-turn-state.js");
  T("B7 重置挂在回合开始统一入口（非主动技内部自行清标记）",
    /unit\.usedBerserkWill\s*=\s*false/.test(t)
    && !/usedBerserkWill\s*=\s*false/.test(read("angelica-luka-skills.js")));
}

// ── C 原锁定技仍生效 ───────────────────────────────────────────────────────
function damageHits(a, target, times, hpLoss = 3) {
  const s = state(battle(a));
  const deps = { draw() {}, damage: { scheduleAfterDamage: fn => fn() } };
  for (let i = 0; i < times; i += 1)
    win.AngelicaLukaSkills.afterDamage(s, a, target,
      { name: "杀（普攻）", type: "slash" }, hpLoss, deps);
}
{
  const a = actor({ rageMarks: 0 });
  damageHits(a, { uid: "e0", side: "enemy", hp: 10 }, 1);
  T("C1 造成伤害后获得 1 枚狂战标记", a.rageMarks === 1, { marks: a.rageMarks });
}
{
  const a = actor({ rageMarks: 0 });
  const s = state(battle(a));
  win.AngelicaLukaSkills.afterDamage(s, { uid: "e0", side: "enemy", hp: 10, ref: "orc" }, a,
    { name: "杀（普攻）", type: "slash" }, 3,
    { draw() {}, damage: { scheduleAfterDamage: fn => fn() } });
  T("C2 受到伤害后获得 1 枚狂战标记", a.rageMarks === 1, { marks: a.rageMarks });
}
{
  const a = actor({ rageMarks: 0 });
  damageHits(a, { uid: "e0", side: "enemy", hp: 10 }, 4);
  T("C3 多段/连击逐段结算（4 段 = 4 枚）", a.rageMarks === 4, { marks: a.rageMarks });
}
{
  const a = actor({ rageMarks: 9 });
  damageHits(a, { uid: "e0", side: "enemy", hp: 10 }, 5);
  T("C4 上限 10 枚且达上限不再增长", a.rageMarks === 10, { marks: a.rageMarks });
}
{
  const other = { uid: "a1", ref: "luka", side: "ally", hp: 10, rageMarks: 0 };
  const s = state(battle(other));
  win.AngelicaLukaSkills.afterDamage(s, other, { uid: "e0", side: "enemy", hp: 10 },
    { name: "杀", type: "slash" }, 2,
    { draw() {}, damage: { scheduleAfterDamage: fn => fn() } });
  T("C5 非安洁莉卡单位不会获得狂战标记", (other.rageMarks || 0) === 0);
}
{
  const a = actor({ rageMarks: 2, intent: 1 }), s = state(battle(a));
  const real = { name: "杀（普攻）", type: "slash" };
  T("C6 实体【杀】可弃 1 枚标记代替杀意",
    win.AngelicaLukaSkills.beforeIntentCost(s, a, real) === true
    && a.rageMarks === 1 && a.intent === 1,
    { marks: a.rageMarks, intent: a.intent });
  const virtual = { name: "杀（普攻）", type: "slash", virtual: true };
  T("C7 虚拟【杀】不吃狂战标记",
    !win.AngelicaLukaSkills.canPayIntentWithRage(a, virtual)
    && win.AngelicaLukaSkills.beforeIntentCost(s, a, virtual) === false
    && a.rageMarks === 1);
  const free = { name: "杀（普攻）", type: "slash", noIntentCost: true };
  const flow = read("battle-combat-attack-flow.js");
  T("C8 免费杀先判免杀意、不白白吃掉标记",
    /const noIntent = hasNoIntentCost\(actor, card\)/.test(flow)
    && /const ragePaid = noIntent \? false/.test(flow));
}
{
  const a = actor({ rageMarks: 0 }), s = state(battle(a));
  win.AngelicaLukaSkills.afterCardPlayed(s, a, { name: "杀（普攻）", type: "slash" });
  T("C9 力量爆发：实体杀累积 +50% 并作用于真实伤害链",
    a.angelicaSlashCount === 1 && a.angelicaMightBonus === 0.5
    && win.AngelicaLukaSkills.modifyOutgoingDamage(s, a, 10) === 15);
  win.AngelicaLukaSkills.endTurn(s, a);
  T("C10 力量爆发回合结束清空",
    !a.angelicaMightBonus && !a.angelicaSlashCount
    && win.AngelicaLukaSkills.modifyOutgoingDamage(s, a, 10) === 10);
}
{
  const a = actor({ rageMarks: 7 });
  T("C11 头像面板显示「狂战×N」", /狂战×7/.test(infoMarks.rageMark(a)));
}
{
  const a = actor(), b = battle(a), s = state(b), c = card();
  win.AngelicaLukaSkills.handleSpecialCard(s, a, a, c,
    { draw: (_u, n) => n }, { pushFloat() {} });
  win.AngelicaLukaSkills.afterDamage(s, { uid: "e0", side: "enemy", hp: 10, ref: "orc" }, a,
    { name: "杀", type: "slash" }, 3,
    { draw() {}, damage: { scheduleAfterDamage: fn => fn() } });
  T("C12 主动发动不破坏被动：弃光后受伤仍重新攒标记", a.rageMarks === 1,
    { marks: a.rageMarks });
}
{
  const trig = read("battle-damage-triggers.js"), flow = read("battle-combat-attack-flow.js"),
    playSrc = read("battle-card-playability.js");
  T("C13 被动三处仍挂在全局真实链路（逐段伤害 / 抵扣 / 可打出性）",
    /AngelicaLukaSkills\?\.afterDamage\?\./.test(trig)
    && /AngelicaLukaSkills\?\.beforeIntentCost\?\./.test(flow)
    && /AngelicaLukaSkills\?\.canPayIntentWithRage\?\./.test(playSrc)
    && /狂战（安洁莉卡）逐段结算/.test(trig));
}

// ── D 边界探针（如实记录，不作为合并回归判据） ──────────────────────────────
{
  const a = actor({ rageMarks: 0 });
  const s = state(battle(a));
  win.AngelicaLukaSkills.afterDamage(s, a, a, { name: "杀", type: "slash" }, 3,
    { draw() {}, damage: { scheduleAfterDamage: fn => fn() } });
  console.log(`  NOTE 自伤(actor===target===安洁莉卡)单次伤害获得 ${a.rageMarks} 枚标记`);
  const b = actor({ rageMarks: 0 }), s2 = state(battle(b));
  win.AngelicaLukaSkills.afterDamage(s2, b, { uid: "e0", side: "enemy", hp: 10 },
    { name: "杀", type: "slash" }, 0,
    { draw() {}, damage: { scheduleAfterDamage: fn => fn() } });
  console.log(`  NOTE 伤害被护甲全额吸收(hpLoss=0)时获得 ${b.rageMarks} 枚标记`);
  const exec = read("angelica-luka-skills.js");
  console.log(`  NOTE 执行块自带 phase 守卫: ${/berserkWill[\s\S]{0,400}?battle\?\.phase|phase\s*===\s*4/.test(exec)}`);
}

console.log(`berserk-will phase/once/passive: ${pass} PASS / ${reds.length} FAIL${REVERT ? ` (REVERT=${REVERT})` : ""}`);
if (reds.length) {
  if (!REVERT) reds.forEach(name => console.log("  RED " + name));
  process.exit(1);
}
