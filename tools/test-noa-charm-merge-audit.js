// 【淫气改造】合并原独立副作用技能严格检查：角色表 / 执行块 / 台词 / 公告 /
// 行为链路 / 旧存档兼容。REVERT=merge|compat|text 为源码级反向验证。
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
  if (REVERT === "merge" && file === "noa-side-effect-skills.js") {
    const before = s;
    s = s.split('hasSkill(unit, "淫气改造")').join('hasSkill(unit, "改造" + "副作用")');
    if (s === before) throw new Error("REVERT=merge must hit");
  }
  if (REVERT === "compat" && file === "noa-side-effect-skills.js") {
    const needle = "    if (unit.skipPlayPhase && unit._noaFrenzyTurn === b.turn) return true;";
    if (!s.includes(needle)) throw new Error("REVERT=compat must hit");
    s = s.replace(needle,
      '    if (unit.skipPlayPhase && unit.skipPlayReason === "淫气改造"\n'
      + "      && unit._noaFrenzyTurn === b.turn) return true;");
  }
  if (REVERT === "text" && file === "update-notice-recent.js") {
    const lines = s.splitlines ? s.splitlines() : s.split("\n");
    const idx = lines.findIndex(l => l.trim().startsWith('"技能调整【淫气改造】'));
    if (idx < 0) throw new Error("REVERT=text must hit");
    lines.splice(idx, 1);
    s = lines.join("\n");
  }
  return s;
}
function src(file) { return patched(file); }

// ── A 静态 ─────────────────────────────────────────────────────────────────
const data = src("data-new-characters.js");
{
  const block = data.slice(data.indexOf('id: "noa"'), data.indexOf('id: "gerda"'));
  const names = [...block.matchAll(/\{\s*name:\s*"([^"]+)",\s*type:\s*"(passive|active|trigger)"/g)]
    .map(m => m[1]);
  T("A1 诺亚保留【淫气改造】+【终极刀魔】，无幽灵旧名",
    names.length === 2 && names.includes("淫气改造") && names.includes("终极刀魔")
    && !names.includes("改造副作用"), names);
}
T("A2 合并后描述含四段效果",
  /出牌阶段开始时及你每次出牌后/.test(data)
  && /使用【杀】牌不消耗杀意/.test(data)
  && /结束阶段，你对我方其他所有存活男性角色各造成等同于你攻击力的伤害/.test(data)
  && /若队伍中没有存活的男性角色，出牌阶段开始时/.test(data));
T("A3 角色评价不再提独立技能名",
  /evaluation:/.test(data) && !/改造副作用/.test(data.slice(data.indexOf("evaluation:"), data.indexOf("evaluation:") + 400)));
const impl = src("noa-side-effect-skills.js");
T("A4 执行块三处判定全部改为【淫气改造】",
  (impl.match(/hasSkill\(unit, "淫气改造"\)/g) || []).length === 3
  && !/hasSkill\(unit, "改造副作用"\)/.test(impl));
T("A5 台词 / 战报 / 虚拟牌 / 跳过原因全部改用【淫气改造】",
  /BattleLines\?\.skill\?\.\(state, unit, "淫气改造"\)/.test(impl)
  && /的淫气改造发作/.test(impl)
  && /damage\(state, target, amount, "淫气改造", unit/.test(impl)
  && /generatedBySkill: "淫气改造"/.test(impl)
  && /unit\.skipPlayReason = "淫气改造"/.test(impl));
T("A6 幂等按回合 token，不再比对原因字符串（旧档兼容）",
  /if \(unit\.skipPlayPhase && unit\._noaFrenzyTurn === b\.turn\) return true;/.test(impl)
  && !/skipPlayReason === "淫气改造"/.test(impl));
{
  const notice = src("update-notice-recent.js");
  T("A7 今日公告写明删除与合并口径",
    /删除独立技能【改造副作用】/.test(notice)
    && /效果全部并入【淫气改造】/.test(notice)
    && /旧存档/.test(notice));
}
{
  const lines = src("new-character-line-data.js");
  T("A8 台词表 key 改为【淫气改造】并保留原台词",
    /"淫气改造":\s*"全部！全部进来！！"/.test(lines));
}
{
  const contract = fs.readFileSync(path.join(__dirname, "skill-audit-presentation-contract-tests.js"), "utf8");
  T("A9 全角色技能计数同步为 87", /length === 87,/.test(contract)
    && /all 87 playable-character skills/.test(contract));
}
{
  // store-repairs.js 的旧档迁移必须识别旧技能名才能删除幽灵技能，属合理例外。
  const skip = new Set(["update-notice-recent.js", "update-notice-archive.js",
    "store-repairs.js"]);
  const hits = fs.readdirSync(ROOT).filter(f => f.endsWith(".js") && !skip.has(f))
    .filter(f => src(f).includes("改造副作用"));
  T("A10 源码中文旧技能名残留 0（公告历史除外）", hits.length === 0, hits);
}
{
  const summary = src("update-notice.js");
  T("A11 公告摘要不再把两个技能并列", !/【淫气改造】【改造副作用】/.test(summary)
    && /含合并后的副作用效果/.test(summary));
}

// ── B 行为：真实模块装配 ──────────────────────────────────────────────────
const logs = [], lines = [], damages = [], bites = [];
const win = {
  BattleLineData: { skillLines: {}, allyIntroLines: {} },
  GameData: { characters: [{ id: "noa", stats: { handLimit: 4 } }] },
  BattleLog: { add: (_s, text) => logs.push(text) },
  BattleLines: { skill: (_s, _u, name) => lines.push(name) },
  CardUtils: {
    fromEntity: (name, opts) => ({ name, ...opts, virtual: true }),
    isKillCard: card => card?.type === "slash",
  },
  BattleSystem: { useVirtualKill: (s, u, t, card) => bites.push({ u, t, card }) },
  GameRandom: { sample: pool => pool[0] },
  GuestCharacterSkills: { countsForLimit: () => true },
};
function load(file) {
  const ctx = { window: win, Math, Number, Array, Object, Set, Map, JSON, String, RegExp, console };
  vm.runInNewContext(src(file), ctx, { filename: file });
}
["data-new-characters.js", "new-character-line-data.js", "noa-side-effect-skills.js",
  "noa-charm-discard.js", "noa-charm-skills.js"].forEach(load);

const SKILLS = win.GameDataNewCharacters.find(c => c.id === "noa").skills;
const OLD_REASON = "改造" + "副作用";
function noa(extra = {}) {
  return Object.assign({
    uid: "n0", name: "怪面诺亚", ref: "noa", gender: "female", side: "ally",
    hp: 100, maxHp: 130, stats: { attack: 6, handLimit: 4 }, tempAttack: 0,
    hand: [], skills: SKILLS,
  }, extra);
}
function male(uid, hp = 50) {
  return { uid, name: uid, gender: "male", side: "ally", hp, maxHp: 50, hand: [] };
}
function battle(overrides = {}) {
  return Object.assign({ allies: [], enemies: [{ uid: "e0", name: "敌", side: "enemy", hp: 30 }],
    activeUid: "n0", phase: 4, turn: 7 }, overrides);
}
function state(b) { return { battle: b, log: [] }; }
function reset() { logs.length = lines.length = damages.length = bites.length = 0; }
const damage = (s, target, amount, reason, unit, card) =>
  damages.push({ target: target.uid, amount, reason, unit: unit.uid, card });

{
  reset();
  const n = noa(); const b = battle({ allies: [n, male("m1"), male("m2", 0)] });
  win.state = { battle: b };
  T("B1 合并后手牌上限 = 模板 4 + 存活男性数", win.NoaSideEffectSkills.handLimit(n) === 5);
  win.state = { battle: battle({ allies: [n] }) };
  T("B2 全女性队伍手牌上限回落到 4", win.NoaSideEffectSkills.handLimit(n) === 4);
  T("B3 非诺亚 / 无技能不接管上限",
    win.NoaSideEffectSkills.handLimit(male("m1")) === null
    && win.NoaSideEffectSkills.handLimit(noa({ skills: [] })) === null);
}
{
  reset();
  const n = noa({ tempAttack: -3 });
  const b = battle({ allies: [n, male("m1"), male("m2"), male("m3", 0)] });
  const s = state(b);
  win.NoaSideEffectSkills.endTurn(s, n, { damage });
  T("B4 结束阶段对存活男性各造成攻击力伤害，牌名与台词均为【淫气改造】",
    damages.length === 2 && damages.every(d => d.amount === 3 && d.reason === "淫气改造"
      && d.card.name === "淫气改造" && d.unit === "n0")
    && lines.includes("淫气改造")
    && logs.some(t => t.includes("的淫气改造发作")), { damages, lines, logs });
  T("B5 攻击力被夹到 0 不会变成回血", damages.every(d => d.amount >= 0));
}
{
  reset();
  const n = noa(); const b = battle({ allies: [n] }); const s = state(b);
  const ret = win.NoaSideEffectSkills.beginPlayPhase(s, n);
  T("B6 全女性队伍发动狂暴咬杀并跳过出牌阶段",
    ret === true && bites.length === 1 && n.skipPlayPhase === true
    && n.skipPlayReason === "淫气改造" && n._noaFrenzyTurn === 7
    && bites[0].card.generatedBySkill === "淫气改造"
    && logs.some(t => t.includes("的淫气改造发作")), { ret, bites, reason: n.skipPlayReason, logs });
  const ret2 = win.NoaSideEffectSkills.beginPlayPhase(s, n);
  T("B7 同回合重复调用幂等，不再咬第二次", ret2 === true && bites.length === 1);
}
{
  reset();
  const n = noa({ skipPlayPhase: true, skipPlayReason: OLD_REASON, _noaFrenzyTurn: 7 });
  const s = state(battle({ allies: [n] }));
  const ret = win.NoaSideEffectSkills.beginPlayPhase(s, n);
  T("B8 旧存档沿用旧跳过原因时读档后仍幂等，不重复咬杀",
    ret === true && bites.length === 0, { ret, bites });
}
{
  reset();
  const n = noa({ skipPlayPhase: true, skipPlayReason: "眩晕" });
  const s = state(battle({ allies: [n] }));
  const ret = win.NoaSideEffectSkills.beginPlayPhase(s, n);
  T("B9 眩晕等其它跳过原因不触发狂暴、不被覆盖",
    ret === false && bites.length === 0 && n.skipPlayReason === "眩晕");
}
{
  reset();
  const n = noa(); const s = state(battle({ allies: [n, male("m1")] }));
  T("B10 队伍有存活男性时不狂暴",
    win.NoaSideEffectSkills.beginPlayPhase(s, n) === false && bites.length === 0);
}
{
  const n = noa(); const b = battle({ allies: [n] });
  win.state = { battle: b };
  T("B11 原锁定技仍在：自己出牌阶段免杀意，别家回合不生效",
    win.NoaCharmSkills.noIntentCost(n, { name: "杀（普攻）", type: "slash" }) === true
    && win.NoaCharmSkills.noIntentCost(n, { name: "闪", type: "tactic" }) === false);
  win.state = { battle: Object.assign({}, b, { activeUid: "e0" }) };
  T("B12 别家回合不接管手牌平衡、不弹弃牌",
    win.NoaCharmSkills.noIntentCost(n, { name: "杀（普攻）", type: "slash" }) === false
    && win.NoaCharmSkills.balanceHand(win.state, n, () => 0) === 0);
}

console.log(`noa-charm-merge audit: ${pass} PASS / ${reds.length} FAIL${REVERT ? ` (REVERT=${REVERT})` : ""}`);
if (reds.length) {
  if (!REVERT) reds.forEach(name => console.log("  RED " + name));
  process.exit(1);
}
