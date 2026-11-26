// 丽莎【不死食尸鬼】第四轮复查：生命流失路径是否都走免死结算
// 前几轮只覆盖了 3 条主伤害链（battle-damage-hit / lifecycle / card-specials）。
// 本轮查全库所有 BattleHpValue.applyDamage 调用点，实证「混乱自伤 / 地雷 /
// 猜拳 / 死亡音波 / 外神之眼 / 百眼魅魔 / 增援自伤」致死时免死是否生效，
// 并用真实 checkEnd 验证「最后一个敌人被状态牌打死却直接判胜利」这个 BUG。
// REVERT=<组> 改真实源码后重载，要求对应组精准打红、其它组保持绿。
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { sourceOf } = require("./split-source-view");

const ROOT = path.resolve(__dirname, "..");
const DIR = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "";
const raw = n => sourceOf(path.join(DIR, n));

const P = (file, arg) => [
  `window.BattleHpValue.applyDamage(${arg}); window.SakuraRisaSkills?.preventDeath?.(state, ${arg.replace(/,.*/, "")});`,
  `window.BattleHpValue.applyDamage(${arg});`,
];
// 注意 P 的 arg 形如 "unit, amount"，需要拆出变量名
const pair = (varName, amountExpr) => ({
  full: `window.BattleHpValue.applyDamage(${varName}, ${amountExpr}); window.SakuraRisaSkills?.preventDeath?.(state, ${varName});`,
  bare: `window.BattleHpValue.applyDamage(${varName}, ${amountExpr});`,
});
const c = pair("unit", "amount");
const h = pair("holder", "amount");
const hLoss = pair("unit", "loss");
const atk = pair("attacker", "amount");
const ally = pair("ally", "amount");

const REPL = {
  confusion: ["battle-status-card-triggers.js", c.full, c.bare],
  landmine: ["battle-status-card-triggers.js", h.full, h.bare],
  rps: ["ruins-grunt-rps.js", h.full, h.bare],
  deathwave: ["ruins-dragon-deathwave.js", c.full, c.bare],
  reinforce: ["ruins-elite-skills.js", hLoss.full, hLoss.bare],
  withererEye: ["ruins-witherer-virtual-kill.js", atk.full, atk.bare],
  withererHundred: ["ruins-witherer-virtual-kill.js", ally.full, ally.bare],
  mainChain: ["battle-damage-hit.js",
    "    window.SakuraRisaSkills?.preventDeath?.(state, target);\n", ""],
};
const EXPECT = {
  confusion: ["A"], landmine: ["B"], rps: ["C"], deathwave: ["D"],
  reinforce: ["E"], withererEye: ["F"], withererHundred: ["G"],
  mainChain: ["H"],
};
const patched = n => {
  let s = raw(n);
  const r = REPL[REVERT];
  if (r && r[0] === n) {
    if (!s.includes(r[1])) throw new Error(`REVERT=${REVERT} 目标未命中: ${r[1].slice(0, 80)}`);
    s = s.replace(r[1], r[2], 1);
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
window.BattleSystem = {
  pushFloat: (b, uid, kind, value) => floats.push({ uid, kind, value }),
  draw: () => [], active: () => null, useVirtualKill: () => {},
};
window.BattleHpValue = undefined;
window.MieryulaTimeStop = { isSkillDisabled: u => (u?.statuses || []).includes("时停"), shouldSkipTurn: () => false };
window.EnemySkills = { onHeal: () => {} };
window.RelicSystem = { hasEquipped: () => false };
window.GameRandom = { value: () => .5, sample: l => (Array.isArray(l) && l.length ? l[0] : null), id: () => "id" };
window.SakuraRisaEye = { playPhaseStart: () => null, resolveChoice: () => false, confirmResult: () => false };
window.BattleDrawFeedback = { team: () => "", action: () => "" };
window.BattleStats = { damage: () => {}, heal: () => {} };
window.BattleCards = { put: () => {}, putMany: () => {} };
window.BattlePileStats = { reshuffle: () => {} };
window.BattleStatusCardRegistry = {
  isStatus: () => false, keyOf: card => card?.key || "",
  sync: () => {},
};
window.BattleStatusCardStorage = { consumeRemoved: () => {} };
window.RuinsGruntCommon = { unitByUid: () => null, log: (_s, t) => logs.push(String(t)) };
window.RuinsGruntLandmine = { consumeLandmine: () => {} };
window.BattleStatus = { mark: () => {} };
window.NoaSideEffectSkills = { handLimit: () => 0 };

[
  "hp-value.js", "card-utils.js", "tenri-institute-common.js",
  "tenri-ghoul-revival.js", "tenri-institute-skills.js",
  "sakura-risa-combat-skills.js", "sakura-risa-lifecycle-skills.js",
  "sakura-risa-skills.js",
  "battle-status-card-triggers.js", "ruins-grunt-rps.js",
  "ruins-dragon-deathwave.js", "ruins-witherer-virtual-kill.js",
].forEach(load);
const R = window.SakuraRisaSkills;
const H = window.BattleHpValue;

// 真实 checkEnd（抽自 battle-combat.js）
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
const risa = (o = {}) => ({
  uid: "l" + (++seq), side: "enemy", ai: "assassin_sakura_risa",
  id: "assassin_sakura_risa", hp: 410, maxHp: 410,
  stats: { maxHp: 410, attack: 500 }, statuses: [],
  hand: [{ name: "闪", type: "response" }], skills: [{ name: "不死食尸鬼" }],
  block: 0, discard: [], deck: [], battleRelics: [], ...o,
});
const state = (enemies, allies = []) => ({
  battle: { enemies, allies, locked: false, defeatedEnemyIds: [], animQueue: [], floats: [] },
});
const setState = s => { window.state = s; };
const victory = s => { const before = wins; checkEnd(s); return wins > before; };
const fresh = () => { logs.length = 0; lines.length = 0; floats.length = 0; };
const alive = u => u.hp > 0 || R.pendingRevival(u);

// 每个场景：把丽莎打到 0，验证免死生效 + 不误判胜利
function scenario(label, group, run) {
  fresh();
  const l = risa({ hp: 10 });
  const s = state([l], [{ uid: "p1", side: "ally", hp: 100 }]);
  setState(s);
  run(s, l);
  check(group, `${label}：生命流失致死仍进入待复活（不弃手牌）`,
    l.hp === 0 && l.risaRevivePending === true
    && l.statuses.includes("待复活") && !l.deathDiscarded,
    `hp=${l.hp} pending=${l.risaRevivePending}`);
  check(group, `${label}：真实 checkEnd 不误判胜利`,
    victory(s) === false && R.pendingRevival(l) === true);
  check(group, `${label}：下个回合满血复活且 UI 不灰化`, (() => {
    R.beginTurn(s, l);
    return l.hp === 410 && l.visualHp === 410 && !l.risaRevivePending
      && !l.deathShown && !l.deathAnimationPending
      && (l.visualHp ?? l.hp) > 0;
  })());
}

// ---------- A 混乱自伤 ----------
scenario("A 混乱", "A", (s, l) => {
  // 场上无其他存活同阵营角色 → triggerConfusion 走自伤分支
  window.BattleStatusCardTriggers.triggerConfusion(s, l);
});

// ---------- B 地雷状态牌 ----------
scenario("B 地雷", "B", (s, l) => {
  l.hand.push({ key: "landmine", name: "地雷", landmineAttack: 999 });
  window.BattleStatusCardTriggers.triggerLandmine(s, l);
});

// ---------- C 地雷猜拳落败 ----------
scenario("C 猜拳", "C", (s, l) => {
  window.RuinsGruntRPS.settleLandmineRps(s, l,
    { landmineAttack: 999, landmineSourceUid: "src" }, false);
});

// ---------- D 死亡音波（丽莎作 ally，机械龙记录花色全未用） ----------
scenario("D 死亡音波", "D", (s, l) => {
  const dragon = { uid: "dr", ai: "ruins_dragon", side: "enemy", hp: 100,
    ruinsDeathWaveSuits: ["♠"], stats: { attack: 999 } };
  s.battle.enemies = [dragon];
  s.battle.allies = [l];
  l.side = "ally";
  l.suitsUsedThisTurn = {};
  window.RuinsDragonDeathWave.checkDeathWave(s, l);
});

// ---------- E 增援部队自伤（源码级；reinforce 为模块内部函数） ----------
check("E", "E1 增援部队自伤（ruins-elite-skills.js）同行补了 preventDeath",
  /window\.BattleHpValue\.applyDamage\(unit, loss\); window\.SakuraRisaSkills\?\.preventDeath\?\.\(state, unit\);/.test(
    patched("ruins-elite-skills.js")));
check("E", "E2 全库 BattleHpValue.applyDamage 调用点无第 9 处漏网（豁免见 E3）",
  (() => {
    // 3 个子模块已并入各自「主文件」的拆分感知视图（sourceOf），
    // 再单独扫一遍会把同一处调用点计两次；只扫主文件视图即可覆盖全部源码。
    const SPLIT_SUBS = ["ruins-dragon-tailgun.js", "local-core-dungeon-settlement.js", "ruins-elite-prepare-skills.js"];
    const files = fs.readdirSync(DIR).filter(f => f.endsWith(".js") && !SPLIT_SUBS.includes(f));
    const sites = [];
    files.forEach(f => {
      const s = patched(f);
      s.split("\n").forEach((l, i) => {
        if (l.includes("BattleHpValue.applyDamage(")) sites.push(`${f}:${i + 1}`);
      });
    });
    // 3 条主链（外层包装调 preventDeath）+ 7 条本轮补齐 = 10 个调用点
    return sites.length === 10;
  })(), `sites=${(() => {
    // 3 个子模块已并入各自「主文件」的拆分感知视图（sourceOf），
    // 再单独扫一遍会把同一处调用点计两次；只扫主文件视图即可覆盖全部源码。
    const SPLIT_SUBS = ["ruins-dragon-tailgun.js", "local-core-dungeon-settlement.js", "ruins-elite-prepare-skills.js"];
    const files = fs.readdirSync(DIR).filter(f => f.endsWith(".js") && !SPLIT_SUBS.includes(f));
    const out = [];
    files.forEach(f => patched(f).split("\n").forEach((l, i) => {
      if (l.includes("BattleHpValue.applyDamage(")) out.push(`${f}:${i + 1}`);
    }));
    return out.join(",");
  })()}`);
check("E", "E3 两条外围主链各自有 preventDeath（lifecycle / card-specials）",
  /preventDeath\?\.\(state, target\)/.test(raw("battle-damage-lifecycle.js"))
  && /preventDeath\?\.\(state, target\)/.test(raw("battle-card-specials.js")));
check("E", "E4 自爆主动牺牲（orc-drone-skills.js）不走免死，属既有设计口径，如实保留",
  /unit\.hp = 0;/.test(raw("orc-drone-skills.js"))
  && !/preventDeath/.test(raw("orc-drone-skills.js")));

// ---------- F/G 外神之眼 / 百眼魅魔自伤 ----------
{
  const vk = window.RuinsWithererVirtualKill({
    stat: (u, k) => (u.stats?.[k] || 0) + (k === "attack" ? u.tempAttack || 0 : 0),
    log: (_s, t) => logs.push(String(t)),
  });
  scenario("F 外神之眼", "F", (s, l) => {
    // 无其他存活同阵营角色 → 自伤分支（attacker 即 l）
    vk.eyeOfOuterGod(s, l, { uid: "w", name: "凋零者" });
  });
  scenario("G 百眼魅魔", "G", (s, l) => {
    // allies 只有 l 自己 → target === ally → 自伤
    vk.fireHundredEyes(s, { uid: "w", name: "凋零者" }, l, [l]);
  });
}

// ---------- H 前几轮修复回归 ----------
{
  fresh();
  const r = risa({ visualHp: 0, deathShown: true, deathAnimationPending: true,
    deferredDeathVisual: { hp: 0 }, deathDiscarded: true });
  const s = state([r]); setState(s);
  r.hp = 0; R.preventDeath(s, r);
  R.beginTurn(s, r);
  check("H", "H1 上轮 3 修复仍在（视觉同步 / maxHp 兜底 / isRisa 守卫）",
    r.hp === 410 && r.visualHp === 410 && !r.deathShown
    && /BattleHpValue\?\.maxHp\?\.\(unit\)/.test(raw("sakura-risa-lifecycle-skills.js"))
    && /!isRisa\(unit\)/.test(raw("sakura-risa-lifecycle-skills.js")));
  check("H", "H2 研究所【快速复生】不串台到丽莎链",
    (() => {
      const g = { uid: "g", side: "enemy", ai: "tenri_ghoul", id: "tenri_ghoul",
        hp: 0, maxHp: 200, stats: { maxHp: 200 }, statuses: [], hand: [],
        tenriRevivePending: true };
      const sg = state([g, { uid: "m", side: "enemy", hp: 100 }]); setState(sg);
      fresh();
      R.beginTurn(sg, g);
      return g.hp === 0 && !lines.includes("不死食尸鬼");
    })());
  check("H", "H3 主链 battle-damage-hit 仍调 preventDeath（本轮反向会验证它不是空转）",
    /window\.SakuraRisaSkills\?\.preventDeath\?\.\(state, target\);/.test(
      patched("battle-damage-hit.js")));
  check("H", "H4 免死条件仍完整（无手牌 / 时停 / 重复触发 / 非丽莎）",
    (() => {
      const a = risa({ hand: [] }); const sa = state([a]); setState(sa);
      a.hp = 0; R.preventDeath(sa, a);
      const b = risa({ statuses: ["时停"] }); const sb = state([b]); setState(sb);
      b.hp = 0; R.preventDeath(sb, b);
      const c2 = { uid: "x", side: "enemy", hp: 0, hand: [{}], statuses: [] };
      const sc = state([c2]); setState(sc); R.preventDeath(sc, c2);
      return !a.risaRevivePending && !b.risaRevivePending && !c2.risaRevivePending;
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
