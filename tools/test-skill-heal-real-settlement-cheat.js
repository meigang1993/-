// 回血技能「真实结算」作弊验证：不只读公式，而是真实加载回血技能模块并调用
// 其结算入口（elranaHeal / endTurn / handleSpecialCard），构造 1000 张牌、
// 1e9 生命上限、1000 枚标记的作弊 state，核对实际恢复量、hp、战报与守卫。
// REVERT=heal 把 healPctStacks 撤回常量 1，A~D 段须精准打红，E 段保持绿。
const fs = require("fs");
const vm = require("vm");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "src", "original");
const REVERT = process.env.REVERT || "none";
const OLD = "const healPctStacks = (actor, pct, n) => pctStacks(currentMaxHp(actor), pct, n);";
const NEW = "const healPctStacks = (actor, pct, n) => 1;";
function read(f) {
  let s = fs.readFileSync(path.join(SRC, f), "utf8");
  if (REVERT === "heal" && f === "hp-value.js") {
    if (!s.includes(OLD)) throw new Error("REVERT=heal target missing in hp-value.js");
    s = s.replace(OLD, NEW);
  }
  return s;
}

let pass = 0;
const reds = {};
function T(seg, name, cond, extra) {
  if (cond) { pass += 1; return; }
  (reds[seg] ||= []).push(name);
  console.log(`  RED [${seg}] ${name}`, extra === undefined ? "" : JSON.stringify(extra));
}

function makeBox() {
  const logs = [];
  const noop = () => {};
  const target = {};
  const lazy = () => new Proxy({}, {
    get(o, k) { return k in o ? o[k] : (typeof k === "string" ? (o[k] = () => undefined) : undefined); },
  });
  const win = new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k === "string" && /^[A-Z]/.test(k)) return (t[k] = lazy());
      return undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
    has() { return true; },
  });
  const ctx = { window: win, console, Math, JSON, Number, Array, Object, String,
    Boolean, Symbol, Date, RegExp, Error, Infinity, NaN, parseInt, parseFloat, isNaN };
  vm.createContext(ctx);
  Object.assign(win, {
    BattleLog: { add: (s, text) => { logs.push(String(text)); } },
    BattleLines: { skill: noop, line: noop },
    BattleCards: { put: noop },
    BattleStats: { heal: noop, responded: noop },
    BattleDrawFeedback: { action: (u, n) => `摸${n}张牌` },
    BattleHealTargetRules: null, // 由真实模块覆盖
    EnemySkills: { beforeHeal: () => undefined, clearHolyScar: noop, onHeal: noop },
    GreenHat: { grant: () => true, MAX: 5 },
    NonokaNewMoonSkills: { beginTurn: noop, endTurn: noop, trackCard: noop, toggleCard: noop, resolveShare: noop },
    CardUtils: { isKillCard: c => c?.type === "slash" },
    GameRandom: { id: () => "cheat" },
  });
  const load = f => vm.runInContext(read(f), ctx, { filename: f });
  return { win, logs, load };
}
const box = makeBox();
["hp-value.js", "heal-target-rules.js", "elrana-healing-skills.js",
  "nonoka-loki-skills.js", "angelica-luka-skills.js"].forEach(box.load);
const W = box.win;
const H = W.BattleHpValue;
const R = W.BattleHealTargetRules;
const { logs } = box;

const noop = () => {};
const apiOf = () => ({ damage: noop, pushFloat: noop, draw: () => 0 });
const depsOf = () => ({ statOf: (u, k) => u.stats?.[k] || 0, draw: () => 0, pushFloat: noop, damage: noop });
const elranaDeps = {
  alive: u => !!u && u.hp > 0,
  visible: u => (u.hand || []).filter(c => !c._pendingDraw),
  red: c => c?.suit === "♥" || c?.suit === "♦",
  stat: (u, k) => u.stats?.[k] || 0,
  line: noop,
};
const elranaCtx = () => ({ selectedCostCard: () => 0, statOf: (u, k) => u.stats?.[k] || 0 });
const elrana = W.ElranaHealingSkills(elranaDeps);
const mkHand = (n, suit = "♥") => Array.from({ length: n }, (_, i) => ({ name: `牌${i}`, suit, type: "tactic" }));
const mkUnit = (o) => Object.assign({ uid: "u", name: "单位", side: "ally", hp: 1,
  maxHp: 1e9, stats: { magic: 0, maxHp: 1e9 }, hand: [] }, o);
const mkState = allies => ({ battle: { allies, enemies: [], turn: 1, phase: 4, activeUid: allies[0].uid, selectedCardIndex: 0 } });

// ---------- A：回春之手（真实 elranaHeal，3 份验公式、1000 份验上限与战报） ----------
{
  const actor = mkUnit({ uid: "a", ref: "elrana", name: "艾尔拉娜", stats: { magic: 5, maxHp: 1e9 } });
  const target = mkUnit({ uid: "t", name: "队友", maxHp: 1e13, stats: { maxHp: 1e13 } });
  const cost = { name: "弃牌", suit: "♠", type: "tactic" };
  actor.hand = [cost, { name: "红1", suit: "♥" }, { name: "红2", suit: "♥" }, { name: "黑1", suit: "♠" }];
  const state = mkState([actor, target]);
  logs.length = 0;
  const r = elrana.elranaHeal(state, actor, target, apiOf(), elranaCtx());
  const expect = H.pctStacks(H.currentMaxHp(actor), 10, 3) + 5;
  T("A", "真实结算返回 true 且弃 1 张牌", r === true && actor.hand.length === 3);
  T("A", `3 张牌 = 施术者当前上限10%×3 + 魔力（${expect}）`, target.hp === 1 + expect, { hp: target.hp, expect });
  T("A", "战报写实际恢复量", logs.some(t => t.includes(`恢复${expect}点生命`)));
  T("A", "不是旧口径「每张 +1」", expect !== 3 + 5);
  T("A", "不按目标最大生命为基数", expect !== H.pctStacks(1e13, 10, 3) + 5);
  T("A", "限一次：二次调用不再回血", (() => {
    const before = target.hp; logs.length = 0;
    elrana.elranaHeal(state, actor, target, apiOf(), elranaCtx());
    return target.hp === before && logs.length === 0;
  })());

  // 1000 张牌：公式远大于缺额，真实结算必须按 healCap 截断且战报不谎报理论值
  const a2 = mkUnit({ uid: "a2", ref: "elrana", name: "艾尔拉娜", stats: { magic: 5, maxHp: 1e9 } });
  const t2 = mkUnit({ uid: "t2", name: "队友" });
  a2.hand = [{ name: "弃牌", suit: "♠" }, ...mkHand(999), { name: "黑桃", suit: "♠" }];
  const s2 = mkState([a2, t2]);
  logs.length = 0;
  elrana.elranaHeal(s2, a2, t2, apiOf(), elranaCtx());
  const capped = 1e9 - 1;
  T("A", "1000 张牌恢复量被上限截断（不溢出）", t2.hp === 1e9 && Number.isInteger(t2.hp));
  T("A", "战报写截断后的真实值而非理论值", logs.some(t => t.includes(`恢复${capped}点生命`))
    && !logs.some(t => t.includes(`恢复${H.pctStacks(1e9, 10, 1000) + 5}点生命`)));

  // 满血目标：真实结算层兜底拒绝，不弃牌、不耗限一次
  // 施术者自己也满血、剩余手牌掺黑桃不转「我方全体恢复」，
  // 否则组恢复分支会因「队里有人需要恢复」放行，测的就不是单体满血守卫了。
  const a3 = mkUnit({ uid: "a3", ref: "elrana", hp: 1e9, stats: { magic: 0, maxHp: 1e9 } });
  const t3 = mkUnit({ uid: "t3", hp: 1e9 });
  a3.hand = [{ name: "弃牌", suit: "♠" }, ...mkHand(2), { name: "黑桃", suit: "♠" }];
  const s3 = mkState([a3, t3]);
  logs.length = 0;
  const r3 = elrana.elranaHeal(s3, a3, t3, apiOf(), elranaCtx());
  T("A", "满血目标被真实判据拒绝", r3 === false && a3.hand.length === 4
    && !a3.usedElranaHeal && logs.length === 0);

  // 被压制（beforeHeal=0）时战报必须写实际 0 点
  const a4 = mkUnit({ uid: "a4", ref: "elrana", stats: { magic: 0 } });
  const t4 = mkUnit({ uid: "t4" });
  a4.hand = [{ name: "弃牌", suit: "♠" }, ...mkHand(2), { name: "黑桃", suit: "♠" }];
  const s4 = mkState([a4, t4]);
  const origBeforeHeal = W.EnemySkills.beforeHeal;
  W.EnemySkills.beforeHeal = () => 0;
  logs.length = 0;
  elrana.elranaHeal(s4, a4, t4, apiOf(), elranaCtx());
  W.EnemySkills.beforeHeal = origBeforeHeal;
  T("A", "被压制时战报写实际恢复0点生命", t4.hp === 1 && logs.some(t => t.includes("实际恢复0点生命")));
  logs.length = 0;
}

// ---------- B：再生肉体 / 再生之躯（真实 endTurn） ----------
{
  const unit = mkUnit({ uid: "b", ref: "elrana", name: "艾尔拉娜", hand: mkHand(3, "♥") });
  const state = mkState([unit]);
  logs.length = 0;
  elrana.endTurn(state, unit, apiOf());
  const expect = H.pctStacks(H.currentMaxHp(unit), 10, 3);
  T("B", `3 张红牌按当前上限10%线性（${expect}）`, unit.hp === 1 + expect);
  T("B", "战报写真实恢复量", logs.some(t => t.includes(`恢复${expect}点生命`)));

  const u2 = mkUnit({ uid: "b2", ref: "little_elrana", name: "小艾尔拉娜", hand: mkHand(1000, "♥") });
  const s2 = mkState([u2]);
  logs.length = 0;
  elrana.endTurn(s2, u2, apiOf());
  T("B", "1000 张红牌不溢出且封顶", u2.hp === 1e9 && Number.isInteger(u2.hp));
  T("B", "战报写 999999999 而非理论值", logs.some(t => t.includes("恢复999999999点生命")));

  const u3 = mkUnit({ uid: "b3", ref: "elrana", hp: 1e9, hand: mkHand(3, "♥") });
  logs.length = 0;
  elrana.endTurn(mkState([u3]), u3, apiOf());
  T("B", "满血改为摸牌、不回血", u3.hp === 1e9 && logs.some(t => t.includes("生命已满")));
  logs.length = 0;
}

// ---------- C：偶像之吻（真实 handleSpecialCard） ----------
{
  const actor = mkUnit({ uid: "n", name: "诺诺卡", stats: { magic: 5, maxHp: 1e9 } });
  const partner = mkUnit({ uid: "p", name: "搭档", maxHp: 1e13, stats: { maxHp: 1e13 }, gender: "female" });
  const heart = { name: "红桃", suit: "♥" };
  actor.hand = [heart, ...mkHand(3)];
  const state = mkState([actor, partner]);
  logs.length = 0;
  const r = W.NonokaLokiSkills.handleSpecialCard(state, actor, partner,
    { idolKiss: true, _costCard: heart }, depsOf());
  const expect = H.pctStacks(H.currentMaxHp(actor), 10, 3) + 5;
  T("C", "真实结算返回 true 且弃 1 张♥", r === true && actor.hand.length === 3);
  T("C", `双方各按施术者上限10%×3 + 魔力（${expect}）`,
    actor.hp === 1 + expect && partner.hp === 1 + expect, { actor: actor.hp, partner: partner.hp, expect });
  T("C", "战报分列双方实际恢复量", logs.some(t => t.includes(`自己恢复${expect}点`)
    && t.includes(`恢复${expect}点生命`)));
  T("C", "不按目标上限为基数", expect !== H.pctStacks(1e13, 10, 3) + 5);

  const a2 = mkUnit({ uid: "n2", name: "诺诺卡", stats: { magic: 0 } });
  const p2 = mkUnit({ uid: "p2", name: "搭档", gender: "female" });
  a2.hand = [{ name: "红桃", suit: "♥" }, ...mkHand(1000)];
  const heart2 = a2.hand[0];
  logs.length = 0;
  W.NonokaLokiSkills.handleSpecialCard(mkState([a2, p2]), a2, p2,
    { idolKiss: true, _costCard: heart2 }, depsOf());
  T("C", "1000 张牌双方均封顶不溢出", a2.hp === 1e9 && p2.hp === 1e9);
  T("C", "战报写各自 999999999 真实值", logs.some(t => t.includes("自己恢复999999999点")
    && t.includes("恢复999999999点生命")));

  // 双方满血且无绿帽收益 → 真实判据拒绝，不弃牌、不耗限一次
  const a3 = mkUnit({ uid: "n3", hp: 1e9, stats: { magic: 0 } });
  const p3 = mkUnit({ uid: "p3", hp: 1e9, gender: "female" });
  a3.hand = [{ name: "红桃", suit: "♥" }, ...mkHand(2)];
  const heart3 = a3.hand[0];
  logs.length = 0;
  const r3 = W.NonokaLokiSkills.handleSpecialCard(mkState([a3, p3]), a3, p3,
    { idolKiss: true, _costCard: heart3 }, depsOf());
  T("C", "双方满血无收益时拒绝白耗", r3 === false && a3.hand.length === 3
    && !a3.usedIdolKiss && logs.length === 0);

  // 绿帽收益按既有玩法保留：双方满血仍可发动
  const a4 = mkUnit({ uid: "n4", hp: 1e9, stats: { magic: 0 } });
  const p4 = mkUnit({ uid: "p4", hp: 1e9, gender: "male", ref: "someone" });
  const loki = mkUnit({ uid: "l", ref: "loki", hp: 10, stats: { attack: 100 } });
  a4.hand = [{ name: "红桃", suit: "♥" }, ...mkHand(2)];
  const heart4 = a4.hand[0];
  const s4 = mkState([a4, p4, loki]);
  logs.length = 0;
  const r4 = W.NonokaLokiSkills.handleSpecialCard(s4, a4, p4,
    { idolKiss: true, _costCard: heart4 }, depsOf());
  T("C", "绿帽收益保留：满血仍可发动且不谎报回血", r4 === true && a4.usedIdolKiss === true
    && a4.hand.length === 2 && logs.some(t => t.includes("双方生命已满，未恢复生命")));
  logs.length = 0;
}

// ---------- D：狂战意志（真实 handleSpecialCard，1000 枚标记） ----------
{
  const actor = mkUnit({ uid: "g", ref: "angelica", name: "安洁莉卡",
    rageMarks: 1000, hand: [] });
  const state = mkState([actor]);
  logs.length = 0;
  const r = W.AngelicaLukaSkills.handleSpecialCard(state, actor, null,
    { berserkWill: true }, depsOf(), { pushFloat: noop });
  const expect = H.pctStacks(H.currentMaxHp(actor), 10, 1000);
  T("D", "真实结算返回 true、标记清零", r === true && actor.rageMarks === 0);
  T("D", `1000 枚标记按当前上限10%线性并封顶（理论${expect}）`, actor.hp === 1e9);
  T("D", "战报写明枚数×当前生命上限×10%", logs.some(t => t.includes("1000枚×当前生命上限1000000000的10%"))
    && logs.some(t => t.includes("恢复999999999点生命")));
  T("D", "限一次：二次发动不再回血", (() => {
    const before = actor.hp; logs.length = 0;
    W.AngelicaLukaSkills.handleSpecialCard(state, actor, null,
      { berserkWill: true }, depsOf(), { pushFloat: noop });
    return actor.hp === before && logs.length === 0;
  })());
  logs.length = 0;
}

// ---------- E：公式性质与接线（不依赖 healPctStacks 返回值，REVERT 时保持绿） ----------
{
  const finiteInt = n => Number.isFinite(n) && Number.isInteger(n) && n >= 0;
  T("E", "1000 份公式有限整数且严格线性", (() => {
    const one = H.pctStacks(1e9, 10, 1);
    return finiteInt(one) && H.pctStacks(1e9, 10, 1000) === one * 1000;
  })());
  T("E", "基数是施术者当前最大生命（含强化写回）",
    H.currentMaxHp({ maxHp: 127, stats: { maxHp: 124 } }) === 127);
  T("E", "单份至少 1 点 / 0 份归零 / NaN 安全",
    H.pctStacks(0, 10, 1) === 1 && H.pctStacks(1e9, 10, 0) === 0 && H.pctStacks(NaN, 10, 3) === 3);
  T("E", "applyHeal 不超上限", H.applyHeal({ hp: 1, maxHp: 127 }, 1e6) === 127);
  T("E", "满血判据：hp>=maxHp 不算需要恢复", R.needsHeal({ hp: 127, maxHp: 127 }) === false
    && R.needsHeal({ hp: 126, maxHp: 127 }) === true);
  const has = (f, x) => fs.readFileSync(path.join(SRC, f), "utf8").includes(x);
  T("E", "四个回血技能均接 healPctStacks", ["elrana-healing-skills.js", "nonoka-loki-skills.js",
    "enemy-skills.js", "angelica-luka-skills.js"].every(f => has(f, "healPctStacks")));
  T("E", "角色强化模块不参与百分比", !has("character-enhance.js", "pctStacks"));
}

const total = pass + Object.values(reds).reduce((n, a) => n + a.length, 0);
console.log(`\nRESULT ${pass}/${total}  REVERT=${REVERT}`);
if (REVERT !== "none") {
  const hit = ["A", "B", "C", "D"].reduce((n, s) => n + (reds[s] || []).length, 0);
  const other = (reds.E || []).length;
  const each = ["A", "B", "C", "D"].every(s => (reds[s] || []).length > 0);
  console.log(each && other === 0 ? `REVERT_OK heal: ${hit} targeted red(s) in A~D`
    : `REVERT_FAIL heal: A~D=${hit} each=${each} E=${other}`);
  process.exit(each && other === 0 ? 0 : 1);
}
process.exit(Object.keys(reds).length ? 1 : 0);
