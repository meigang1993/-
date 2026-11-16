// 【终极刀魔】独立复查：「出牌阶段限一次」四层守卫是否齐全；
// X 计数与预约触发是否同源（技能/饰品生成的实体转换杀不该吃掉预约却零结算）。
// 真实模块装配（vm）+ 真实 CardUtils.isEntitySingleKill；
// REVERT=phase|once|reset|same 为源码级反向验证，撤掉对应改动后应精准打红。
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
  if (REVERT === "once" && file === "skill-once-per-turn.js") {
    return hit(s, s.replace('    ["ultimateBlade", "usedUltimateBlade"],\n', ""), "once entry");
  }
  if (REVERT === "reset" && file === "battle-turn-state.js") {
    return hit(s, s.replace(
      " unit.usedUltimateBlade = false; unit.noaSlashCount = 0; unit.noaSlashTurn = null; delete unit.noaUltimateBladePending; delete unit.noaUltimateBladeTurn;",
      ""), "begin-turn reset");
  }
  if (REVERT === "same" && file === "noa-ultimate-blade-skills.js") {
    return hit(s, s.replace("    if (!isCountedKill) return;",
      "    if (!window.CardUtils?.isEntitySingleKill?.(card)) return;"), "shared predicate");
  }
  return s;
}

// ── 真实模块装配 ───────────────────────────────────────────────────────────
const logs = [];
const virtualCalls = [];
const win = {
  state: { battle: null },
  BattleLog: { add: (_s, text) => logs.push(text) },
  BattleLines: { skill: () => {} },
  BattleSystem: {
    useVirtualKill: (_state, actor, target, card) => {
      virtualCalls.push({ actor: actor.uid, target: target.uid, card });
      return true;
    },
  },
  RuinsEnemySkills: { blocksKillTarget: () => false },
  MieryulaTimeStop: { isSkillDisabled: () => false },
  MieryulaSkills: { blocksTactic: () => false },
  GameDataCards: { cardCodex: [{ name: "杀（普攻）", type: "slash" }], baseDeck: [], eliteCards: [] },
  console,
};
function load(file) {
  const ctx = { window: win, Math, Number, Array, Object, Set, Map, JSON,
    String, RegExp, Boolean, Date, Error, console };
  vm.runInNewContext(src(file), ctx, { filename: file });
}
["card-utils.js", "chiyo-chain-skills.js", "skill-once-per-turn.js",
  "noa-ultimate-blade-skills.js", "character-skill-access.js",
  "battle-playability-registries.js", "battle-card-playability.js",
  "battle-turn-state.js", "ui-common-skill-model.js",
  "data-new-characters.js"].forEach(load);

const play = win.BattleCardPlayability({ isKillCard: win.CardUtils.isKillCard });
win.BattleSystem.canPlay = (actor, card, battle) => play.canPlay(actor, card, battle);
win.BattleSystem.active = battle => battle?.allies?.find(u => u.uid === battle.activeUid);
const skillModel = win.UICommonSkillModel();
const tpl = win.GameDataNewCharacters.find(u => u.id === "noa");
const skill = tpl.skills.find(s => s.name === "终极刀魔");
const skillCard = () => Object.assign({ _skill: true }, skill.card);

function actor(extra = {}) {
  return Object.assign({
    uid: "a0", name: "怪面诺亚", ref: "noa", side: "ally", hp: 80, maxHp: 130,
    intent: 3, hand: [{ name: "杀（普攻）", type: "slash" }], skills: tpl.skills,
  }, extra);
}
function battle(a, extra = {}) {
  return Object.assign({
    allies: [a], enemies: [{ uid: "e0", side: "enemy", hp: 30, name: "敌", hand: [] }],
    activeUid: a.uid, phase: 4, turn: 1, played: [], shownPlayed: [],
  }, extra);
}
function state(b) { win.state = { battle: b, log: logs }; return win.state; }
const canResolve = (s, a, c, target) =>
  win.CharacterSkillAccess.canResolve(s, a, target || a, c, (u, k, b) => play.canPlay(u, k, b));
const skillState = (b, a) => skillModel.skillState(a, skill, b);
function resetTurn(a, b) { win.BattleTurnState.resetBeginTurn(a, b, 3); }
const entitySlash = (extra = {}) => Object.assign({ name: "杀（普攻）", type: "slash" }, extra);

// ── A 出牌阶段 ─────────────────────────────────────────────────────────────
{
  const a = actor(), b = battle(a), s = state(b), c = skillCard();
  T("A1 phase4 本人行动：技能入口 / UI / 执行块三处都放行",
    canResolve(s, a, c) === true && skillState(b, a).usable === true
    && win.NoaUltimateBladeSkills.handleSpecialCard(s, a, a, c) === true
    && a.noaUltimateBladePending === true,
    { resolve: canResolve(s, a, c), ui: skillState(b, a) });
}
for (const [tag, ph] of [["A2 准备阶段 phase1", 1], ["A3 结束阶段 phase6", 6]]) {
  const a = actor(), b = battle(a, { phase: ph }), s = state(b), c = skillCard();
  const ui = skillState(b, a);
  T(tag + "：入口 / UI / 执行块都拒绝且不挂预约",
    canResolve(s, a, c) === false && ui.usable === false
    && /只能在出牌阶段发动/.test(ui.reason)
    && win.NoaUltimateBladeSkills.handleSpecialCard(s, a, a, c) === true
    && a.noaUltimateBladePending !== true,
    { resolve: canResolve(s, a, c), ui });
}
{
  const a = actor(), b = battle(a, { activeUid: "x9" }), s = state(b), c = skillCard();
  T("A4 别家回合：UI 与执行块都不挂预约",
    skillState(b, a).usable === false
    && win.NoaUltimateBladeSkills.handleSpecialCard(s, a, a, c) === true
    && a.noaUltimateBladePending !== true);
}
{
  const a = actor(), b = battle(a, { locked: true }), s = state(b);
  T("A5 战斗锁定：UI 置灰且提示结算中",
    skillState(b, a).usable === false
    && /战斗结算中/.test(skillState(b, a).reason));
}
{
  const a = actor({ ref: "other" }), b = battle(a), s = state(b);
  T("A6 非诺亚角色：执行块 canUse 拒绝、不挂预约",
    win.NoaUltimateBladeSkills.handleSpecialCard(s, a, a, skillCard()) === true
    && a.noaUltimateBladePending !== true);
}

// ── B 出牌阶段限一次 ───────────────────────────────────────────────────────
{
  const a = actor(), b = battle(a);
  T("B1 登记表认 ultimateBlade → usedUltimateBlade",
    win.SkillOncePerTurn.blocked(a, { ultimateBlade: true }, b) === false
    && win.SkillOncePerTurn.blocked(Object.assign(a, { usedUltimateBlade: true }),
      { ultimateBlade: true }, b) === true);
}
{
  const a = actor(), b = battle(a), s = state(b);
  win.NoaUltimateBladeSkills.handleSpecialCard(s, a, a, skillCard());
  T("B2 发动后置灰：UI / canPlay / 技能入口三处都拒绝",
    skillState(b, a).usable === false
    && play.canPlay(a, skillCard(), b) === false
    && canResolve(s, a, skillCard()) === false, { ui: skillState(b, a) });
}
{
  const a = actor(), b = battle(a), s = state(b);
  win.NoaUltimateBladeSkills.handleSpecialCard(s, a, a, skillCard());
  const turn = a.noaUltimateBladeTurn;
  const r = win.NoaUltimateBladeSkills.handleSpecialCard(s, a, a, skillCard());
  T("B3 本回合二次发动不重复挂预约、不重置回合",
    r === true && a.noaUltimateBladePending === true
    && a.noaUltimateBladeTurn === turn);
}
{
  const a = actor(), b = battle(a), s = state(b);
  win.NoaUltimateBladeSkills.handleSpecialCard(s, a, a, skillCard());
  resetTurn(a, b); b.turn = 2; b.activeUid = a.uid; b.phase = 4;
  T("B4 下一回合重置后可再发动、按钮恢复可点",
    a.usedUltimateBlade === false && a.noaSlashCount === 0
    && a.noaUltimateBladePending == null
    && skillState(b, a).usable === true
    && win.NoaUltimateBladeSkills.handleSpecialCard(s, a, a, skillCard()) === true,
    { used: a.usedUltimateBlade, ui: skillState(b, a) });
}
{
  T("B5 回合重置源码含本技能三项重置",
    /unit\.usedUltimateBlade = false; unit\.noaSlashCount = 0; unit\.noaSlashTurn = null; delete unit\.noaUltimateBladePending; delete unit\.noaUltimateBladeTurn;/
      .test(read("battle-turn-state.js")));
}

// ── C X 计数与预约判据同源 ─────────────────────────────────────────────────
function fresh() {
  const a = actor(), b = battle(a), s = state(b);
  virtualCalls.length = 0; logs.length = 0;
  win.NoaUltimateBladeSkills.handleSpecialCard(s, a, a, skillCard());
  return { a, b, s, e: b.enemies[0] };
}
{
  const { a, s, e } = fresh();
  win.NoaUltimateBladeSkills.afterCardPlayed(s, a, e, entitySlash());
  T("C1 普通实体单体杀：计入 X、消耗预约、额外结算 1 次",
    a.noaSlashCount === 1 && a.noaUltimateBladePending == null
    && virtualCalls.length === 1);
}
{
  const { a, s, e } = fresh();
  const converted = entitySlash({ name: "魅杀", convertedFrom: "杀（普攻）",
    _skill: true, _entityConversion: true });
  win.NoaUltimateBladeSkills.afterCardPlayed(s, a, e, converted);
  T("C2 饰品转换杀（_entityConversion）计入 X、消耗预约、额外结算 1 次",
    a.noaSlashCount === 1 && a.noaUltimateBladePending == null
    && virtualCalls.length === 1,
    { pending: a.noaUltimateBladePending, count: a.noaSlashCount, calls: virtualCalls.length });
  win.NoaUltimateBladeSkills.afterCardPlayed(s, a, e, entitySlash());
  T("C3 预约已消耗，下一张普通杀只累加 X 不再额外结算",
    a.noaSlashCount === 2 && a.noaUltimateBladePending == null
    && virtualCalls.length === 1);
}
{
  const { a, s, e } = fresh();
  const copy = entitySlash({ generatedBySkill: "杀欲窥视", temporary: true });
  win.NoaUltimateBladeSkills.afterCardPlayed(s, a, e, copy);
  T("C4 技能生成的实体临时杀不消耗预约、不计入 X",
    a.noaUltimateBladePending === true && !a.noaSlashCount
    && virtualCalls.length === 0,
    { pending: a.noaUltimateBladePending, count: a.noaSlashCount });
}
{
  const { a, s, e } = fresh();
  // 带 _skill 但不是 convertAs 实体牌转换（无 _entityConversion）仍排除：
  // 上一轮修的「吃掉预约却零结算」BUG 不能因本轮口径反转复活。
  const skillSlash = entitySlash({ _skill: true, temporary: true });
  win.NoaUltimateBladeSkills.afterCardPlayed(s, a, e, skillSlash);
  T("C4b 非转换的技能实体杀仍不消耗预约、不计入 X",
    a.noaUltimateBladePending === true && !a.noaSlashCount
    && virtualCalls.length === 0,
    { pending: a.noaUltimateBladePending, count: a.noaSlashCount });
}
{
  const { a, s, e } = fresh();
  win.NoaUltimateBladeSkills.afterCardPlayed(s, a, e,
    entitySlash({ sweep: true, allTargets: ["e0"] }));
  win.NoaUltimateBladeSkills.afterCardPlayed(s, a, e,
    entitySlash({ virtual: true, generatedBySkill: "淫气改造" }));
  T("C5 群体实体杀 / 虚拟杀都不消耗预约、不计入 X",
    a.noaUltimateBladePending === true && !a.noaSlashCount
    && virtualCalls.length === 0);
}
{
  const s = read("noa-ultimate-blade-skills.js");
  T("C6 计数段与预约段共用同一判据 isCountedKill",
    /const isCountedKill =/.test(s)
    && /if \(!isCountedKill\) return;/.test(s)
    && !/if \(!window\.CardUtils\?\.isEntitySingleKill\?\.\(card\)\) return;/.test(s));
}

// ── D 静态接线 ─────────────────────────────────────────────────────────────
{
  T("D1 压缩清单与稳定存档点都登记挂起链",
    read("store-compact.js").includes('"noaUltimateChain"')
    && read("battle-save-checkpoint-validation.js").includes('"noaUltimateChain"'));
}
{
  const bundles = fs.readFileSync(path.join(__dirname, "publish-bundles.json"), "utf8");
  const i = bundles.indexOf("noa-ultimate-blade-skills.js");
  const j = bundles.indexOf("chiyo-chain-skills.js");
  T("D2 bundle 清单登记新技能且排在连鬼斩之后", i > 0 && j > 0 && i > j);
}
{
  T("D3 角色表描述写明出牌阶段限一次与 X 含当前这张",
    /出牌阶段限一次/.test(skill.text) && /包含当前这张/.test(skill.text));
}

const total = pass + reds.length;
console.log(`RESULT ${pass}/${total}` + (REVERT ? ` REVERT=${REVERT}` : ""));
if (REVERT) console.log(`RED_COUNT ${reds.length}`);
else {
  console.log(reds.length ? `FAILED ${reds.length}: ${reds.join(" | ")}` : "ALL PASS");
  if (reds.length) process.exit(1);
}
