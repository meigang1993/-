// 技能合并（狂战意志 / 淫气改造）副作用复查：旧档迁移、死卡链路、异常 actor、
// 幂等与装配。REVERT=migration|normalize 为源码级反向验证。
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
function src(file) {
  let s = read(file);
  if (REVERT === "migration" && file === "store-migrations.js") {
    const needle = "    if (normalizeMergedSkills(state)) markForSave(state);";
    if (!s.includes(needle)) throw new Error("REVERT=migration must hit");
    s = s.replace(needle, "    // migration removed");
  }
  if (REVERT === "normalize" && file === "store-repairs.js") {
    const needle = "  function normalizeMergedSkills(state) {";
    if (!s.includes(needle)) throw new Error("REVERT=normalize must hit");
    const start = s.indexOf(needle);
    const end = s.indexOf("\n  }", start);
    s = s.slice(0, start) + "  function normalizeMergedSkills(state) { return false; }" + s.slice(end + 4);
  }
  return s;
}

// ── A 静态：读档迁移接线 ────────────────────────────────────────────────────
const migrations = src("store-migrations.js");
T("A1 读档在恢复战斗后调用合并技能规范化",
  /if \(normalizeMergedSkills\(state\)\) markForSave\(state\)/.test(migrations)
  && migrations.indexOf("normalizeMergedSkills(state)") > migrations.indexOf("BattleSaveCheckpoint?.restore")
  && migrations.indexOf("normalizeMergedSkills(state)") < migrations.indexOf("recoverOrphanedBattleNode(state)"));
const repairs = src("store-repairs.js");
T("A2 规范化函数真实导出",
  /function normalizeMergedSkills\(state\)/.test(repairs)
  && /normalizeMergedSkills,/.test(repairs.slice(repairs.lastIndexOf("return {"))));
T("A3 规范化不碰名册与局外牌",
  !/state\.chars|state\.deck/.test(repairs.slice(repairs.indexOf("function normalizeMergedSkills"))));
{
  const bundles = JSON.parse(fs.readFileSync(path.join(__dirname, "publish-bundles.json"), "utf8"));
  const list = bundles["battle-skills"] || [];
  const side = list.indexOf("noa-side-effect-skills.js");
  const discard = list.indexOf("noa-charm-discard.js");
  const charm = list.indexOf("noa-charm-skills.js");
  const charmSrc = read("noa-charm-skills.js");
  T("A4 淫气改造效果执行块先于 discard / charm 装配，且 limitOf 仍延迟求值",
    side >= 0 && discard > side && charm > discard
    && /window\.NoaSideEffectSkills\?\.handLimit\?\.\(unit\)/.test(charmSrc)
    && !/NoaSideEffectSkills\.handLimit\(/.test(charmSrc),
    { side, discard, charm });
}

// ── B/C/D 行为：真实模块装配 ───────────────────────────────────────────────
const win = {
  GameData: { characters: [], baseDeck: [], eliteCards: [] },
  BattleLog: { add: (state, text) => (state.log || (state.log = [])).push(text) },
  BattleLines: { skill: (state, _unit, name) => (state.lines || (state.lines = [])).push(name) },
  CardUtils: {
    isKillCard: card => card?.type === "slash",
    fromEntity: (name, opts) => ({ name, ...opts, virtual: true }),
  },
  BattleHpValue: {
    healCap: (unit, amount) => Math.max(0, Math.min(amount, (unit.maxHp || 0) - (unit.hp || 0))),
    applyHeal: (unit, amount) => { unit.hp += amount; },
  },
  BattleStats: { heal() {} },
  EnemySkills: { clearHolyScar() {}, onHeal() {} },
  ElranaAceNanaliSkills: { afterHeal() {} },
  BertisGerlotSkills: { refreshArrogance() {} },
  AngelicaBerserkerSkinFX: {
    berserkWill() {}, rageSpend() {}, rageGain() {}, might() {}, queueEntry() {},
  },
  BattleDrawFeedback: {
    action: (_u, _n, drawn) => `摸${drawn}张牌`,
    shortage: () => "", signal: () => null,
  },
  BattleSystem: { useVirtualKill: (state, u, t, card) => (state.bites || (state.bites = [])).push({ u, t, card }) },
  GameRandom: { sample: pool => pool[0] },
  GuestCharacterSkills: { countsForLimit: () => true },
  BattleDamageLifecycle: { delayUntilHitSettled: () => false },
  UICommon: { skillsOf: unit => unit?.skills || [] },
  GameStoreBountyRepairs: { refreshBountyGold() {} },
};
function load(file) {
  const ctx = { window: win, GameData: win.GameData, Math, Number, Array, Object, Set, Map, JSON, String, RegExp, console };
  vm.runInNewContext(src(file), ctx, { filename: file });
}
["store-save-schema.js", "store-repairs.js",
  "battle-line-data.js", "new-character-line-data.js", "data-characters-extra.js",
  "angelica-luka-skills.js", "skill-once-per-turn.js", "character-skill-access.js",
  "data-new-characters.js", "noa-side-effect-skills.js",
  "noa-charm-discard.js", "noa-charm-skills.js"].forEach(load);
win.GameData.characters = [
  ...(win.GameDataNewCharacters || []), ...(win.GameDataCharactersExtra || []),
];

const legacyCard = () => ({
  name: "猩红暴走", type: "tactic", suit: "", _skill: true,
  crimsonRampage: true, targetless: true, text: "弃置所有狂战标记",
});
function legacyState() {
  const angelica = {
    uid: "a0", name: "安洁莉卡", ref: "angelica", side: "ally", hp: 80, maxHp: 154,
    rageMarks: 3, usedCrimsonRampage: false,
    skills: [
      { name: "力量爆发", type: "passive" },
      { name: "狂战意志", type: "passive" },
      { name: "猩红暴走", type: "active", card: legacyCard() },
    ],
    hand: [legacyCard()], deck: [], discard: [], consumed: [],
  };
  const noa = {
    uid: "n0", name: "怪面诺亚", ref: "noa", gender: "female", side: "ally",
    hp: 100, maxHp: 130, stats: { attack: 6, handLimit: 4 }, tempAttack: 0,
    skipPlayPhase: true, skipPlayReason: "改造副作用",
    skills: [{ name: "淫气改造", type: "passive" }, { name: "改造副作用", type: "passive" }],
    hand: [], deck: [], discard: [], consumed: [],
  };
  const battle = {
    allies: [angelica, noa], enemies: [{ uid: "e0", name: "敌", side: "enemy", hp: 30 }],
    turn: 7, phase: 4, activeUid: "a0", log: [],
  };
  return { state: { battle, chars: [], deck: [], log: [] }, angelica, noa, battle };
}

// B0 迁移前：旧卡确实是「能打出但没有任何效果」的死卡（不是空想场景）
{
  const { angelica, battle } = legacyState();
  const card = legacyCard();
  const state = { battle, log: [] };
  const handled = win.AngelicaLukaSkills.handleSpecialCard(
    state, angelica, angelica, card, { draw: (_u, n) => n }, { pushFloat() {} });
  T("B0 合并后旧存档的猩红暴走卡会变成死卡（迁移必须修掉）",
    handled === false
    && !win.SkillOncePerTurn.blocked(angelica, card, battle)
    && win.CharacterSkillAccess.canResolve(state, angelica, angelica, card, () => true) === true);
}

const legacy = legacyState();
const normalize = win.StoreRepairs.normalizeMergedSkills;
const changed = typeof normalize === "function" ? normalize(legacy.state) : null;
T("B1 旧档规范化返回 changed=true", changed === true);
T("B2 安洁莉卡只剩 2 个技能，幽灵【猩红暴走】删除",
  legacy.angelica.skills.length === 2
  && !legacy.angelica.skills.some(s => s.name === "猩红暴走"), legacy.angelica.skills.map(s => s.name));
T("B2b 旧档的被动型【狂战意志】升级成主动技（否则没有发动按钮）",
  legacy.angelica.skills.some(s => s.name === "狂战意志" && s.type === "active"
    && s.card?.berserkWill === true));
T("B3 旧技能卡就地迁移成 berserkWill 且改回【狂战意志】",
  legacy.angelica.hand[0].berserkWill === true
  && !("crimsonRampage" in legacy.angelica.hand[0])
  && legacy.angelica.hand[0].name === "狂战意志");
T("B4 诺亚只剩【淫气改造】一个技能，且描述已换成合并版",
  legacy.noa.skills.length === 1 && legacy.noa.skills[0].name === "淫气改造"
  && /结束阶段/.test(legacy.noa.skills[0].text || ""));
T("B5 旧跳过原因改写为【淫气改造】", legacy.noa.skipPlayReason === "淫气改造");
T("B6 幂等：二次规范化 changed=false",
  typeof normalize === "function" && normalize(legacy.state) === false);
T("B7 不动其它单位、其它牌与敌方",
  legacy.battle.enemies.length === 1 && legacy.battle.enemies[0].hp === 30
  && legacy.angelica.skills[0].name === "力量爆发");

// B8 迁移后旧卡走完整发动链路，不再空转
{
  const card = legacy.angelica.hand[0];
  const state = { battle: legacy.battle, log: [] };
  const handled = win.AngelicaLukaSkills.handleSpecialCard(
    state, legacy.angelica, legacy.angelica, card,
    { draw: (_u, n) => { state.drawn = n; return n; } }, { pushFloat() {} });
  T("B8 迁移后旧卡真发动：弃标记 / 摸牌 / 回血 / 置一次性",
    handled === true && legacy.angelica.rageMarks === 0
    && legacy.angelica.usedBerserkWill === true && state.drawn === 3
    && legacy.angelica.hp > 80
    && state.log.some(t => t.includes("发动狂战意志")),
    { handled, marks: legacy.angelica.rageMarks, hp: legacy.angelica.hp, drawn: state.drawn });
}

// C 旧档诺亚：无回合 token 的旧跳过原因仍幂等，且效果按新技能名执行
{
  const s = { battle: legacy.battle, log: [] };
  win.state = s;
  const ret = win.NoaSideEffectSkills.beginPlayPhase(s, legacy.noa);
  T("C1 真实旧档（无 _noaFrenzyTurn）读档后不重复咬杀",
    ret === false && !s.bites && legacy.noa.skipPlayReason === "淫气改造");
  const n2 = Object.assign({}, legacy.noa, { skipPlayPhase: false, skipPlayReason: undefined });
  const b2 = Object.assign({}, legacy.battle, { allies: [n2], activeUid: "n0" });
  win.state = { battle: b2 };
  const s2 = { battle: b2, log: [] };
  const ret2 = win.NoaSideEffectSkills.beginPlayPhase(s2, n2);
  T("C2 合并后狂暴仍按【淫气改造】播放并跳过出牌阶段",
    ret2 === true && s2.bites?.length === 1 && n2.skipPlayReason === "淫气改造"
    && s2.bites[0].card.generatedBySkill === "淫气改造");
}

// D 合并技能本体的边界
{
  const A = win.AngelicaLukaSkills;
  const base = { ref: "angelica", rageMarks: 2 };
  T("D1 canUseBerserkWill：正常 / 0 标记 / 已发动 / 旧档字段",
    A.canUseBerserkWill(base) === true
    && A.canUseBerserkWill({ ...base, rageMarks: 0 }) === false
    && A.canUseBerserkWill({ ...base, usedBerserkWill: true }) === false
    && A.canUseBerserkWill({ ...base, usedCrimsonRampage: true }) === false);
  const a = { uid: "a1", ref: "angelica", rageMarks: 1, hp: 10, maxHp: 40, side: "ally" };
  const s = { battle: { turn: 1, phase: 4, activeUid: "a1", log: [] }, log: [] };
  const slash = { name: "杀（普攻）", type: "slash" };
  T("D2 抵杀意与主动发动共用同一标记池",
    A.beforeIntentCost(s, a, slash) === true && a.rageMarks === 0
    && A.canUseBerserkWill(a) === false);
  T("D3 标记上限 10 不会被突破", (() => {
    const u = { uid: "a2", ref: "angelica", rageMarks: 10, hp: 20, maxHp: 40 };
    A.afterDamage({ battle: { log: [] }, log: [] }, u, { uid: "e0" }, slash, 1,
      { damage: { scheduleAfterDamage: fn => fn() } });
    return u.rageMarks === 10;
  })());
}

// E 静态文案与角色表
{
  const lines = read("battle-line-data.js") + read("new-character-line-data.js");
  T("E1 两个合并技能的台词都在表内",
    /"狂战意志": "游戏结束了，看我全力进攻。"/.test(lines)
    && !/"狂战意志": "接下来，老子使出全力了！"/.test(lines)
    && /"淫气改造": "全部！全部进来！！"/.test(lines));
  const notice = read("update-notice-recent.js");
  T("E2 今日公告写明两次删除与合并",
    /删除独立主动技【猩红暴走】/.test(notice)
    && /删除独立技能【改造副作用】/.test(notice));
  const extra = read("data-characters-extra.js");
  const angelica = extra.slice(extra.indexOf('id: "angelica"'), extra.indexOf('id: "luka"'));
  T("E3 安洁莉卡只剩 2 个技能且狂战意志是主动技",
    (angelica.match(/\{\s*name:\s*"[^"]+",\s*type:\s*"(passive|active)"/g) || []).length === 2
    && /name: "狂战意志", type: "active"/.test(angelica));
  const data = read("data-new-characters.js");
  const noa = data.slice(data.indexOf('id: "noa"'), data.indexOf('id: "gerda"'));
  T("E4 诺亚技能表只剩【淫气改造】且含三项并入效果",
    (noa.match(/\{\s*name:\s*"[^"]+",\s*type:\s*"(passive|active)"/g) || []).length === 1
    && /结束阶段，你对我方其他所有存活男性角色/.test(noa)
    && /若队伍中没有存活的男性角色/.test(noa));
}

console.log(`merge-skill side-effects: ${pass} PASS / ${reds.length} FAIL${REVERT ? ` (REVERT=${REVERT})` : ""}`);
if (reds.length) {
  if (!REVERT) reds.forEach(name => console.log("  RED " + name));
  process.exit(1);
}
