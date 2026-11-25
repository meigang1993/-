// 天日国鹰7研究所 · 2026-11-25 第二轮复查
// 覆盖：① 两处文案/实现差异按新稿对齐 ② 守护后方目标转移后的出牌动画错位
// ③ 研究所临时/占位怪物检查 ④ 上轮 3 个 BUG 与 AI 接线回归。
// REVERT=<组> 对真实源码替换后重载，要求对应组精准打红、其它组保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const anyRaw = rel => fs.readFileSync(path.join(ROOT, rel), "utf8");
const raw = n => fs.readFileSync(path.join(DIR, n), "utf8");

const REPL = {
  // 把守护后方收窄回「实体单体杀」
  guardScope: ["tenri-guard-skills.js",
    "    if (!U.isSingleKillCard?.(card) || card?.type === \"skill\") return null;",
    "    if (!U?.isEntitySingleKill?.(card)) return null;"],
  // 撤掉技能载荷排除
  guardSkill: ["tenri-guard-skills.js",
    "    if (!U.isSingleKillCard?.(card) || card?.type === \"skill\") return null;",
    "    if (!U.isSingleKillCard?.(card)) return null;"],
  // 把队友判定加回死亡瞬间
  deathCheck: ["tenri-ghoul-revival.js",
    "    if (c.stopped(unit)) return false;",
    "    if (c.stopped(unit) || !teamAlive(state, unit)) return false;"],
  // 撤掉复活瞬间的队友判定
  reviveCheck: ["tenri-ghoul-revival.js",
    "    if (c.stopped(unit) || !teamAlive(state, unit)) {",
    "    if (c.stopped(unit)) {"],
  // 胜负兜底失效
  hold: ["tenri-ghoul-revival.js",
    "    return (team || []).some(u => u !== unit && u.hp > 0);",
    "    return true;"],
  // 撤掉出牌动画的转移预测
  flight: ["battle-effect-play.js",
    "    const targetUid = guardUid || rawTargetUid;",
    "    const targetUid = rawTargetUid;"],
  // 让纯预测函数产生副作用（写日志）
  plannedSideEffect: ["tenri-guard-skills.js",
    "  function plannedTarget(state, actor, target, card) {\n    const c = C();",
    "  function plannedTarget(state, actor, target, card) {\n    const c = C();\n    c?.log?.(state, \"SIDE_EFFECT\");"],
  // 往怪物池注入一只临时怪
  temp: ["data-tenri-institute-enemies.js",
    "window.GameDataTenriInstituteEnemies = [",
    "window.GameDataTenriInstituteEnemies = [\n  { id: \"temp_placeholder\", name: \"临时占位怪\", type: \"normal\" },"],
};
const EXPECT = {
  guardScope: ["A"], guardSkill: ["A"], deathCheck: ["A"],
  reviveCheck: ["A"], hold: ["A"], flight: ["B"],
  plannedSideEffect: ["B"], temp: ["C"],
};
const patched = n => {
  let s = raw(n);
  const r = REPL[REVERT];
  if (r && r[0] === n) {
    if (!s.includes(r[1])) throw new Error(`REVERT=${REVERT} 目标未命中: ${r[1].slice(0, 70)}`);
    s = s.replace(r[1], r[2]);
  }
  return s;
};
const load = n => vm.runInThisContext(patched(n), { filename: n });

const results = [];
const check = (g, n, ok, d = "") => results.push({ g, n, ok: !!ok, d });

// ---------- 真实模块环境 ----------
global.window = global;
const logs = [];
const lines = [];
window.BattleLog = { add: (_s, t) => logs.push(String(t)) };
window.BattleLines = { skill: (_s, a, n) => lines.push(String(n)) };
window.MieryulaTimeStop = { isSkillDisabled: u => !!u?.__stopped };
window.BattleHpValue = {
  maxHp: u => u.maxHp || u.stats?.maxHp || u.hp,
  applyDamage: (u, n) => { u.hp = Math.max(0, u.hp - n); return u.hp; },
};
window.BattleSystem = { pushFloat: () => {}, draw: () => [], active: () => null };
window.EnemySkills = { onHeal: () => {} };
window.GameDataCards = { cardCodex: [], baseDeck: [], eliteCards: [] };
window.GameRandom = { sample: l => (Array.isArray(l) && l.length ? l[0] : null), value: () => .5, id: () => "id" };
window.SakuraRisaCombatSkills = () => ({});
window.SakuraRisaLifecycleSkills = () => ({});
window.RelicSystem = { hasEquipped: () => false };
[
  "card-utils.js", "tenri-institute-common.js",
  "tenri-assault-skills.js", "tenri-guard-skills.js",
  "tenri-railgun-skills.js", "tenri-ghoul-revival.js",
  "tenri-institute-skills.js", "battle-card-cleanup.js",
  "battle-damage-utils.js", "sakura-risa-skills.js",
].forEach(load);

const U = window.CardUtils;
const T = window.TenriInstituteSkills;
const G = window.TenriGuardSkills;
const R = window.SakuraRisaSkills;
const slash = (name, extra = {}) => ({ name, type: "slash", suit: "♠", ...extra });
const unit = (ai, side, hp, extra = {}) => ({
  uid: ai + "_" + Math.random().toString(36).slice(2), ai, id: ai, side,
  hp, maxHp: hp, hand: [], stats: {}, statuses: [], skills: [], block: 0, ...extra,
});
const state = (es, as) => ({ battle: { enemies: es, allies: as } });
const setState = s => { window.state = s; };

// ---------- A 两处文案/实现差异按新稿对齐 ----------
{
  const guard = unit("tenri_guard", "enemy", 300);
  const victim = unit("victim", "enemy", 100);
  const atk = unit("p1", "ally", 100);
  const s = state([guard, victim], [atk]);
  const entity = slash("杀（普攻）");
  const virtual = slash("杀（普攻）", { virtual: true });
  const converted = { ...slash("刺杀"), convertedFrom: "杀（普攻）", _entityConversion: true };
  const group = slash("杀（普攻）", { sweep: true });
  const payload = { name: "锁魂镰刀杀", type: "skill" };
  const pending = slash("杀（普攻）", { _pendingDraw: true });
  check("A", "A1 新稿「单体【杀】牌」：实体 / 虚拟 / 转换单体杀均转移",
    T.redirectTarget(s, atk, victim, entity) === guard
    && T.redirectTarget(s, atk, victim, virtual) === guard
    && T.redirectTarget(s, atk, victim, converted) === guard);
  check("A", "A2 群体杀 / 技能伤害载荷 / 待摸牌 / 我方目标 / 时停 → 不转移", (() => {
    const ally = unit("p2", "ally", 100);
    guard.__stopped = true;
    const stopped = T.redirectTarget(s, atk, victim, slash("杀（普攻）"));
    guard.__stopped = false;
    return [group, payload, pending].every(c =>
      T.redirectTarget(s, atk, victim, c) === null)
      && T.redirectTarget(s, atk, ally, entity) === null
      && stopped === null;
  })());
  check("A", "A3 守护后方实现判据不再是 isEntitySingleKill（源码级）",
    /isSingleKillCard/.test(patched("tenri-guard-skills.js"))
    && !/isEntitySingleKill/.test(patched("tenri-guard-skills.js")));
}
{
  // 死亡瞬间队友全灭：仍进入待复活（新稿只在「下一个回合开始时」判）
  const gh = unit("tenri_ghoul", "enemy", 0, { maxHp: 200 });
  const s0 = state([gh], [unit("p1", "ally", 100)]);
  setState(s0);
  check("A", "A4 死亡瞬间不再判队友存活：全灭也进入待复活",
    T.preventDeath(s0, gh) === true && T.pendingRevival(gh) === true
    && gh.statuses.includes("待复活"));
  check("A", "A5 队友全灭时胜负兜底不阻挡胜利（Avoid 挂起）",
    T.shouldHoldRevival(gh) === false && R.pendingRevival(gh) === false,
    `hold=${T.shouldHoldRevival(gh)} pending=${R.pendingRevival(gh)}`);
  check("A", "A6 胜负链读的是包装后的 pendingRevival（checkEnd 不挂起）",
    /enemies\.some\(e => e\.hp > 0 \|\| window\.SakuraRisaSkills\?\.pendingRevival/.test(
      raw("battle-combat.js"))
    && /TenriInstituteSkills\?\.shouldHoldRevival/.test(raw("sakura-risa-skills.js")));
}
{
  // 有队友：正常待复活 → 下个回合满血复活
  const mate = unit("mate", "enemy", 100);
  const gh = unit("tenri_ghoul", "enemy", 0, { maxHp: 200, visualHp: 0 });
  const s = state([mate, gh], [unit("p1", "ally", 100)]);
  setState(s);
  T.preventDeath(s, gh);
  check("A", "A7 有队友：待复活阻挡胜利，下个回合满血复活",
    T.shouldHoldRevival(gh) === true && R.pendingRevival(gh) === true
    && T.beginTurn(s, gh) === true && gh.hp === 200 && gh.visualHp === 200);
  // 复活瞬间队友全灭：保持阵亡、标记清干净
  const gh2 = unit("tenri_ghoul", "enemy", 0, { maxHp: 200 });
  const mate2 = unit("mate", "enemy", 100);
  const s2 = state([mate2, gh2], [unit("p1", "ally", 100)]);
  setState(s2);
  T.preventDeath(s2, gh2);
  mate2.hp = 0;
  check("A", "A8 复活瞬间队友全灭 → 保持阵亡、清待复活标记",
    T.beginTurn(s2, gh2) === true && gh2.hp === 0
    && !T.pendingRevival(gh2) && !gh2.statuses.includes("待复活"));
  check("A", "A9 时停仍禁止进入待复活",
    (() => {
      const g = unit("tenri_ghoul", "enemy", 0, { maxHp: 200, __stopped: true });
      const st = state([unit("mate", "enemy", 100), g], [unit("p1", "ally", 100)]);
      setState(st);
      return T.preventDeath(st, g) === false && !T.pendingRevival(g);
    })());
  check("A", "A10 preventDeath 内不含 teamAlive、beginTurn 内保留（源码级）",
    (() => {
      const g = patched("tenri-ghoul-revival.js");
      const pd = g.slice(g.indexOf("function preventDeath"), g.indexOf("function shouldHoldRevival"));
      const bt = g.slice(g.indexOf("function beginTurn"), g.indexOf("return { isGhoul"));
      return !pd.includes("teamAlive") && bt.includes("teamAlive");
    })());
}

// ---------- B 新发现：守护后方目标转移后的出牌动画错位 ----------
{
  const guard = unit("tenri_guard", "enemy", 300);
  const victim = unit("victim", "enemy", 100);
  const s = state([guard, victim], [unit("p1", "ally", 100)]);
  const atk = unit("p1", "ally", 100);
  const card = slash("杀（普攻）");
  logs.length = 0; lines.length = 0;
  const predicted = T.plannedTarget(s, atk, victim, card);
  check("B", "B1 plannedTarget 与 redirectTarget 同源且返回同一防爆队",
    predicted === guard && T.redirectTarget(s, atk, victim, card) === guard);
  check("B", "B2 plannedTarget 无副作用（不写战报 / 不播技能台词）",
    logs.length === 1 && lines.length === 1,
    `logs=${logs.length} lines=${lines.length}`);
  const eff = patched("battle-effect-play.js");
  check("B", "B3 出牌动画在 commit 之前用 plannedTarget 修正飞行目标",
    /TenriInstituteSkills\?\.plannedTarget/.test(eff)
    && /const targetUid = guardUid \|\| rawTargetUid;/.test(eff)
    && eff.indexOf("plannedTarget") < eff.indexOf("commitOnce ="));
  // 真实链路：BattleEffectPlay 在飞行前写 _playedFlightDone，飞行落点用
  // 修正后的 targetUid 写 _playedTargetUid；BattleAttackAnimations.markInitial
  // 随后也把同一 uid 记到牌上。三者一致 → reusedFlight(新目标) 命中，不补第二条飞行。
  const flightDone = (c, target) => {
    window.BattleAttackAnimations.markInitial(c, target);
    c._playedFlightDone = true;
    c._playedTargetUid = target.uid;
  };
  check("B", "B4 飞行落点字段用修正后的 targetUid（不补第二条虚拟飞行）",
    /playedSource\._playedTargetUid = targetUid;/.test(eff)
    && (() => {
      flightDone(card, guard);
      return window.BattleAttackAnimations.reusedFlight(card, guard) === true
        && window.BattleAttackAnimations.reusedFlight(card, victim) === false;
    })());
  check("B", "B5 反向：若线仍画向原目标，会补第二条飞行（旧行为确认）",
    (() => {
      const c2 = slash("杀（普攻）");
      flightDone(c2, victim);
      return window.BattleAttackAnimations.reusedFlight(c2, guard) === false;
    })());
}

// ---------- C 研究所临时 / 占位怪物检查 ----------
{
  const data = patched("data-tenri-institute-enemies.js");
  const ids = [...data.matchAll(/id: "([^"]+)"/g)].map(m => m[1]);
  const expected = ["tenri_assault", "tenri_guard", "tenri_railgun", "tenri_ghoul"];
  check("C", "C1 怪物池只有 4 只正式普通怪，无临时/占位 id、无其它副本 id",
    expected.every(id => ids.includes(id)) && ids.length === 4
    && !/临时|占位|placeholder|temporary/i.test(data),
    `ids=${ids.join(",")}`);
  check("C", "C2 三型节点仍从普通池随机（临时顶替方案未移除，如实确认）",
    /if \(run\.missionId === "tenri_institute"\) return tenriEnemies/.test(raw("dungeon-enemies.js"))
    && /function tenriEnemies\(pool, diff, type, state\)[\s\S]{0,320}normalPool = pool\.filter\(e => e\.type === "normal"\)/.test(raw("dungeon-enemies.js"))
    && !/type === "elite"[\s\S]{0,200}tenri/.test(raw("dungeon-enemies.js")));
  check("C", "C3 不会混入新手保护固定怪或其它副本敌人 id",
    !/mechanical_goblin|skeleton_patrol|pursuer_edis|ruins|orc_dungeon/.test(
      raw("data-tenri-institute-enemies.js")));
  check("C", "C4 临时顶替仍在：精英/首领节点不会产出空组（可正常通关）",
    (() => {
      const f = raw("dungeon-enemies.js");
      const seg = f.slice(f.indexOf("function tenriEnemies"), f.indexOf("function ruinsEnemies"));
      return /rand\(1, 4, state\)/.test(seg) && /withLabels\(picked\.map/.test(seg)
        && /scaleEnemy\(e, diff, type\)/.test(seg);
    })());
  check("C", "C5 接入的立绘正好 4 张；素材包里另外 4 张是未接入素材、不是怪物数据",
    (() => {
      const dir = path.join(ROOT, "publish/assets/tenri-enemies");
      const pngs = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => f.endsWith(".png")) : [];
      return pngs.length === 4 && expected.every(id =>
        data.includes(`id: "${id}"`));
    })(), `pngs=${fs.existsSync(path.join(ROOT, "publish/assets/tenri-enemies"))
      ? fs.readdirSync(path.join(ROOT, "publish/assets/tenri-enemies")).filter(f => f.endsWith(".png")).length : 0}`);
  check("C", "C6 入口仍按占位口径锁「未开发完成」（精英/首领待补）",
    /devLocked: true/.test(raw("data-tenri-institute.js"))
    && /devHint: "未开发完成"/.test(raw("data-tenri-institute.js")));
}

// ---------- D 上轮修复与 AI 接线回归 ----------
{
  const cleanup = raw("battle-card-cleanup.js");
  const railgun = raw("tenri-railgun-skills.js");
  const ghoul = patched("tenri-ghoul-revival.js");
  check("D", "D1 上轮 3 个 BUG 修复仍在（标记清理 / 无 sweep 全体牌 / 复活视觉同步）",
    /"_tenriAssaultBonus", "_tenriRailgun"/.test(cleanup)
    && /card\.demonInvasion/.test(railgun)
    && /unit\.visualHp = maxHp/.test(ghoul));
  check("D", "D2 两个伤害出口的归属校验仍在",
    /isAi\(actor, "tenri_assault"\)/.test(raw("tenri-assault-skills.js"))
    && /isAi\(actor, "tenri_railgun"\)/.test(railgun));
  check("D", "D3 AI 模块与 4 条 aiLogic 仍接线、描述仍为新稿",
    /TenriInstituteAI\?\.aiMove/.test(raw("battle-ai.js"))
    && /TenriInstituteAI\?\.aiHand/.test(raw("battle-ai.js"))
    && (raw("data-tenri-institute-enemies.js").match(/aiLogic: "/g) || []).length === 4
    && /锁定技，当我方其他角色成为单体【杀】牌的目标时/.test(
      raw("data-tenri-institute-enemies.js")));
}

const failed = results.filter(r => !r.ok);
if (REVERT) {
  const want = EXPECT[REVERT] || [];
  const own = failed.filter(r => want.includes(r.g)).length;
  const other = failed.filter(r => !want.includes(r.g)).length;
  console.log(`REVERT=${REVERT} ${own > 0 && other === 0 ? "OK" : "IMPRECISE"} own=${own} other=${other}`);
  failed.forEach(r => console.log(`  ❌ ${r.g} ${r.n} ${r.d}`));
  process.exit(own > 0 && other === 0 ? 0 : 1);
}
results.forEach(r => console.log(`  ${r.ok ? "✅" : "❌"} ${r.g} ${r.n}${r.d ? " — " + r.d : ""}`));
console.log(`RESULT ${results.length - failed.length}/${results.length} · 反向组 ${Object.keys(REPL).join("/")}`);
process.exit(failed.length ? 1 : 0);
