// 天日国鹰7研究所 · 4 个新怪技能「实际效果」严格检查
// 与 test-tenri-normal-enemies-strict.js 的区别：那份查数据表/随机池/模块单点，
// 本脚本走真实挂点链（EnemyKillHooks → Tenri → AttackValues / DamageHit），
// 并覆盖「牌堆复用后标记残留」「复活后单位卡视觉」「无 sweep 的全体 AOE 牌」。
// REVERT=<组> 对真实源码做替换后重载，要求对应组精准打红、其它组保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const raw = n => fs.readFileSync(path.join(DIR, n), "utf8");

const REPL = {
  // 撤掉两个结算标记的清理
  cleanup: ["battle-card-cleanup.js",
    '    "_tenriAssaultBonus", "_tenriRailgun"].forEach(key => delete card[key]);',
    '    "_noaUltimateVirtual"].forEach(key => delete card[key]);'],
  // 撤掉突击队伤害加成的归属校验
  assaultGuard: ["tenri-assault-skills.js",
    '    const bonus = c?.isAi(actor, "tenri_assault") && !c.stopped(actor)\n      ? card?._tenriAssaultBonus : 0;',
    '    const bonus = card?._tenriAssaultBonus;'],
  // 撤掉极速射线翻倍的归属校验
  railgunGuard: ["tenri-railgun-skills.js",
    '    return c?.isAi(actor, "tenri_railgun") && !c.stopped(actor)\n      && card?._tenriRailgun ? amount * 2 : amount;',
    '    return card?._tenriRailgun ? amount * 2 : amount;'],
  // 撤掉魔王军入侵的 AOE 补齐
  aoe: ["tenri-railgun-skills.js",
    '    if (!U?.isGroupTargetCard?.(card) && !card.demonInvasion) return;',
    '    if (!U?.isGroupTargetCard?.(card)) return;'],
  // 撤掉复活后的视觉血量同步
  reviveVisual: ["tenri-ghoul-revival.js",
    '    unit.visualHp = maxHp;\n    unit.visualBlock = unit.block || 0;\n    unit.visualDefense = unit.defenseSystem || 0;\n    delete unit.deathShown;\n    delete unit.deathAnimationPending;\n    delete unit.deferredDeathVisual;\n',
    ''],
  // 撤掉突击队标记本身 / 极速射线标记本身
  assaultMark: ["tenri-assault-skills.js", "    card._tenriAssaultBonus = extra;", ""],
  railgunMark: ["tenri-railgun-skills.js", "    card._tenriRailgun = true;", ""],
  // 撤掉守护后方转移
  guard: ["tenri-guard-skills.js", "    return guard;", "    return null;"],
};
const EXPECT = {
  cleanup: ["B", "D", "F"], assaultGuard: ["B"], railgunGuard: ["D"],
  aoe: ["D"], reviveVisual: ["E"], assaultMark: ["B"],
  railgunMark: ["D"], guard: ["C"],
};
const patched = n => {
  let s = raw(n);
  const r = REPL[REVERT];
  if (r && r[0] === n) {
    if (!s.includes(r[1])) throw new Error(`REVERT=${REVERT} 目标未命中: ${r[1]}`);
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
window.BattleLog = { add: (_s, t) => logs.push(String(t)) };
window.BattleLines = { skill: () => {} };
window.MieryulaTimeStop = { isSkillDisabled: u => !!u?.__stopped };
window.BattleHpValue = {
  maxHp: u => u.maxHp || u.stats?.maxHp || u.hp,
  applyDamage: (u, n) => { u.hp = Math.max(0, u.hp - n); return u.hp; },
  applyHeal: (u, n) => { u.hp = Math.min(u.maxHp || 9999, u.hp + n); return u.hp; },
};
window.BattleSystem = { pushFloat: () => {}, draw: () => [] };
window.EnemySkills = { onHeal: () => {}, absorbDefense: () => null };
window.SakuraRisaSkills = {
  pendingRevival: u => !!u?.tenriRevivePending,
  preventDeath: () => false,
  beginTurn: () => false,
};
window.GameDataCards = { cardCodex: [], baseDeck: [], eliteCards: [] };
[
  "card-utils.js", "tenri-institute-common.js",
  "tenri-assault-skills.js", "tenri-guard-skills.js",
  "tenri-railgun-skills.js", "tenri-ghoul-revival.js",
  "tenri-institute-skills.js", "battle-card-cleanup.js",
  "enemy-kill-hooks.js", "battle-combat-attack-values.js",
].forEach(load);

const U = window.CardUtils;
const T = window.TenriInstituteSkills;
const hooks = window.EnemyKillHooks({
  black: () => false,
  hasSkill: (u, n) => !!u?.skills?.some(s => s?.name === n),
  drawJudge: () => ({ success: false, card: { suit: "♠", name: "判定" } }),
});
const attackValues = window.BattleCombatAttackValues({ deps: {}, damage: () => {} });
const slash = (name, extra = {}) => ({ name, type: "slash", suit: "♠", ...extra });
const unit = (ai, side, hp, hand = []) => ({
  uid: ai + "_" + Math.random().toString(36).slice(2), ai, id: ai, side,
  hp, maxHp: hp, hand, stats: {}, statuses: [], skills: [], block: 0,
});
const state = (es, as) => ({ battle: { enemies: es, allies: as } });
const clearFlags = c => window.BattleCardCleanup.clearPlayFlags(c);

// ---------- A 真实挂点链 ----------
{
  const flow = raw("battle-combat-attack-flow.js");
  const p = flow.indexOf("if (deps.isKillCard(card)\n      && !prepareSlash(");
  const m = flow.indexOf("amount = values.modifyAttackAmount(");
  check("A", "A1 真实攻击流程里 beforeKillTargeted 先于 modifyAttackAmount",
    p >= 0 && m > p && /window\.EnemySkills\?\.beforeKillTargeted/.test(flow));
  const combat = raw("battle-combat.js");
  const redirect = combat.indexOf("redirectTarget?.(state, actor, target, card)");
  const trail = combat.indexOf("trailSnapshot(card, actor, battleAtStart)");
  check("A", "A2 守护后方目标转移在 useCard 最前（早于出牌快照与 canResolve）",
    redirect >= 0 && trail > redirect
    && combat.indexOf("CharacterSkillAccess?.canResolve") > redirect);
  check("A", "A3 极速射线标记在 resolveCard 入口、翻倍在统一命中出口",
    /window\.TenriInstituteSkills\?\.beforeCardPlayed/.test(combat)
    && /TenriInstituteSkills\?\.modifyIncomingDamage/.test(raw("battle-damage-hit.js"))
    && /return getHitWithoutDodge\(\)\(/.test(raw("battle-damage-resolution.js")));
  check("A", "A4 免死/复活接进全局 pendingRevival 与回合开始",
    /TenriInstituteSkills\?\.pendingRevival/.test(raw("sakura-risa-skills.js"))
    && /TenriInstituteSkills\?\.preventDeath/.test(raw("sakura-risa-skills.js"))
    && /TenriInstituteSkills\?\.beginTurn/.test(raw("battle-turn-start.js")));
  check("A", "A5 基础牌堆含机枪扫杀与魔王军入侵（全体牌实际可抽到）",
    /name: "机枪扫杀"[^\n]*sweep: true/.test(raw("data-cards.js"))
    && /name: "魔王军入侵"[^}]*demonInvasion: true/.test(raw("data-cards.js"))
    && /initialShopCardNames/.test(raw("data-cards.js")));
}

// ---------- B 不可挡突袭（真实 EnemyKillHooks → AttackValues） ----------
{
  const a = unit("tenri_assault", "enemy", 260, [slash("杀"), slash("杀"), slash("杀")]);
  const t = unit("p1", "ally", 100, [slash("杀")]);
  const s = state([a], [t]);
  const c = slash("杀（普攻）");
  hooks.beforeKillTargeted(s, a, t, c);
  const amount = attackValues.modifyAttackAmount(s, a, t, c, 10);
  check("B", "B1 手牌杀 3 对 1：不可响应 + 伤害 ×3（真实挂点链）",
    c.ignoreResponse === true && c._tenriAssaultBonus === 2 && amount === 30,
    `amount=${amount} bonus=${c._tenriAssaultBonus}`);
  check("B", "B2 台词/战报走技能名且记录倍率",
    logs.some(x => x.includes("不可挡突袭") && x.includes("伤害+200%")));
}
{
  const a = unit("tenri_assault", "enemy", 260, [slash("杀")]);
  const t = unit("p1", "ally", 100, [slash("杀"), slash("杀")]);
  const s = state([a], [t]);
  const c = slash("杀（普攻）");
  hooks.beforeKillTargeted(s, a, t, c);
  check("B", "B3 不多于目标时不触发、伤害不变",
    !c.ignoreResponse && attackValues.modifyAttackAmount(s, a, t, c, 10) === 10);
}
check("B", "B4 虚拟杀 / 群体杀 / 时停 / 非本家均不触发", (() => {
  const mk = (extra = {}, ai = "tenri_assault", stop = false) => {
    const a = unit(ai, "enemy", 260, [slash("杀"), slash("杀")]);
    if (stop) a.__stopped = true;
    const t = unit("p1", "ally", 100, []);
    const c = slash("杀（普攻）", extra);
    hooks.beforeKillTargeted(state([a], [t]), a, t, c);
    return { c, amount: attackValues.modifyAttackAmount(state([a], [t]), a, t, c, 10) };
  };
  return [mk({ virtual: true }), mk({ sweep: true }), mk({}, "tenri_assault", true),
    mk({}, "other_ai")].every(x => !x.c.ignoreResponse && x.amount === 10);
})());
check("B", "B5 归属校验：伪造残留标记的非本家牌不翻倍", (() => {
  const a = unit("other_ai", "enemy", 100);
  const t = unit("p1", "ally", 100);
  const c = slash("杀（普攻）", { _tenriAssaultBonus: 2 });
  return attackValues.modifyAttackAmount(state([a], [t]), a, t, c, 10) === 10;
})());
check("B", "B6 结算后标记被清理，重抽复用不加成", (() => {
  const a = unit("tenri_assault", "enemy", 260, [slash("杀"), slash("杀"), slash("杀")]);
  const t = unit("p1", "ally", 100, [slash("杀")]);
  const c = slash("杀（普攻）");
  hooks.beforeKillTargeted(state([a], [t]), a, t, c);
  clearFlags(c);
  const other = unit("other_ai", "enemy", 100);
  return c._tenriAssaultBonus === undefined && !c.ignoreResponse
    && attackValues.modifyAttackAmount(state([other], [t]), other, t, c, 10) === 10;
})());

// ---------- C 守护后方 ----------
{
  const g1 = unit("tenri_guard", "enemy", 300);
  const victim = unit("victim", "enemy", 100);
  const s = state([g1, victim], [unit("p1", "ally", 100)]);
  const atk = unit("p1", "ally", 100);
  check("C", "C1 其他敌方被实体单体杀指定 → 转移给防爆队",
    T.redirectTarget(s, atk, victim, slash("杀（普攻）")) === g1);
  check("C", "C2 原目标自身有守护后方 / 防爆队自己 → 不再转移", (() => {
    const g2 = unit("tenri_guard", "enemy", 300);
    g2.skills = [{ name: "守护后方" }];
    return T.redirectTarget(s, atk, g1, slash("杀（普攻）")) === null
      && T.redirectTarget(state([g2], [unit("p1", "ally", 100)]), atk, g2, slash("杀（普攻）")) === null;
  })());
  check("C", "C3 按新稿：虚拟单体杀也转移；群体杀 / 我方目标 / 时停不转移", (() => {
    const c1 = slash("杀（普攻）", { virtual: true });
    const c2 = slash("杀（普攻）", { sweep: true });
    const ally = unit("p2", "ally", 100);
    g1.__stopped = true;
    const stopped = T.redirectTarget(s, atk, victim, slash("杀（普攻）"));
    g1.__stopped = false;
    return T.redirectTarget(s, atk, victim, c1) === g1
      && T.redirectTarget(s, atk, victim, c2) === null
      && T.redirectTarget(s, atk, ally, slash("杀（普攻）")) === null
      && stopped === null;
  })());
  check("C", "C4 多个防爆队取第一个存活且未被时停的", (() => {
    const dead = unit("tenri_guard", "enemy", 0);
    const stopped = unit("tenri_guard", "enemy", 300); stopped.__stopped = true;
    const live = unit("tenri_guard", "enemy", 300);
    const s2 = state([dead, stopped, live, victim], [unit("p1", "ally", 100)]);
    return T.redirectTarget(s2, atk, victim, slash("杀（普攻）")) === live;
  })());
}

// ---------- D 极速射线 ----------
{
  const r = unit("tenri_railgun", "enemy", 220);
  const s = state([r], [unit("p1", "ally", 100)]);
  const g = slash("机枪扫杀", { sweep: true });
  T.beforeCardPlayed(s, r, g);
  check("D", "D1 全体实体牌不可响应 + 伤害翻倍（真实模块）",
    g.ignoreResponse === true && g._tenriRailgun === true
    && T.modifyIncomingDamage(s, r, null, 10, g) === 20);
  const single = slash("杀（普攻）");
  T.beforeCardPlayed(s, r, single);
  check("D", "D2 单体 / 虚拟 / 技能载荷 / 时停 / 非本家不触发", (() => {
    const mk = (card, ai = "tenri_railgun", stop = false) => {
      const a = unit(ai, "enemy", 220);
      if (stop) a.__stopped = true;
      const s2 = state([a], [unit("p1", "ally", 100)]);
      T.beforeCardPlayed(s2, a, card);
      return !card._tenriRailgun && !card.ignoreResponse
        && T.modifyIncomingDamage(s2, a, null, 10, card) === 10;
    };
    return mk(slash("杀（普攻）"))
      && mk(slash("机枪扫杀", { sweep: true, virtual: true }))
      && mk({ name: "技能伤害", type: "skill", sweep: true })
      && mk(slash("机枪扫杀", { sweep: true }), "tenri_railgun", true)
      && mk(slash("机枪扫杀", { sweep: true }), "other_ai");
  })());
}
check("D", "D3 无 sweep 的【魔王军入侵】也按全体实体牌触发且逐目标翻倍", (() => {
  const r = unit("tenri_railgun", "enemy", 220);
  const s = state([r], [unit("p1", "ally", 100), unit("p2", "ally", 100)]);
  const d = { name: "魔王军入侵", type: "tactic", targetless: true,
    demonInvasion: true, hybridAttack: true, attackType: "magic" };
  T.beforeCardPlayed(s, r, d);
  // demonInvasion 的 damageCopy 是 {...card, ...extra}，下划线标记会带到每个目标
  const copies = [{ ...d, targetUids: ["x"] }, { ...d, targetUids: ["y"] }];
  return d._tenriRailgun === true && d.ignoreResponse === true
    && copies.every(c => T.modifyIncomingDamage(s, r, null, 10, c) === 20)
    && !U.isGroupTargetCard(d);
})());
check("D", "D4 归属校验：伪造残留标记的非本家牌不翻倍", (() => {
  const a = unit("other_ai", "enemy", 100);
  const c = slash("机枪扫杀", { sweep: true, _tenriRailgun: true });
  return T.modifyIncomingDamage(state([a], []), a, null, 10, c) === 10;
})());
check("D", "D5 结算后标记被清理、不可响应也不残留", (() => {
  const r = unit("tenri_railgun", "enemy", 220);
  const c = slash("机枪扫杀", { sweep: true });
  T.beforeCardPlayed(state([r], []), r, c);
  clearFlags(c);
  return c._tenriRailgun === undefined && c.ignoreResponse === undefined;
})());

// ---------- E 快速复生 ----------
{
  const mate = unit("mate", "enemy", 100);
  const gh = unit("tenri_ghoul", "enemy", 0);
  gh.maxHp = 200; gh.visualHp = 0; gh.deathShown = true; gh.deathAnimationPending = true;
  gh.deferredDeathVisual = { hp: 0 };
  const s = state([mate, gh], [unit("p1", "ally", 100)]);
  check("E", "E1 死亡且有队友 → 待复活（标记/状态/战报）",
    T.preventDeath(s, gh) === true && T.pendingRevival(gh) === true
    && gh.statuses.includes("待复活"));
  check("E", "E2 下个回合开始满血复活并同步单位卡视觉（不残留死亡态）", (() => {
    const ok = T.beginTurn(s, gh) === true;
    const shownHp = gh.visualHp ?? gh.hp;
    const isDead = shownHp <= 0 && !window.SakuraRisaSkills?.pendingRevival?.(gh);
    return ok && gh.hp === 200 && gh.visualHp === 200 && !isDead
      && !gh.deathShown && !gh.deathAnimationPending && !gh.deferredDeathVisual
      && !T.pendingRevival(gh) && !gh.statuses.includes("待复活");
  })(), `hp=${gh.hp} visualHp=${gh.visualHp}`);
}
check("E", "E3 按新稿：死亡瞬间不判队友（全灭仍进待复活）；时停不进；复活瞬间全灭则保持阵亡", (() => {
  const mk = (mates, stop) => {
    const gh = unit("tenri_ghoul", "enemy", 0); gh.maxHp = 200;
    if (stop) gh.__stopped = true;
    const s = state([...mates, gh], [unit("p1", "ally", 100)]);
    return { gh, s, entered: T.preventDeath(s, gh) };
  };
  const noMate = mk([], false);
  const stopped = mk([unit("mate", "enemy", 100)], true);
  const willDie = mk([unit("mate", "enemy", 100)], false);
  // 复活瞬间「其他我方角色存活」不成立：把队友打到 0，而不是把食尸鬼移出队伍
  // （移出队伍会让 teamAlive 连自己都算不进，测的就不是「队友全灭」了）。
  willDie.s.battle.enemies.filter(u => u !== willDie.gh).forEach(u => { u.hp = 0; });
  const revived = T.beginTurn(willDie.s, willDie.gh);
  return noMate.entered === true && T.pendingRevival(noMate.gh) === true
    && stopped.entered === false
    && revived === true && willDie.gh.hp === 0 && !T.pendingRevival(willDie.gh);
})());
check("E", "E4 复活回血不误触发治疗钩子以外的状态残留",
  (() => {
    const gh = unit("tenri_ghoul", "enemy", 0); gh.maxHp = 200; gh.visualHp = 0;
    const s = state([unit("mate", "enemy", 100), gh], [unit("p1", "ally", 100)]);
    T.preventDeath(s, gh); T.beginTurn(s, gh);
    return gh.deathDiscarded === undefined && gh.tenriRevivePending === false;
  })());

// ---------- F 共享牌堆复用（BUG1 回归） ----------
check("F", "F1 极速射线牌洗回重抽后，非清理机器人使用不翻倍", (() => {
  const r = unit("tenri_railgun", "enemy", 220);
  const other = unit("tenri_assault", "enemy", 260);
  const pile = { discard: [], deck: [] };
  const c = slash("机枪扫杀", { sweep: true });
  T.beforeCardPlayed(state([r], []), r, c);
  pile.discard.push(c);
  clearFlags(c);
  pile.deck.push(...pile.discard.splice(0));
  const reused = pile.deck.pop();
  return reused === c && reused._tenriRailgun === undefined
    && T.modifyIncomingDamage(state([other], []), other, null, 10, reused) === 10;
})());
check("F", "F2 突击队杀牌洗回重抽后，非突击队使用不加成", (() => {
  const a = unit("tenri_assault", "enemy", 260, [slash("杀"), slash("杀"), slash("杀")]);
  const t = unit("p1", "ally", 100, [slash("杀")]);
  const other = unit("tenri_guard", "enemy", 300);
  const c = slash("杀（普攻）");
  hooks.beforeKillTargeted(state([a], [t]), a, t, c);
  const pile = { discard: [c], deck: [] };
  clearFlags(c);
  pile.deck.push(...pile.discard.splice(0));
  const reused = pile.deck.pop();
  return reused === c && reused._tenriAssaultBonus === undefined
    && attackValues.modifyAttackAmount(state([other], [t]), other, t, reused, 10) === 10;
})());

// ---------- G 数据表 / 描述一致性 ----------
{
  const data = raw("data-tenri-institute-enemies.js");
  const four = ["tenri_assault", "tenri_guard", "tenri_railgun", "tenri_ghoul"];
  check("G", "G1 四只怪与四个被动一一对应、数值为用户原稿",
    four.every(id => data.includes(`id: "${id}"`))
    && ["hp: 260, attack: 43", "hp: 300, attack: 36", "hp: 220, attack: 44",
      "hp: 200, attack: 50"].every(x => data.includes(x)));
  check("G", "G2 清理机器人技能描述与实现口径一致（全体类实体牌）",
    /全体类实体牌不可被响应，且造成的伤害翻倍/.test(data)
    && /card\.demonInvasion/.test(raw("tenri-railgun-skills.js")));
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
