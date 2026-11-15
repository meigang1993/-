// 【狂战意志】合并【猩红暴走】严格检查：技能表 / 主动技入口 / 一次性登记表 /
// 效果数值 / 旧档兼容 / 被动原效果 / 公告与文案残留 / 孤立卡图。
// REVERT=merge|once|legacy|registry|notice 为源码级反向验证，撤掉对应改动后应精准打红。
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
function patched(file) {
  let s = read(file);
  const hit = (before, after, tag) => {
    assert.notStrictEqual(after, before, `REVERT=${REVERT} must hit ${tag}`);
    return after;
  };
  if (REVERT === "merge" && file === "data-characters-extra.js") {
    return hit(s, s
      .replace('{ name: "狂战意志", type: "active", icon: "⚔️"',
        '{ name: "狂战意志", type: "passive", icon: "⭐"')
      .replace('出牌阶段限一次，你可以弃置所有“狂战”标记，摸等量的牌，然后回复X点生命值，X为你以此法弃置的“狂战”标记数×你生命值上限的10%。", card:',
        '", card:'), "merge into active skill");
  }
  if (REVERT === "once" && file === "angelica-luka-skills.js") {
    return hit(s, s.replace("if (!canUseBerserkWill(actor)) return true;",
      "if (!(actor.rageMarks || 0)) return true;"), "once-per-turn guard");
  }
  if (REVERT === "legacy" && file === "angelica-luka-skills.js") {
    return hit(s, s.replace(" && !actor.usedCrimsonRampage && (actor.rageMarks",
      " && (actor.rageMarks"), "legacy save field");
  }
  if (REVERT === "registry" && file === "skill-once-per-turn.js") {
    return hit(s, s.replace('    ["berserkWill", actor => !window.AngelicaLukaSkills?.canUseBerserkWill?.(actor)],\n', ""),
      "once-per-turn registry");
  }
  if (REVERT === "notice" && file === "update-notice-recent.js") {
    const needle = "        \"技能调整【狂战意志】（安洁莉卡）：删除独立主动技【猩红暴走】";
    const start = s.indexOf(needle);
    assert.notStrictEqual(start, -1, "notice entry must exist");
    const end = s.indexOf("\n", start);
    return hit(s, s.slice(0, start) + s.slice(end + 1), "notice entry");
  }
  return s;
}
function src(file) { return patched(file); }

// ── A 静态：技能表 / 入口 / 登记表 / 文案 / 资源 ─────────────────────────────
const data = src("data-characters-extra.js");
T("A1 角色表不再有独立的猩红暴走技能条目", !/name:\s*"猩红暴走"/.test(data));
T("A2 狂战意志改为主动技", /name:\s*"狂战意志",\s*type:\s*"active"/.test(data));
T("A3 主动卡标记改为 berserkWill，旧标记清零",
  /card:\s*\{[^\n]*berserkWill:\s*true/.test(data) && !/crimsonRampage:\s*true/.test(data));
T("A4 描述同时含原锁定技与合并后的主动效果",
  /锁定技，当你造成或受到伤害后/.test(data)
  && /出牌阶段限一次，你可以弃置所有“狂战”标记，摸等量的牌/.test(data)
  && /生命值上限的10%/.test(data));
{
  const block = data.slice(data.indexOf('id: "angelica"'), data.indexOf('id: "luka"'));
  const names = [...block.matchAll(/\{\s*name:\s*"([^"]+)",\s*type:\s*"(passive|active|trigger)"/g)]
    .map(m => m[1]);
  T("A5 安洁莉卡只剩力量爆发 + 狂战意志两个技能",
    names.length === 2 && names[0] === "力量爆发" && names[1] === "狂战意志", names);
}
const access = src("character-skill-access.js");
T("A6 主动技入口登记狂战意志且旧技能清零",
  /flags:\s*\["berserkWill"\],\s*name:\s*"狂战意志"/.test(access)
  && !/crimsonRampage/.test(access) && !/猩红暴走/.test(access));
const registry = src("skill-once-per-turn.js");
T("A7 一次性登记表 SPECIAL 含 berserkWill 且旧标记清零",
  /\["berserkWill",\s*actor => !window\.AngelicaLukaSkills\?\.canUseBerserkWill\?\.\(actor\)\]/.test(registry)
  && !/crimsonRampage/.test(registry));
const turnState = src("battle-turn-state.js");
T("A8 回合开始重置 usedBerserkWill 并清理旧档字段",
  /unit\.usedBerserkWill\s*=\s*false/.test(turnState)
  && /unit\.usedCrimsonRampage\s*=\s*false/.test(turnState));
const consumers = ["battle-card-playability.js", "battle-ai-skill-evaluation.js"]
  .map(file => [file, src(file)]);
T("A9 可打出性与 AI 决策都改用 berserkWill",
  consumers.every(([, s]) => /card\.berserkWill/.test(s) && !/card\.crimsonRampage/.test(s)));
const cardArt = src("card-art.js");
T("A10 卡图只保留狂战意志，孤立卡图文件已删除",
  /"狂战意志":\s*"\.\/assets\/generated\/cards\/skill-art-berserker-will/.test(cardArt)
  && !/"猩红暴走"/.test(cardArt)
  && !fs.existsSync(path.join(__dirname, "../publish/assets/generated/cards/skill-art-crimson-rampage.ba43cf6a.webp")));
const linesData = src("battle-line-data.js");
T("A11 台词表删除猩红暴走专属台词，保留狂战意志",
  !/"猩红暴走"/.test(linesData) && /"狂战意志":/.test(linesData));
const notice = src("update-notice-recent.js");
T("A12 当前公告写明删除与合并口径",
  /删除独立主动技【猩红暴走】/.test(notice) && /由被动技改为主动技/.test(notice));
const fx = src("angelica-berserker-skin-fx.js");
T("A13 皮肤特效导出改为 berserkWill",
  /function berserkWill\(state, actor, count\)/.test(fx)
  && /rageTrail, berserkWill, sync, cancel/.test(fx)
  && !/, crimsonRampage,/.test(fx));
{
  // store-repairs.js 的旧档迁移必须识别旧技能卡标记才能迁移死卡，属合理例外。
  const skip = new Set(["update-notice-recent.js", "update-notice-archive.js",
    "store-repairs.js"]);
  const hits = fs.readdirSync(ROOT).filter(f => f.endsWith(".js") && !skip.has(f))
    .filter(f => src(f).includes("猩红暴走"));
  T("A14 源码中文「猩红暴走」残留 0（公告历史除外）", hits.length === 0, hits);
  // 本检查文件、QA 目录与合并复查测试都在描述「合并猩红暴走 / 旧档迁移」，属合理例外。
  const exempt = new Set(["test-berserk-will-merge-audit.js", "qa-test-catalog.js",
    "test-angelica-merge-recheck.js", "test-merge-skill-side-effects.js",
    "test-merge-skill-final-recheck.js"]);
  const toolHits = ["tools", "tests"].flatMap(dir => {
    const base = path.join(__dirname, "..", dir);
    return fs.readdirSync(base).filter(f => f.endsWith(".js") && !exempt.has(f))
      .filter(f => fs.readFileSync(path.join(base, f), "utf8").includes("猩红暴走"));
  });
  T("A15 tools/tests 中文「猩红暴走」残留 0", toolHits.length === 0, toolHits);
}

// ── B 行为：真实模块装配 ────────────────────────────────────────────────────
const fxCalls = [];
const win = {
  BattleLog: { add: (state, text) => (state.log ||= []).push(text) },
  BattleLines: { skill: (state, _unit, name) => (state.lines ||= []).push(name) },
  BattleHpValue: {
    healCap: (unit, amount) => Math.max(0, Math.min(amount, (unit.maxHp || 0) - (unit.hp || 0))),
    applyHeal: (unit, amount) => { unit.hp += amount; },
  },
  BattleDrawFeedback: { action: (_unit, _want, drawn) => `摸${drawn}张牌` },
  AngelicaBerserkerSkinFX: { berserkWill: (_s, _a, n) => fxCalls.push(n) },
  CardUtils: { isKillCard: card => card?.type === "slash" },
};
function load(file) {
  const ctx = { window: win, Math, Number, Array, Object, Set, Map, JSON, String, RegExp, console };
  vm.runInNewContext(src(file), ctx, { filename: file });
}
["data-characters-extra.js", "angelica-luka-skills.js",
  "skill-once-per-turn.js", "character-skill-access.js"].forEach(load);

const angelica = win.GameDataCharactersExtra.find(unit => unit.id === "angelica");
const willSkill = angelica.skills.find(skill => skill.name === "狂战意志");
const skillCard = Object.assign({ _skill: true }, willSkill.card);
function actor(extra = {}) {
  return Object.assign({
    uid: "a0", name: "安洁莉卡", ref: "angelica", side: "ally", hp: 20, maxHp: 40,
    rageMarks: 4, hand: [], skills: angelica.skills,
  }, extra);
}
function battle(a, enemies = [{ uid: "e0", side: "enemy", hp: 10 }]) {
  return { allies: [a], enemies, activeUid: a.uid, phase: 4, turn: 1 };
}
function state(b) { return { battle: b, log: [], lines: [] }; }

{
  const a = actor();
  T("B1 狂战意志主动卡由角色技能表授权可打出",
    win.CharacterSkillAccess.canActor(battle(a), a, skillCard));
}
{
  const a = actor();
  const R = win.SkillOncePerTurn;
  T("B2 登记表：未发动不置灰、已发动置灰",
    !R.blocked(a, skillCard, battle(a))
    && R.blocked(Object.assign(a, { usedBerserkWill: true }), skillCard, battle(a)));
}
{
  const a = actor();
  const s = state(battle(a));
  const draws = [];
  const deps = { draw: (_unit, n) => { draws.push(n); return n; }, pushFloat() {} };
  const ret = win.AngelicaLukaSkills.handleSpecialCard(s, a, a, skillCard, deps, { pushFloat() {} });
  T("B3 主动发动：弃全部标记 / 摸等量牌 / 回血 标记数×上限10% / 台词与特效",
    ret === true && a.rageMarks === 0 && draws.length === 1 && draws[0] === 4
    && a.hp === 36 && a.usedBerserkWill === true && fxCalls.includes(4)
    && s.lines.includes("狂战意志") && s.log.some(t => t.includes("发动狂战意志")),
    { marks: a.rageMarks, draws, hp: a.hp, log: s.log, lines: s.lines });
  const hpBefore = a.hp;
  a.rageMarks = 3;
  win.AngelicaLukaSkills.handleSpecialCard(s, a, a, skillCard, deps, { pushFloat() {} });
  T("B4 出牌阶段限一次：二次发动不生效",
    a.rageMarks === 3 && a.hp === hpBefore && draws.length === 1,
    { marks: a.rageMarks, hp: a.hp, draws });
}
{
  const a = actor({ rageMarks: 0 });
  const s = state(battle(a));
  const draws = [];
  win.AngelicaLukaSkills.handleSpecialCard(s, a, a, skillCard,
    { draw: (_u, n) => { draws.push(n); return n; } }, { pushFloat() {} });
  T("B5 无狂战标记时不可发动，也不摸牌不回血",
    !win.AngelicaLukaSkills.canUseBerserkWill(a)
    && a.hp === 20 && draws.length === 0 && !a.usedBerserkWill);
}
{
  const a = actor({ hp: 40, rageMarks: 2 });
  const s = state(battle(a));
  const draws = [];
  win.AngelicaLukaSkills.handleSpecialCard(s, a, a, skillCard,
    { draw: (_u, n) => { draws.push(n); return n; } }, { pushFloat() {} });
  T("B6 满血时仍弃标记摸牌，但不谎报恢复",
    a.rageMarks === 0 && a.hp === 40 && draws[0] === 2
    && s.log.some(t => t.includes("生命已满，未恢复生命")));
}
{
  const old = { ref: "angelica", rageMarks: 3, usedCrimsonRampage: true };
  T("B7 旧存档 usedCrimsonRampage 读档后本回合仍受限",
    !win.AngelicaLukaSkills.canUseBerserkWill(old));
}
{
  const a = actor({ rageMarks: 0 });
  const s = state(battle(a));
  win.AngelicaLukaSkills.afterDamage(s, a, { uid: "e0" },
    { name: "杀（普攻）", type: "slash" }, 3,
    { draw() {}, damage: { scheduleAfterDamage: fn => fn() } });
  T("B8a 原锁定技保留：造成伤害后获得 1 枚狂战标记", a.rageMarks === 1, { marks: a.rageMarks });
  const ret = win.AngelicaLukaSkills.beforeIntentCost(s, a, { name: "杀（普攻）", type: "slash" });
  T("B8b 原锁定技保留：实体杀可弃 1 枚标记代替杀意",
    ret === true && a.rageMarks === 0 && s.log.some(t => t.includes("消耗1枚狂战标记")),
    { ret, marks: a.rageMarks });
}

console.log(`berserk-will-merge audit: ${pass} PASS / ${reds.length} FAIL${REVERT ? ` (REVERT=${REVERT})` : ""}`);
if (reds.length) {
  if (!REVERT) reds.forEach(name => console.log("  RED " + name));
  process.exit(1);
}
