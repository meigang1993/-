// 天日国鹰7研究所 · 4 只普通怪严格检查（真实模块链路）
// 覆盖：数据表 / 随机池 1~4 + 同怪 4 次 ABCD / 四个被动技能 / 接线断言 / 公告与立绘
// REVERT=<组> 撤掉对应源码守卫并重载，要求该组精准打红、无关段保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const raw = name => fs.readFileSync(path.join(DIR, name), "utf8");
const anyRaw = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const REPL = {
  assault: ["tenri-assault-skills.js", "card._tenriAssaultBonus = extra;", ""],
  guard: ["tenri-guard-skills.js", "    return guard;", "    return null;"],
  railgun: ["tenri-railgun-skills.js", "card._tenriRailgun = true;", ""],
  revive: ["tenri-ghoul-revival.js", "unit.tenriRevivePending = true;", ""],
  pool: ["dungeon-enemies.js", "  function tenriEnemies(pool, diff, type, state) {\n    const count = rand(1, 4, state),", "  function tenriEnemies(pool, diff, type, state) {\n    const count = 1,"],
  data: ["data-tenri-institute-enemies.js", "hp: 240, attack: 27,", "hp: 240, attack: 1,"],
  notice: ["update-notice-recent.js", "【天日国鹰7研究所】怪物设计落地（4 只普通怪）", "【天日国鹰7研究所】占位"],
  wire: ["battle-combat.js", "    target = window.TenriInstituteSkills?.redirectTarget?.(state, actor, target, card) ?? target;", ""],
};
const EXPECT_GROUPS = {
  assault: ["C"], guard: ["D"], railgun: ["E"], revive: ["F"],
  pool: ["B"], data: ["A"], notice: ["G"], wire: ["G"],
};
const patched = name => {
  const text = raw(name);
  if (!REVERT || !REPL[REVERT] || REPL[REVERT][0] !== name) return text;
  const [, from, to] = REPL[REVERT];
  if (!text.includes(from)) throw new Error(`REVERT=${REVERT} 目标未命中：${from}`);
  return text.replace(from, to);
};
const load = name => vm.runInThisContext(patched(name), { filename: name });

global.window = global;
const logLines = [];
window.BattleLog = { add: (_s, t) => logLines.push(String(t)) };
window.BattleLines = { skill: () => {} };
window.MieryulaTimeStop = { isSkillDisabled: u => !!u?.__stopped };
window.BattleHpValue = { maxHp: u => u.maxHp || u.stats?.maxHp || u.hp };
window.BattleSystem = { pushFloat: () => {}, draw: () => [] };
window.EnemySkills = { onHeal: () => {} };
window.CardUtils = null;
window.GameDataCards = { cardCodex: [], baseDeck: [], eliteCards: [] };
load("card-utils.js");
const U = window.CardUtils;

let forcedCount = 4;
window.GameRandom = {
  sample: list => (Array.isArray(list) && list.length ? list[0] : null),
  int: min => (REVERT === "pool" ? 1 : forcedCount || min),
  chance: () => false, value: () => 0.5, id: () => "id",
};
load("data-tenri-institute-enemies.js");
const POOL = window.GameDataTenriInstituteEnemies;
window.GameData = {
  difficulties: { normal: { enemy: { normal: { hp: 100, power: 100, speed: 100 } } } },
  enemies: { tenri_institute: POOL },
  scaleEnemyStats: base => ({ ...base, maxHp: base.hp }),
};
window.RelicSystem = { enemyRelics: () => [] };
load("dungeon-enemies.js");
[
  "tenri-institute-common.js", "tenri-assault-skills.js", "tenri-guard-skills.js",
  "tenri-railgun-skills.js", "tenri-ghoul-revival.js", "tenri-institute-skills.js",
].forEach(load);
const T = window.TenriInstituteSkills;

const results = [];
const check = (group, name, ok, detail = "") => results.push({ group, name, ok: !!ok, detail });
const slash = (name, extra = {}) => ({ name, type: "slash", suit: "♠", power: 0, scale: "attack", ...extra });
const unit = (id, side, hp, hand = []) => ({ id, ai: id, name: id, side, hp, maxHp: hp, hand, stats: { attack: 10 }, skills: [] });
const state = (enemies, allies) => ({ battle: { enemies, allies, animQueue: [], hitFxId: 1, _damageDepth: 1 }, log: [] });

// ---------- A 数据表 ----------
const byId = Object.fromEntries(POOL.map(e => [e.id, e]));
const expect = {
  tenri_assault: [240, 27, 21, 38, 2, 4, 3, 4],
  tenri_guard: [300, 22, 20, 32, 1, 4, 3, 5],
  tenri_railgun: [200, 26, 24, 40, 2, 3, 4, 5],
  tenri_ghoul: [180, 28, 26, 42, 2, 3, 3, 4],
};
check("A", "A1 恰好 4 只且 id/type 正确", POOL.length === 4
  && POOL.every(e => Object.prototype.hasOwnProperty.call(expect, e.id) && e.type === "normal"));
for (const [id, vals] of Object.entries(expect)) {
  const e = byId[id];
  const got = [e.hp, e.attack, e.magic, e.speed, e.bloodlust, e.handLimit, e.drawPerTurn, e.initialDraw];
  check("A", `A2 ${id} 八项基础值`, JSON.stringify(got) === JSON.stringify(vals), `got=${got}`);
}
check("A", "A3 每只一条被动技能且文案同步", POOL.every(e => e.skills?.length === 1
  && e.skills[0].type === "passive" && e.skills[0].text.includes("锁定技")
  && !e.skills[0].text.includes(["杀","意"].join("")) && !e.skills[0].text.includes("当前实现")));
check("A", "A4 无垢食尸鬼性别女 / 四张立绘已落地", byId.tenri_ghoul.gender === "female"
  && POOL.every(e => fs.existsSync(path.join(ROOT, "publish", e.art.replace(/^\.\//, "")))));
check("A", "A5 数据表注释写明淫气与基础折算口径", /淫气上限/.test(raw("data-tenri-institute-enemies.js"))
  && /2\+N/.test(raw("data-tenri-institute-enemies.js")));

// ---------- B 随机池（复用其它副本范式） ----------
forcedCount = 4;
const group4 = window.DungeonEnemyGroups.enemiesFor(
  { missionId: "tenri_institute", difficultyId: "normal" }, "normal", {});
check("B", "B1 普通节点可抽 4 只", group4.length === 4, `len=${group4.length}`);
check("B", "B2 允许 4 只相同怪且 ABCD 编号", new Set(group4.map(e => e.id)).size === 1
  && group4.map(e => e.label).join("") === "ABCD", `labels=${group4.map(e => e.label)}`);
forcedCount = 1;
const group1 = window.DungeonEnemyGroups.enemiesFor(
  { missionId: "tenri_institute", difficultyId: "normal" }, "normal", {});
check("B", "B3 也可只出 1 只", group1.length === 1 && group1[0].label === "");
check("B", "B4 精英/首领节点同样只出研究所怪", ["elite", "boss"].every(type => {
  const g = window.DungeonEnemyGroups.enemiesFor(
    { missionId: "tenri_institute", difficultyId: "normal" }, type, {});
  return g.length >= 1 && g.every(e => String(e.id).startsWith("tenri_"));
}));
check("B", "B5 随机池接线为 tenriEnemies 专属分支",
  /missionId === "tenri_institute"\) return tenriEnemies/.test(raw("dungeon-enemies.js"))
  && /pickRepeatable\(normalPool, picked, state\)/.test(raw("dungeon-enemies.js")));

// ---------- C 不可挡突袭 ----------
{
  const actor = unit("tenri_assault", "enemy", 260, [slash("杀"), slash("杀"), slash("杀")]);
  const target = unit("p1", "ally", 100, [slash("杀")]);
  const s = state([actor], [target]);
  const card = slash("杀（普攻）");
  T.beforeKillTargeted(s, actor, target, card);
  const amount = T.modifyAttackAmount(s, actor, target, card, 10);
  check("C", "C1 杀牌 3 对 1：不可响应 + 伤害 ×3", card.ignoreResponse === true
    && card._tenriAssaultBonus === 2 && amount === 30, `amount=${amount}`);
}
{
  const actor = unit("tenri_assault", "enemy", 260, [slash("杀")]);
  const target = unit("p1", "ally", 100, [slash("杀"), slash("杀")]);
  const s = state([actor], [target]);
  const card = slash("杀（普攻）");
  T.beforeKillTargeted(s, actor, target, card);
  check("C", "C2 不多于目标时不触发", !card.ignoreResponse
    && T.modifyAttackAmount(s, actor, target, card, 10) === 10);
}
check("C", "C3 虚拟杀 / 群体杀 / 时停不触发", (() => {
  const mk = (extra = {}, stopActor = false) => {
    const a = unit("tenri_assault", "enemy", 260, [slash("杀"), slash("杀")]);
    if (stopActor) a.__stopped = true;
    const t = unit("p1", "ally", 100, []);
    const c = slash("杀（普攻）", extra);
    T.beforeKillTargeted(state([a], [t]), a, t, c);
    return c;
  };
  return !mk({ virtual: true }).ignoreResponse && !mk({ sweep: true }).ignoreResponse
    && !mk({}, true).ignoreResponse;
})());

// ---------- D 守护后方 ----------
{
  const guard = unit("tenri_guard", "enemy", 300);
  const victim = unit("victim", "enemy", 100);
  const s = state([guard, victim], [unit("p1", "ally", 100)]);
  const got = T.redirectTarget(s, unit("p1", "ally", 100), victim, slash("杀（普攻）"));
  check("D", "D1 其他我方角色被指定 → 转移给防爆队", got === guard);
  check("D", "D2 防爆队自身被指定 → 不再转移", T.redirectTarget(s, unit("p1", "ally", 100), guard, slash("杀（普攻）")) === null);
  check("D", "D3 虚拟杀 / 群体杀 / 时停不转移", (() => {
    const c1 = slash("杀（普攻）", { virtual: true }), c2 = slash("杀（普攻）", { sweep: true });
    guard.__stopped = true;
    const c3 = T.redirectTarget(s, unit("p1", "ally", 100), victim, slash("杀（普攻）"));
    guard.__stopped = false;
    return T.redirectTarget(s, unit("p1", "ally", 100), victim, c1) === null
      && T.redirectTarget(s, unit("p1", "ally", 100), victim, c2) === null && c3 === null;
  })());
}

// ---------- E 极速射线 ----------
{
  const actor = unit("tenri_railgun", "enemy", 220);
  const s = state([actor], [unit("p1", "ally", 100)]);
  const group = slash("机枪扫杀", { sweep: true });
  T.beforeCardPlayed(s, actor, group);
  check("E", "E1 全体实体牌不可响应 + 翻倍", group.ignoreResponse === true
    && T.modifyIncomingDamage(s, actor, null, 10, group) === 20);
  const single = slash("杀（普攻）");
  T.beforeCardPlayed(s, actor, single);
  check("E", "E2 单体实体牌不触发", !single.ignoreResponse
    && T.modifyIncomingDamage(s, actor, null, 10, single) === 10);
  const virt = slash("机枪扫杀", { sweep: true, virtual: true });
  T.beforeCardPlayed(s, actor, virt);
  check("E", "E3 虚拟牌 / 技能载荷不触发", !virt.ignoreResponse);
}

// ---------- F 快速复生 ----------
{
  const mate = unit("mate", "enemy", 100);
  const ghoul = unit("tenri_ghoul", "enemy", 0);
  ghoul.maxHp = 200;
  const s = state([mate, ghoul], [unit("p1", "ally", 100)]);
  check("F", "F1 死亡且有队友 → 待复活", T.preventDeath(s, ghoul) === true
    && T.pendingRevival(ghoul) === true && ghoul.statuses.includes("待复活"));
  check("F", "F2 下个回合开始满血复活", T.beginTurn(s, ghoul) === true
    && ghoul.hp === 200 && !T.pendingRevival(ghoul) && !ghoul.statuses.includes("待复活"));
}
{
  const ghoul = unit("tenri_ghoul", "enemy", 0);
  ghoul.maxHp = 200;
  check("F", "F3 队友全灭 / 时停不进入待复活", (() => {
    const s1 = state([ghoul], [unit("p1", "ally", 100)]);
    const a = T.preventDeath(s1, ghoul) === false && !T.pendingRevival(ghoul);
    ghoul.__stopped = true;
    const s2 = state([unit("mate", "enemy", 100), ghoul], []);
    const b = T.preventDeath(s2, ghoul) === false && !T.pendingRevival(ghoul);
    ghoul.__stopped = false;
    return a && b;
  })());
}
check("F", "F4 免死链接入全局 pendingRevival / preventDeath / beginTurn",
  /TenriInstituteSkills\?\.pendingRevival/.test(raw("sakura-risa-skills.js"))
  && /TenriInstituteSkills\?\.preventDeath/.test(raw("sakura-risa-skills.js"))
  && /TenriInstituteSkills\?\.beginTurn/.test(raw("battle-turn-start.js")));

// ---------- G 接线 / 公告 / 资源 ----------
const wiring = [
  ["battle-combat.js", "TenriInstituteSkills?.redirectTarget"],
  ["battle-combat.js", "TenriInstituteSkills?.beforeCardPlayed"],
  ["enemy-kill-hooks.js", "TenriInstituteSkills?.beforeKillTargeted"],
  ["battle-combat-attack-values.js", "TenriInstituteSkills?.modifyAttackAmount"],
  ["battle-damage-hit.js", "TenriInstituteSkills?.modifyIncomingDamage"],
  ["data-tenri-institute.js", "GameDataTenriInstituteEnemies"],
  ["data-combat-roles.js", "GameDataTenriInstituteEnemies"],
  ["runtime-globals.js", "TenriAssaultSkills"],
];
wiring.forEach(([f, text], i) => check("G", `G${i + 1} ${f} 接线`, patched(f).includes(text)));
const bundles = JSON.parse(anyRaw("tools/publish-bundles.json"));
const all = Object.values(bundles).flat();
check("G", "G9 bundle 清单含 6 个新模块 + 专属数据表",
  ["data-tenri-institute-enemies.js", "tenri-institute-common.js", "tenri-assault-skills.js",
    "tenri-guard-skills.js", "tenri-railgun-skills.js", "tenri-ghoul-revival.js",
    "tenri-institute-skills.js"].every(f => all.includes(f)));
check("G", "G10 公告写入本期怪物设计",
  patched("update-notice-recent.js").includes("【天日国鹰7研究所】怪物设计落地（4 只普通怪）"));
const OLD_TERM = ["杀", "意"].join("");
check("G", "G11 新增文案无资源旧称字面", !(patched("data-tenri-institute-enemies.js")
  + patched("update-notice-recent.js")).includes(OLD_TERM));

// ---------- 汇总 ----------
const failed = results.filter(r => !r.ok);
if (REVERT) {
  const want = EXPECT_GROUPS[REVERT] || [];
  const own = failed.filter(r => want.includes(r.group)).length;
  const other = failed.filter(r => !want.includes(r.group)).length;
  console.log(`REVERT=${REVERT} ${own > 0 && other === 0 ? "OK" : "IMPRECISE"} own=${own} other=${other}`);
  failed.forEach(r => console.log(`  ❌ ${r.group} ${r.name} ${r.detail}`));
  process.exit(own > 0 && other === 0 ? 0 : 1);
}
results.forEach(r => console.log(`  ${r.ok ? "✅" : "❌"} ${r.group} ${r.name}${r.detail ? " — " + r.detail : ""}`));
console.log(`RESULT ${results.length - failed.length}/${results.length}`);
process.exit(failed.length ? 1 : 0);
