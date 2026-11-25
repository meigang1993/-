// 丽莎【不死食尸鬼】× 研究所 4 技能 · 第三轮交叉复查
// 回答：① 丽莎复活链有没有 BUG ② 4 个新怪技能还有没有其它 BUG。
// 真实加载模块链；UI 死亡态判据从 ui-battle-units.js 抽行执行，胜负判据从
// battle-combat.js 抽行执行，不复刻判据。REVERT=<组> 精准反向验证。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const raw = n => fs.readFileSync(path.join(DIR, n), "utf8");

const REPL = {
  // 撤掉丽莎复活的视觉同步（本轮修复点）
  risaVisual: ["sakura-risa-lifecycle-skills.js",
    "    unit.visualHp = maxHp;\n    unit.visualBlock = unit.block || 0;\n    unit.visualDefense = unit.defenseSystem || 0;\n",
    ""],
  // 撤掉 isRisa 守卫
  risaGuard: ["sakura-risa-lifecycle-skills.js",
    "    if (!pendingRevival(unit) || !isRisa(unit)) return false;",
    "    if (!pendingRevival(unit)) return false;"],
  // 撤掉 maxHp 兜底，退回裸 unit.maxHp
  risaMaxHp: ["sakura-risa-lifecycle-skills.js",
    "    const maxHp = window.BattleHpValue?.maxHp?.(unit)\n      ?? unit.maxHp ?? unit.stats?.maxHp ?? unit.hp;",
    "    const maxHp = unit.maxHp;"],
  // 撤掉研究所复活视觉同步（上轮修复，回归用）
  ghoulVisual: ["tenri-ghoul-revival.js",
    "    unit.visualHp = maxHp;\n    unit.visualBlock = unit.block || 0;\n    unit.visualDefense = unit.defenseSystem || 0;\n    delete unit.deathShown;\n",
    ""],
  // 撤掉两个结算标记的清理
  cleanup: ["battle-card-cleanup.js",
    '    "_tenriAssaultBonus", "_tenriRailgun"].forEach(key => delete card[key]);',
    '    "_noaUltimateVirtual"].forEach(key => delete card[key]);'],
  // 撤掉守护后方的技能载荷排除
  guardSkill: ["tenri-guard-skills.js",
    "    if (!U.isSingleKillCard?.(card) || card?.type === \"skill\") return null;",
    "    if (!U.isSingleKillCard?.(card)) return null;"],
  // 撤掉魔王军入侵的 AOE 补齐
  aoe: ["tenri-railgun-skills.js",
    "    if (!U?.isGroupTargetCard?.(card) && !card.demonInvasion) return;",
    "    if (!U?.isGroupTargetCard?.(card)) return;"],
};
const EXPECT = {
  risaVisual: ["A"], risaGuard: ["B"], risaMaxHp: ["A"],
  ghoulVisual: ["C"], cleanup: ["C"], guardSkill: ["C"], aoe: ["C"],
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
const logs = [], lines = [], floats = [];
window.BattleLog = { add: (_s, t) => logs.push(String(t)) };
window.BattleLines = { skill: (_s, _u, name) => lines.push(String(name)) };
window.MieryulaTimeStop = { isSkillDisabled: u => !!u?.__stopped, shouldSkipTurn: () => false };
window.BattleSystem = {
  pushFloat: (b, uid, kind, value) => floats.push({ uid, kind, value }),
  draw: () => [], active: () => null,
};
window.EnemySkills = { onHeal: () => {} };
window.RelicSystem = { hasEquipped: () => false };
window.GameDataCards = { cardCodex: [], baseDeck: [], eliteCards: [] };
window.GameRandom = { value: () => .5, sample: l => (Array.isArray(l) && l.length ? l[0] : null), id: () => "id" };
window.SakuraRisaEye = { playPhaseStart: () => null, resolveChoice: () => false, confirmResult: () => false };
window.BattleDrawFeedback = { team: () => "", action: () => "" };
[
  "hp-value.js", "card-utils.js", "tenri-institute-common.js",
  "tenri-assault-skills.js", "tenri-guard-skills.js", "tenri-railgun-skills.js",
  "tenri-ghoul-revival.js", "tenri-institute-skills.js",
  "sakura-risa-combat-skills.js", "sakura-risa-lifecycle-skills.js",
  "sakura-risa-skills.js", "battle-card-cleanup.js", "battle-card-tactics.js",
].forEach(load);

const R = window.SakuraRisaSkills;
const T = window.TenriInstituteSkills;
const C = window.TenriInstituteCommon;
const U = window.CardUtils;

// 真实 UI 死亡态公式（抽自 ui-battle-units.js 25-27 行）
const ui = raw("ui-battle-units.js");
const uiLine = ui.split("\n").find(l => l.includes("const shownHp = unitData.visualHp"));
const isDeadLine = ui.split("\n").find(l => l.includes("const isDead = shownHp"));
if (!uiLine || !isDeadLine) throw new Error("未定位 UI 死亡态判据");
const isDeadOf = vm.runInThisContext(
  `(function(unitData){ ${uiLine.trim()}\n${isDeadLine.trim()}\n return isDead; })`,
  { filename: "ui-isDead-extract.js" });
// 源码级保证抽出来的就是当前产品判据
const UI_SAME = /visualHp \?\? unitData\.hp/.test(uiLine)
  && /window\.SakuraRisaSkills\?\.pendingRevival\?\.\(unitData\)/.test(isDeadLine);

// 真实胜负判据（抽自 battle-combat.js）
const combat = patched("battle-combat.js");
const ce = combat.match(/  function checkEnd\(state\) \{[^\n]*\}/);
if (!ce) throw new Error("未定位 checkEnd");
let wins = 0;
global.deps = { finishBattle: () => { wins += 1; } };
global.checkDefeat = () => false;
global.pendingFatalAnim = () => false;
const checkEnd = vm.runInThisContext(`(function(){ ${ce[0]}\n return checkEnd; })()`,
  { filename: "checkEnd-extract.js" });

let seq = 0;
const unit = (o = {}) => ({
  uid: "u" + (++seq), side: "enemy", ai: "normal", id: "normal",
  hp: 100, maxHp: 100, hand: [], stats: { maxHp: 100 }, statuses: [],
  skills: [], block: 0, battleRelics: [], ...o,
});
const risa = (o = {}) => unit({
  ai: "assassin_sakura_risa", id: "assassin_sakura_risa", side: "enemy",
  hp: 410, maxHp: 410, stats: { maxHp: 410 },
  hand: [{ name: "闪", type: "response" }],
  skills: [{ name: "不死食尸鬼", type: "passive" }], ...o,
});
const ghoul = (o = {}) => unit({
  ai: "tenri_ghoul", id: "tenri_ghoul", hp: 200, maxHp: 200,
  stats: { maxHp: 200 }, ...o,
});
const guard = (o = {}) => unit({ ai: "tenri_guard", id: "tenri_guard", hp: 300, ...o });
const state = (enemies, allies = [unit({ side: "ally", hp: 100 })]) =>
  ({ battle: { enemies, allies, locked: false, defeatedEnemyIds: [], animQueue: [], floats: [] } });
const setState = s => { window.state = s; };
const slash = (name, extra = {}) => ({ name, type: "slash", suit: "♠", ...extra });
const victory = s => { const before = wins; checkEnd(s); return wins > before; };
const kill = (s, u) => {
  u.hp = 0;
  R.preventDeath(s, u);
};
const fresh = () => { logs.length = 0; lines.length = 0; floats.length = 0; };

// ---------- A 丽莎【不死食尸鬼】复活链 ----------
{
  fresh();
  const r = risa(); const s = state([r]); setState(s);
  kill(s, r);
  check("A", "A1 有手牌降至 0 → 进入待复活（不弃牌、不判胜）",
    r.risaRevivePending === true && r.statuses.includes("待复活")
    && !r.deathDiscarded && !victory(s) && R.pendingRevival(r) === true);
  check("A", "A2 免死条件：无手牌 / 时停 / 重复触发都不进待复活", (() => {
    fresh();
    const a = risa({ hand: [] }); const sa = state([a]); setState(sa);
    kill(sa, a);
    const b = risa({ __stopped: true }); const sb = state([b]); setState(sb);
    kill(sb, b);
    const c = risa({ risaRevivePending: true }); const sc = state([c]); setState(sc);
    kill(sc, c);
    return !a.risaRevivePending && !b.risaRevivePending
      && c.risaRevivePending === true
      && logs.filter(t => t.includes("不死食尸鬼")).length === 0;
  })());
  check("A", "A3 下个回合开始：满血复活、清标记、播台词与回血浮字", (() => {
    fresh();
    const r2 = risa({ visualHp: 0, deathShown: true, deathAnimationPending: true,
      deferredDeathVisual: { hp: 0 }, deathDiscarded: true });
    const s2 = state([r2]); setState(s2);
    kill(s2, r2);
    const ok = R.beginTurn(s2, r2);
    return ok === true && r2.hp === 410 && !r2.risaRevivePending
      && !r2.statuses.includes("待复活") && !r2.deathDiscarded
      && lines.includes("不死食尸鬼")
      && floats.some(f => f.uid === r2.uid && f.kind === "heal" && f.value === 410);
  })(), `floats=${JSON.stringify(floats)}`);
  // 实证：死亡浮字把 visualHp 写回 0、动画链尚未 clearVisuals 时复活
  check("A", "A4 复活瞬间 UI 不再判为死亡态（visualHp / deathShown 同步）", (() => {
    const r3 = risa({ visualHp: 0, deathShown: true, deathAnimationPending: true,
      deferredDeathVisual: { hp: 0 } });
    const s3 = state([r3]); setState(s3);
    kill(s3, r3);
    R.beginTurn(s3, r3);
    // 抽出来的真实产品公式
    const dead = isDeadOf(r3);
    return UI_SAME && dead === false
      && r3.visualHp === 410 && !r3.deathShown
      && !r3.deathAnimationPending && !r3.deferredDeathVisual;
  })(), `visualHp=${(() => { const x = risa({ visualHp: 0 }); return x.visualHp; })()}`);
  check("A", "A5 maxHp 缺失/异常时复活仍得到有限血量（不变成 undefined）", (() => {
    const r4 = risa({ maxHp: undefined, stats: { maxHp: 410 } });
    const s4 = state([r4]); setState(s4);
    kill(s4, r4);
    R.beginTurn(s4, r4);
    return Number.isFinite(r4.hp) && r4.hp > 0;
  })());
  check("A", "A6 复活后胜负链重新把它算作存活（不会误判胜利）", (() => {
    const r5 = risa(); const s5 = state([r5]); setState(s5);
    kill(s5, r5);
    R.beginTurn(s5, r5);
    return victory(s5) === false;
  })());
}

// ---------- B 丽莎 × 研究所共链不串台 ----------
{
  fresh();
  const g = ghoul(); const mate = unit({ hp: 100 });
  const sg = state([g, mate]); setState(sg);
  kill(sg, g);
  check("B", "B1 食尸鬼死亡只触发【快速复生】，不触发丽莎免死/不死食尸鬼台词",
    g.tenriRevivePending === true && !g.risaRevivePending
    && lines.includes("快速复生") && !lines.includes("不死食尸鬼"));
  check("B", "B2 食尸鬼回合开始只走研究所复活，不会被丽莎 beginTurn 抢去复活", (() => {
    fresh();
    // 模拟「Tenri.beginTurn 尚未清标记」的脆弱窗口，直接调丽莎 beginTurn
    const r6 = ghoul({ hp: 0, visualHp: 0, tenriRevivePending: true, statuses: ["待复活"] });
    const s6 = state([r6, unit({ hp: 100 })]); setState(s6);
    R.beginTurn(s6, r6);
    return r6.hp === 0 && !lines.includes("不死食尸鬼")
      && r6.tenriRevivePending === true;
  })(), `lines=${JSON.stringify(lines)}`);
  check("B", "B3 丽莎死亡不触发【快速复生】", (() => {
    fresh();
    const r7 = risa(); const s7 = state([r7]); setState(s7);
    kill(s7, r7);
    return !r7.tenriRevivePending && !lines.includes("快速复生")
      && lines.includes("不死食尸鬼");
  })());
  check("B", "B4 回合开始顺序：研究所 beginTurn 先于丽莎（防抢标记）",
    raw("battle-turn-start.js").indexOf("TenriInstituteSkills?.beginTurn") >= 0
    && raw("battle-turn-start.js").indexOf("TenriInstituteSkills?.beginTurn")
      < raw("battle-turn-start.js").indexOf("SakuraRisaSkills?.beginTurn"));
  check("B", "B5 两条 preventDeath 通过同一包装入口且互斥",
    /TenriInstituteSkills\?\.preventDeath/.test(raw("sakura-risa-skills.js"))
    && /basePreventDeath/.test(raw("sakura-risa-skills.js")));
}

// ---------- C 4 个新怪技能边界回归 ----------
{
  // 【不可挡突袭】/【极速射线】：结算标记与 ignoreResponse 不污染共享牌堆
  const a = unit({ ai: "tenri_assault", id: "tenri_assault", hand: Array.from({ length: 4 }, () => slash("杀（普攻）")) });
  const victim = unit({ side: "ally", hand: [slash("杀（普攻）")] });
  const sa = state([a], [victim]); setState(sa);
  const c1 = slash("杀（普攻）");
  T.beforeKillTargeted(sa, a, victim, c1);
  check("C", "C1 不可挡突袭：多 3 张杀 → 不可响应 + 伤害 ×4",
    c1.ignoreResponse === true && c1._tempIgnoreResponse === true
    && window.TenriAssaultSkills.modifyAttackAmount(sa, a, victim, c1, 10) === 40);
  window.BattleCardCleanup.clearPlayFlags(c1);
  check("C", "C2 clearPlayFlags 后标记与不可响应彻底还原（洗牌重抽不污染）",
    !c1.ignoreResponse && !c1._tempIgnoreResponse && !c1._tenriAssaultBonus
    && window.TenriAssaultSkills.modifyAttackAmount(sa, a, victim, c1, 10) === 10);
  check("C", "C3 原本就 ignoreResponse 的牌不会被 _temp 误清掉", (() => {
    const c2 = slash("圣杀", { ignoreResponse: true });
    T.beforeKillTargeted(sa, a, victim, c2);
    window.BattleCardCleanup.clearPlayFlags(c2);
    return c2.ignoreResponse === true;
  })());
  // 极速射线 + 魔王军入侵（damageCopy 副本必须继承标记）
  const rg = unit({ ai: "tenri_railgun", id: "tenri_railgun", hp: 220,
    stats: { attack: 44, magic: 40 } });
  const sr = state([rg], [unit({ side: "ally" }), unit({ side: "ally" })]); setState(sr);
  const invasion = { name: "魔王军入侵", type: "tactic", targetless: true,
    demonInvasion: true, hybridAttack: true };
  T.beforeCardPlayed(sr, rg, invasion);
  const copy = { ...invasion, responseKind: "slash" };
  check("C", "C4 极速射线：无 sweep 的【魔王军入侵】不可响应且翻倍，结算副本仍带标记",
    invasion.ignoreResponse === true && invasion._tenriRailgun === true
    && T.modifyIncomingDamage(sr, rg, null, 10, invasion) === 20
    && T.modifyIncomingDamage(sr, rg, null, 10, copy) === 20);
  window.BattleCardCleanup.clearPlayFlags(invasion);
  check("C", "C5 极速射线标记同样随结算清理，非本家角色不翻倍",
    !invasion._tenriRailgun && !invasion.ignoreResponse
    && T.modifyIncomingDamage(sr, a, null, 10, { ...invasion, _tenriRailgun: true }) === 10);
  // 【守护后方】
  const gd = guard(); const vi = unit({ ai: "victim", id: "victim", side: "enemy" });
  const sg2 = state([gd, vi], [unit({ side: "ally" })]); setState(sg2);
  check("C", "C6 守护后方：虚拟单体杀转移，技能伤害载荷与待摸牌不转移",
    T.redirectTarget(sg2, unit({ side: "ally" }), vi, slash("杀", { virtual: true })) === gd
    && T.redirectTarget(sg2, unit({ side: "ally" }), vi,
      { name: "锁魂镰刀杀", type: "skill" }) === null
    && T.redirectTarget(sg2, unit({ side: "ally" }), vi,
      slash("杀", { _pendingDraw: true })) === null);
  // 【快速复生】视觉同步与多只全灭即胜
  const g1 = ghoul({ visualHp: 0, deathShown: true, deathAnimationPending: true });
  const mate2 = unit({ hp: 100 });
  const sg3 = state([g1, mate2]); setState(sg3);
  kill(sg3, g1);
  T.beginTurn(sg3, g1);
  check("C", "C7 快速复生满血复活同步视觉态（上轮修复仍在）",
    g1.hp === 200 && g1.visualHp === 200 && !g1.deathShown
    && isDeadOf(g1) === false);
  const gs = [ghoul(), ghoul(), ghoul(), ghoul()];
  const sg4 = state(gs); setState(sg4);
  gs.forEach(g => kill(sg4, g));
  check("C", "C8 4 只食尸鬼同次全倒立即胜利、不会互相撑住无限复活",
    victory(sg4) === true && gs.every(g => T.shouldHoldRevival(g) === false));
  check("C", "C9 slashCount 只数手牌可见【杀】牌（虚拟/待摸/技能载荷不计）", (() => {
    const probe = unit({ hand: [
      slash("杀（普攻）"), slash("火杀"),
      slash("虚拟杀", { virtual: true }),
      slash("待摸杀", { _pendingDraw: true }),
      { name: "锁魂镰刀", type: "skill" },
      { name: "闪", type: "response" },
    ] });
    return C.slashCount(probe) === 3;
  })());
  check("C", "C10 手动响应只对 ally 目标开放，守护后方转移后走自动响应（不空面板）",
    (() => {
      const dr = raw("battle-dodge-response.js");
      const res = raw("battle-damage-resolution.js");
      const dd = raw("battle-dodge-deflect.js");
      return /target\?\.side !== "ally"/.test(dr)
        && /target\.hand\.filter\(candidate => canDodge\(effectiveCard, candidate\)\)/.test(res)
        && /function autoDodge\(state, actor, target, amount, source, card, response\)/.test(dd);
    })());
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
