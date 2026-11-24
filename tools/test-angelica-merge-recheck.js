// 【狂战意志】合并【猩红暴走】复查：主动/被动台词边界、一次性发动、旧存档兼容、
// 摸牌反馈与回血数值、遗留断言收尾。REVERT=line|legacy|once 为源码级反向验证。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

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
function patched(file) {
  let s = read(file);
  if (REVERT === "line" && file === "angelica-luka-skills.js") {
    const needle = "    actor.rageMarks = Math.max(0, (actor.rageMarks || 0) - 1);\n";
    if (!s.includes(needle)) throw new Error("REVERT=line must hit");
    s = s.replace(needle, needle + '    line(state, actor, "狂战意志");\n');
  }
  if (REVERT === "legacy" && file === "angelica-luka-skills.js") {
    const needle = " && !actor.usedCrimsonRampage && (actor.rageMarks";
    if (!s.includes(needle)) throw new Error("REVERT=legacy must hit");
    s = s.replace(needle, " && (actor.rageMarks");
  }
  if (REVERT === "once" && file === "angelica-luka-skills.js") {
    const needle = "    if (!canUseBerserkWill(actor)) return true;";
    if (!s.includes(needle)) throw new Error("REVERT=once must hit");
    s = s.replace(needle, "    if (!(actor.rageMarks || 0)) return true;");
  }
  return s;
}
function src(file) { return patched(file); }

// ── A 静态：边界与遗留断言 ─────────────────────────────────────────────────
const skills = src("angelica-luka-skills.js");
{
  const passive = skills.slice(skills.indexOf("function beforeIntentCost"), skills.indexOf("function canUseBerserkWill"));
  T("A1 被动用标记抵淫气不再播主动技台词",
    !/line\(state, actor, "狂战意志"\)/.test(passive)
    && /line\(state, actor, "狂战意志"\)/.test(skills.slice(skills.indexOf("function berserkWill"))));
}
T("A2 台词表删除独立主动技台词", !/"猩红暴走"/.test(src("battle-line-data.js")));
T("A3 技能计数注释不再写旧技能名（A15 遗留断言收尾）",
  !/猩红暴走/.test(fs.readFileSync(path.join(__dirname, "skill-audit-presentation-contract-tests.js"), "utf8")));
T("A4 旧存档字段仍参与一次性判定且每回合清理",
  /!actor\.usedCrimsonRampage/.test(skills)
  && /unit\.usedCrimsonRampage = false/.test(src("battle-turn-state.js"))
  && /unit\.usedBerserkWill = false/.test(src("battle-turn-state.js")));
T("A5 一次性登记表与主动技入口仍指向狂战意志",
  /\["berserkWill", actor => !window\.AngelicaLukaSkills\?\.canUseBerserkWill\?\.\(actor\)\]/.test(src("skill-once-per-turn.js"))
  && /flags:\s*\["berserkWill"\],\s*name:\s*"狂战意志"/.test(src("character-skill-access.js")));
T("A6 角色表为主动技且描述含合并效果",
  /name:\s*"狂战意志",\s*type:\s*"active"/.test(src("data-characters-extra.js"))
  && /出牌阶段限一次，你可以弃置所有“狂战”标记/.test(src("data-characters-extra.js")));
T("A7 handleSpecialCard 只认 berserkWill", /if \(card\?\.berserkWill\) return berserkWill/.test(skills)
  && !/card\?\.crimsonRampage/.test(skills));
T("A8 今日公告仍写明合并口径",
  /删除独立主动技【猩红暴走】/.test(src("update-notice-recent.js")));

// ── B 行为：真实模块装配 ────────────────────────────────────────────────────
const fx = [];
const win = {
  BattleLog: { add: (state, text) => (state.log ||= []).push(text) },
  BattleLines: { skill: (state, _unit, name) => (state.lines ||= []).push(name) },
  BattleHpValue: {
    healPctStacks: (unit, pct, n) => Math.max(1, Math.round((unit?.maxHp ?? unit?.stats?.maxHp ?? 0) * Math.max(0, pct) / 100)) * Math.max(0, Math.round(n)),
    healCap: (unit, amount) => Math.max(0, Math.min(amount, (unit.maxHp || 0) - (unit.hp || 0))),
    applyHeal: (unit, amount) => { unit.hp += amount; },
  },
  BattleStats: { heal() {} },
  EnemySkills: { clearHolyScar() {}, onHeal() {} },
  ElranaAceNanaliSkills: { afterHeal() {} },
  BertisGerlotSkills: { refreshArrogance() {} },
  AngelicaBerserkerSkinFX: {
    berserkWill: (_s, _a, n) => fx.push(n), rageSpend() {}, rageGain() {}, might() {}, queueEntry() {},
  },
  CardUtils: { isKillCard: card => card?.type === "slash" },
};
function load(file) {
  const ctx = { window: win, Math, Number, Array, Object, Set, Map, JSON, String, RegExp, console };
  vm.runInNewContext(src(file), ctx, { filename: file });
}
["battle-draw-feedback.js", "data-characters-extra.js", "angelica-luka-skills.js",
  "skill-once-per-turn.js", "character-skill-access.js", "battle-turn-state.js"].forEach(load);

const templates = win.GameDataCharactersExtra.find(c => c.id === "angelica");
const skillCard = Object.assign({ _skill: true }, templates.skills.find(s => s.name === "狂战意志").card);
function actor(extra = {}) {
  return Object.assign({
    uid: "a0", name: "安洁莉卡", ref: "angelica", side: "ally", hp: 20, maxHp: 40,
    rageMarks: 4, hand: [], statuses: [], skills: templates.skills,
  }, extra);
}
function battle(a) { return { allies: [a], enemies: [{ uid: "e0", side: "enemy", hp: 10 }], activeUid: a.uid, phase: 4, turn: 1 }; }
function state(a) { return { battle: battle(a), log: [], lines: [] }; }
function run(a, drawImpl, ctx = { pushFloat() {} }) {
  const s = state(a);
  const draws = [];
  const deps = { draw: (unit, n, b) => { draws.push(n); return drawImpl(unit, n, b); }, pushFloat() {} };
  const ret = win.AngelicaLukaSkills.handleSpecialCard(s, a, a, skillCard, deps, ctx);
  return { s, draws, ret };
}
const realDraw = (_u, n) => Array.from({ length: n }, (_, i) => ({ name: `牌${i}` }));

{
  const a = actor(); const { s, draws } = run(a, realDraw);
  T("B1 主动发动：弃 4 标记 / 摸 4 张 / 回血 16 / 台词与特效",
    a.rageMarks === 0 && draws[0] === 4 && a.hp === 36
    && s.lines.includes("狂战意志") && fx.includes(4)
    && s.log.some(t => t.includes("发动狂战意志"))
    && s.log.some(t => t.includes("摸4张牌")), { marks: a.rageMarks, hp: a.hp, log: s.log });
  a.rageMarks = 3; // 已发动过、同回合又攒到标记：仍不得二次发动
  const again = run(a, realDraw);
  T("B2 出牌阶段限一次（已发动后再攒标记也不生效）",
    a.rageMarks === 3 && again.draws.length === 0 && a.hp === 36);
}
{
  const a = actor({ rageMarks: 0 }); const { draws } = run(a, realDraw);
  T("B3 无标记不发动、不摸牌不回血",
    !win.AngelicaLukaSkills.canUseBerserkWill(a) && draws.length === 0 && a.hp === 20);
}
{
  const a = actor({ hp: 40, maxHp: 40, rageMarks: 2 }); const { s, draws } = run(a, realDraw);
  T("B4 满血仍弃标记摸牌但不谎报恢复",
    a.rageMarks === 0 && a.hp === 40 && draws[0] === 2
    && s.log.some(t => t.includes("生命已满，未恢复生命")));
}
{
  const a = actor({ rageMarks: 3 }); const { s } = run(a, () => []);
  T("B5 牌堆耗尽按实际到手数写战报，且仍回血",
    a.rageMarks === 0 && a.hp === 32
    && s.log.some(t => t.includes("未摸到牌"))
    && !s.log.some(t => t.includes("摸3张牌")), { log: s.log, hp: a.hp });
}
{
  const a = actor({ usedBerserkWill: true, usedCrimsonRampage: true });
  win.BattleTurnState.resetBeginTurn(a, battle(a), 1);
  T("B6 跨回合重置恢复发动并清理旧档字段",
    a.usedBerserkWill === false && a.usedCrimsonRampage === false
    && win.AngelicaLukaSkills.canUseBerserkWill(a));
}
{
  const old = actor({ usedCrimsonRampage: true });
  T("B7 旧存档本回合已发动记录仍受限",
    !win.AngelicaLukaSkills.canUseBerserkWill(old)
    && win.SkillOncePerTurn.blocked(old, skillCard, battle(old)));
}
{
  const a = actor();
  T("B8 登记表：无标记置灰、已发动置灰",
    !win.SkillOncePerTurn.blocked(a, skillCard, battle(a))
    && win.SkillOncePerTurn.blocked(actor({ rageMarks: 0 }), skillCard, battle(a)));
}
{
  const a = actor(); const s = state(a);
  win.AngelicaLukaSkills.beforeIntentCost(s, a, { name: "杀（普攻）", type: "slash" });
  T("B9 被动抵淫气消耗 1 枚标记但不播主动技台词",
    a.rageMarks === 3 && !s.lines.includes("狂战意志")
    && s.log.some(t => t.includes("消耗1枚狂战标记")), { lines: s.lines, log: s.log });
}
{
  const a = actor({ rageMarks: 0 }); const s = state(a);
  const deps = { draw() {}, damage: { scheduleAfterDamage: fn => fn() } };
  win.AngelicaLukaSkills.afterDamage(s, a, { uid: "e0" }, { name: "杀（普攻）", type: "slash" }, 3, deps);
  T("B10 原锁定技保留：造成伤害后获得 1 枚标记", a.rageMarks === 1);
  a.rageMarks = 10;
  win.AngelicaLukaSkills.afterDamage(s, a, { uid: "e0" }, { name: "杀（普攻）", type: "slash" }, 3, deps);
  T("B11 标记上限 10 不溢出", a.rageMarks === 10 && s.log.some(t => t.includes("已达上限")));
}
{
  const a = actor(); const { s } = run(a, realDraw);
  const deps = { draw() {}, damage: { scheduleAfterDamage: fn => fn() } };
  win.AngelicaLukaSkills.afterDamage(s, a, { uid: "e0" }, { name: "杀（普攻）", type: "slash" }, 3, deps);
  T("B12 主动弃光后同回合受伤仍攒标记，但不能再次发动",
    a.rageMarks === 1 && !win.AngelicaLukaSkills.canUseBerserkWill(a));
}
{
  const a = actor({ rageMarks: 5 }); const { s } = run(a, (_u, _n) => [{ name: "牌1" }, { name: "牌2" }]);
  T("B13 摸牌反馈按真实返回数组长度，不按请求数谎报",
    s.log.some(t => t.includes("摸2张牌")) && !s.log.some(t => t.includes("摸5张牌")), { log: s.log });
}

console.log(`angelica-merge recheck: ${pass} PASS / ${reds.length} FAIL${REVERT ? ` (REVERT=${REVERT})` : ""}`);
if (reds.length) {
  if (!REVERT) reds.forEach(name => console.log("  RED " + name));
  process.exit(1);
}
