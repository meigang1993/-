// 天日国鹰7研究所 · 无垢食尸鬼【快速复生】多单位专项复查
// 回答两件事：① 是否「同一次全灭结算」才能胜利 ② 2~4 只同时倒下会不会互相撑住无限复活。
// 直接抽取 battle-combat.js 里真实的 checkEnd 那一行执行，不走复刻判据。
// REVERT=<组> 改真实源码后重载，要求对应组精准打红、其它组保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const raw = n => fs.readFileSync(path.join(DIR, n), "utf8");

const REPL = {
  // 让胜负兜底把「其他待复活但 hp=0 的同伴」也当存活 → 互相撑住不胜利
  holdPending: ["tenri-ghoul-revival.js",
    "    return (team || []).some(u => u !== unit && u.hp > 0);\n  }\n\n  function beginTurn",
    "    return (team || []).some(u => u !== unit && (u.hp > 0 || window.TenriInstituteSkills?.pendingRevival?.(u)));\n  }\n\n  function beginTurn"],
  // 让复活瞬间也把待复活同伴当存活 → 全灭后排队复活
  teamAlivePending: ["tenri-ghoul-revival.js",
    "    return (team || []).some(u => u !== unit && u.hp > 0);\n  }\n\n  function preventDeath",
    "    return (team || []).some(u => u !== unit && (u.hp > 0 || window.TenriInstituteSkills?.pendingRevival?.(u)));\n  }\n\n  function preventDeath"],
  holdAlways: ["tenri-ghoul-revival.js",
    "    return (team || []).some(u => u !== unit && u.hp > 0);\n  }\n\n  function beginTurn",
    "    return true;\n  }\n\n  function beginTurn"],
  holdNever: ["tenri-ghoul-revival.js",
    "    return (team || []).some(u => u !== unit && u.hp > 0);\n  }\n\n  function beginTurn",
    "    return false;\n  }\n\n  function beginTurn"],
  // 胜负链改读 Tenri 原始 pendingRevival（未经 shouldHoldRevival 包装）
  checkEndRaw: ["battle-combat.js",
    "window.SakuraRisaSkills?.pendingRevival?.(e)",
    "window.TenriInstituteSkills?.pendingRevival?.(e)"],
  // beginTurn 不清标记：每回合都重新进复活判定
  noClearPending: ["tenri-ghoul-revival.js",
    "    unit.tenriRevivePending = false;",
    "    /* no clear */;"],
};
const EXPECT = {
  holdPending: ["A", "C", "E"], teamAlivePending: ["A", "C", "E"],
  holdAlways: ["A", "C", "E"], holdNever: ["B", "E"],
  checkEndRaw: ["A", "C", "E"], noClearPending: ["A", "B", "C", "E"],
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
window.BattleLog = { add: (_s, t) => logs.push(String(t)) };
window.BattleLines = { skill: () => {} };
window.MieryulaTimeStop = { isSkillDisabled: u => !!u?.__stopped, shouldSkipTurn: () => false };
window.BattleHpValue = {
  maxHp: u => u.maxHp || u.stats?.maxHp || u.hp,
  applyDamage: (u, n) => { u.hp = Math.max(0, u.hp - n); return u.hp; },
};
window.BattleSystem = { pushFloat: () => {}, draw: () => [] };
window.EnemySkills = { onHeal: () => {} };
window.GameDataCards = { cardCodex: [], baseDeck: [], eliteCards: [] };
window.GameRandom = { sample: l => (Array.isArray(l) && l.length ? l[0] : null), value: () => .5, id: () => "id" };
window.SakuraRisaCombatSkills = () => ({});
window.SakuraRisaLifecycleSkills = () => ({
  preventDeath: () => false, beginTurn: () => false, afterDamage: () => {},
});
[
  "card-utils.js", "tenri-institute-common.js", "tenri-ghoul-revival.js",
  "tenri-institute-skills.js", "sakura-risa-skills.js",
].forEach(load);

// 直接执行 battle-combat.js 中真实的 checkEnd 那一行（不是复刻）
const combat = patched("battle-combat.js");
const m = combat.match(/  function checkEnd\(state\) \{[^\n]*\}/);
if (!m) throw new Error("未定位 battle-combat.js 的 checkEnd 行");
let wins = 0;
global.deps = { finishBattle: () => { wins += 1; } };
global.checkDefeat = () => false;
global.pendingFatalAnim = () => false;
const checkEnd = vm.runInThisContext(
  `(function(){ ${m[0]}\n return checkEnd; })()`,
  { filename: "checkEnd-extract.js" });

const T = window.TenriInstituteSkills;
const R = window.SakuraRisaSkills;
const uid = (() => { let n = 0; return p => `${p}${++n}`; })();
const ghoul = (hp = 200, extra = {}) => ({
  uid: uid("gh"), ai: "tenri_ghoul", id: "tenri_ghoul", side: "enemy",
  hp, maxHp: hp, visualHp: hp, hand: [], stats: {}, statuses: [], skills: [],
  block: 0, ...extra,
});
const normal = (hp = 100) => ({
  uid: uid("foe"), ai: "normal", id: "normal", side: "enemy",
  hp, maxHp: hp, visualHp: hp, hand: [], stats: {}, statuses: [], skills: [], block: 0,
});
const ally = () => ({ uid: uid("ally"), side: "ally", hp: 100, maxHp: 100, hand: [], stats: {}, statuses: [], skills: [] });
const state = enemies => ({ battle: { enemies, allies: [ally()], locked: false, defeatedEnemyIds: [] } });
const setState = s => { window.state = s; };
const kill = (s, u) => {
  u.hp = 0; u.visualHp = 0;
  R.preventDeath(s, u);
  // 真实 markDefeated 也读包装后的 pendingRevival：全灭时应记入击败列表
  if (u.side === "enemy" && u.hp <= 0 && !R.pendingRevival(u) && u.id
    && !s.battle.defeatedEnemyIds.includes(u.id)) s.battle.defeatedEnemyIds.push(u.id);
};
const victory = s => { const before = wins; checkEnd(s); return wins > before; };
const rawPending = u => T.pendingRevival(u);
const hold = u => T.shouldHoldRevival(u);
const wrapped = u => R.pendingRevival(u);
const beginAll = (s, list) => list.forEach(u => T.beginTurn(s, u));
const revives = list => list.filter(u => u.hp > 0).length;

// ---------- A 2/3/4 只食尸鬼同一次结算全倒：立即胜利、不会排队复活 ----------
for (const n of [2, 3, 4]) {
  const list = Array.from({ length: n }, () => ghoul());
  const s = state(list); setState(s);
  list.forEach(u => kill(s, u));
  const allRawPending = list.every(rawPending);
  const noHold = list.every(u => hold(u) === false && wrapped(u) === false);
  const won = victory(s);
  // 即便硬推 3 轮回合开始，也不该有人复活（真实全灭后 nextRoundUnit 也不会再选它们）
  for (let round = 0; round < 3; round += 1) beginAll(s, list);
  const clean = list.every(u => u.hp === 0 && !rawPending(u) && !u.statuses.includes("待复活"));
  check("A", `A${n} ${n} 只同次全倒：raw pending 仍在但胜负包装全 false → 立即胜利且 3 轮内 0 复活`,
    allRawPending && noHold && won && clean && revives(list) === 0,
    `won=${won} noHold=${noHold} revives=${revives(list)} clean=${clean}`);
}

// ---------- B 留 1 只存活：待复活被撑住，下个回合满血复活（按文案，非状态机死循环） ----------
{
  const list = Array.from({ length: 4 }, () => ghoul());
  const s = state(list); setState(s);
  const dead = list.slice(0, 3), live = list[3];
  dead.forEach(u => kill(s, u));
  const blocked = !victory(s) && dead.every(u => hold(u) === true && wrapped(u) === true);
  dead.forEach(u => T.beginTurn(s, u));
  const back = dead.every(u => u.hp === u.maxHp && !rawPending(u));
  // 逐个击破：刚复活的同伴继续给最后一只当「存活队友」
  kill(s, live);
  const stillBlocked = !victory(s) && hold(live) === true;
  T.beginTurn(s, live);
  check("B", "B1 逐个击破会反复复活：留 1 只活口 → 死者全复活、最后一只也复活",
    blocked && back && stillBlocked && live.hp === live.maxHp && revives(list) === 4,
    `blocked=${blocked} back=${back} stillBlocked=${stillBlocked} alive=${revives(list)}`);
}

// ---------- C 3 食尸鬼 + 1 普通怪同次全倒：普通怪不进待复活，仍立即胜利 ----------
{
  const gs = Array.from({ length: 3 }, () => ghoul());
  const foe = normal();
  const list = [...gs, foe];
  const s = state(list); setState(s);
  list.forEach(u => kill(s, u));
  const won = victory(s);
  const noHold = gs.every(u => hold(u) === false && wrapped(u) === false);
  for (let round = 0; round < 3; round += 1) beginAll(s, gs);
  check("C", "C1 混编 4 敌同次全倒：不因普通怪/多只待复活互相撑住，立即胜利且不复活",
    won && noHold && revives(gs) === 0 && gs.every(u => !rawPending(u)));
}

// ---------- D 时停：不进待复活，全倒即胜 ----------
{
  const list = Array.from({ length: 4 }, () => ghoul(200, { __stopped: true }));
  const s = state(list); setState(s);
  list.forEach(u => kill(s, u));
  const won = victory(s);
  beginAll(s, list);
  check("D", "D1 4 只全被时停：preventDeath 不挂待复活，全倒即胜、回合开始也不复活",
    won && list.every(u => !rawPending(u) && !wrapped(u) && u.hp === 0));
}

// ---------- E 防无限复活的源码级判据 ----------
{
  const gh = patched("tenri-ghoul-revival.js");
  const risa = raw("sakura-risa-skills.js");
  const cb = patched("battle-combat.js");
  const turn = raw("battle-turn-start.js");
  const teamAlive = gh.slice(gh.indexOf("function teamAlive"), gh.indexOf("function preventDeath"));
  const shouldHold = gh.slice(gh.indexOf("function shouldHoldRevival"), gh.indexOf("function beginTurn"));
  const beginTurn = gh.slice(gh.indexOf("function beginTurn"), gh.indexOf("return { isGhoul"));
  const hpOnly = /return \(team \|\| \[\]\)\.some\(u => u !== unit && u\.hp > 0\);/;
  const otherPending = /u[^)]*pendingRevival/;
  check("E", "E1 存活队友只认 hp>0（teamAlive / shouldHoldRevival 都不把同伴 pending 当存活）",
    hpOnly.test(teamAlive) && !otherPending.test(teamAlive)
    && hpOnly.test(shouldHold) && !otherPending.test(shouldHold));
  check("E", "E2 beginTurn 先清待复活标记再判队友，复活后不会自己给自己当队友",
    beginTurn.indexOf("unit.tenriRevivePending = false;") >= 0
    && beginTurn.indexOf("unit.tenriRevivePending = false;") < beginTurn.indexOf("teamAlive"));
  check("E", "E3 胜负链读包装后的 SakuraRisa.pendingRevival，且包装过 shouldHoldRevival",
    /SakuraRisaSkills\?\.pendingRevival\?\.\(e\)/.test(cb)
    && /shouldHoldRevival\?\.\(unit\) !== false/.test(risa));
  check("E", "E4 回合开始先跑研究所复活，再跑不死食尸鬼，避免抢标记",
    turn.indexOf("TenriInstituteSkills?.beginTurn") >= 0
    && turn.indexOf("TenriInstituteSkills?.beginTurn") < turn.indexOf("SakuraRisaSkills?.beginTurn"));
  check("E", "E5 死亡记账 / UI / 回合资格也都读包装后的 pendingRevival",
    ["battle-damage-lifecycle.js", "battle-combat.js", "ui-battle-units.js", "battle-runtime-helpers.js"]
      .every(f => /SakuraRisaSkills\?\.pendingRevival/.test(raw(f))));
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
