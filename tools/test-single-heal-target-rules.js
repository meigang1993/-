// 单体恢复生命值牌（愈魔瓶 / 伤口处理）不可指定满血角色：严格检查。
//
// BUG：选目标只判「同阵营 + 存活」，满血角色也能指定；结算 healCap=0，
// 牌照常从手牌移出、进弃牌堆，战报写「恢复0点生命」，白费一张牌。
// 修法：统一判据 BattleHealTargetRules，在 UI 高亮 / chooseTarget /
// useCard 结算 / canPlay 置灰 / 双击·拖出默认目标 五处收口。
//
// REVERT=ui|choose|settle|disabled|default|text|clean 做源码级反向验证。
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
function repAll(s, a, b) { return s.split(a).join(b); }
function patched(file) {
  let s = read(file);
  const before = s;
  if (REVERT === "clean" && file === "heal-target-rules.js") {
    s = s.replace("return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;",
      "return Number.isFinite(n) ? n : 0;");
  }
  if (REVERT === "ui" && file === "ui-battle-targeting.js") {
    s = s.replace(`    // 单体恢复牌（愈魔瓶 / 伤口处理）：满血角色被指定只会「恢复0点」白费一张牌，
    // 与逻辑层 chooseTarget 同一判定源，选目标阶段就不标成可选。
    // 末尾兜底 \`side === "enemy"\` 还会把敌方标成可选（allyTarget 变量对敌方为
    // false 时落到这里），逻辑层第 59 行本就拒绝，故一并按同阵营收口。
    if (allowed && window.BattleHealTargetRules?.isSingleHealCard?.(card)
      && (unitData.side !== actorSide(battle)
        || !window.BattleHealTargetRules.needsHeal(unitData))) allowed = false;`,
      "    /* reverted: no heal UI guard */");
  }
  if (REVERT === "choose" && file === "battle-combat-targeting.js") {
    s = s.replace(`    // 单体恢复牌不能指定满血角色：否则结算 healCap=0，牌照常消耗且写「恢复0点」。
    if (window.BattleHealTargetRules?.isSingleHealCard?.(card)
      && !window.BattleHealTargetRules.needsHeal(target)) return false;`,
      "    /* reverted: no chooseTarget heal guard */");
  }
  if (REVERT === "settle" && file === "battle-combat.js") {
    s = s.replace(`    // 最底层防线：AI 直接调 useCard、存档恢复、复制牌等绕过选目标链路的路径，
    // 也不能把单体恢复牌结算到满血目标（返回 false 时牌仍在手牌，不会被消耗）。
    if (window.BattleHealTargetRules?.isSingleHealCard?.(card)
      && !window.BattleHealTargetRules.needsHeal(target)) return false;`,
      "    /* reverted: no useCard heal guard */");
  }
  if (REVERT === "disabled" && file === "battle-card-playability.js") {
    s = s.replace(`    // 单体恢复牌：同阵营没有任何受伤角色时没有合法目标，
    // 置灰避免「选了牌却点谁都没反应、牌还被消耗」。
    if (window.BattleHealTargetRules?.isSingleHealCard?.(card)
      && !sameSideUnits(battle, actor)
        .some(unit => window.BattleHealTargetRules.needsHeal(unit))) return true;`,
      "    /* reverted: no heal disabled guard */");
  }
  if (REVERT === "default") {
    if (file === "battle-action-selection.js") {
      s = repAll(s, "rules.defaultHealTarget(battle, actor)", "actor.uid");
    }
    if (file === "battle-drag-actions.js") {
      s = s.replace("rules.defaultHealTarget(state.battle, actor)", "actor.uid");
    }
  }
  if (REVERT === "text") {
    s = repAll(s, "满血角色不可指定", "可指定任意我方角色");
  }
  const expected = {
    clean: "heal-target-rules.js", ui: "ui-battle-targeting.js",
    choose: "battle-combat-targeting.js", settle: "battle-combat.js",
    disabled: "battle-card-playability.js", default: "battle-action-selection.js",
    text: "data-cards.js",
  }[REVERT];
  if (expected === file && REVERT !== "default") {
    assert.notStrictEqual(s, before, `REVERT=${REVERT} must hit ${file}`);
  }
  return s;
}

// ---------- 夹具 ----------
function makeCtx() {
  const sb = {
    console: { warn() {}, log() {} },
    Math, Number, Array, Object, Set, Map, JSON, String, RegExp, Proxy, Date,
  };
  sb.window = sb;
  sb.BattleStatusCards = { isStatus: () => false, has: () => false };
  sb.BattlePlayabilityRegistries = () => ({
    oncePerTurnRegistry: () => ({ blocked: () => false }),
    timeStopTable: () => ({ isSkillDisabled: () => false }),
    mieryulaSkillsRegistry: () => ({ blocksTactic: () => false }),
  });
  sb.WithererSkills = { displayCard: (a, c) => c };
  sb.BattleSystem = {
    active: b => (b.allies || []).concat(b.enemies || [])
      .find(u => u.uid === b.activeUid),
  };
  sb.RuinsEnemySkills = { blocksKillTarget: () => false };
  sb.CardUtils = {
    battleView: () => undefined,
    magicBulletCards: () => [],
    isKillCard: c => c?.type === "slash",
  };
  const ctx = vm.createContext(sb);
  const load = f => vm.runInContext(patched(f), ctx, { filename: f });
  [
    "heal-target-rules.js", "battle-card-playability.js",
    "battle-combat-targeting.js", "ui-battle-targeting.js",
    "ui-selection-tip.js",
  ].forEach(load);
  sb.__ctx = ctx;
  return sb;
}

const healCard = (name, healPct) => ({
  name, type: name === "愈魔瓶" ? "consume" : "tactic",
  suit: "♥", healPct, heal: 0, healScale: "attack",
  allyTarget: true, targetless: false, teamHealPct: 0,
});
const unit = (uid, hp, maxHp, extra = {}) => Object.assign({
  uid, name: uid, side: "ally", hp, maxHp, hand: [], stats: { attack: 10 },
  intent: 5, gender: "female",
}, extra);

function battle(actor, others, card) {
  actor.hand = [card];
  const b = {
    allies: [actor, ...others], enemies: [unit("e0", 60, 100, { side: "enemy" })],
    phase: 4, turn: 7, activeUid: actor.uid,
    selectedCardIndex: 0, selectedSkillCard: null, pendingTargetUid: null,
    locked: false, animQueue: [], played: [], shownPlayed: [], comboPartnerUid: null,
  };
  return b;
}
const depsOf = w => ({
  active: b => b.allies.concat(b.enemies).find(u => u.uid === b.activeUid),
  isKillCard: c => c?.type === "slash",
  draw: () => [],
});

// ---------- A：判据与浮点收敛 ----------
function testRules() {
  const w = makeCtx(), R = w.BattleHealTargetRules;
  T("A1 愈魔瓶命中判据", R.isSingleHealCard(healCard("愈魔瓶", .3)) === true);
  T("A2 伤口处理命中判据", R.isSingleHealCard(healCard("伤口处理", .1)) === true);
  T("A3 生命之泉群体牌不命中",
    R.isSingleHealCard({ name: "生命之泉", type: "consume", teamHealPct: .3,
      healPct: 0, heal: 0, allyTarget: false, targetless: true }) === false);
  T("A4 浮点尾巴视为满血",
    R.needsHeal(unit("x", 49.00000000000001, 49)) === false
    && R.needsHeal(unit("y", 48.99999999999999, 49)) === false);
  T("A5 受伤 / 存活 / 阵亡",
    R.needsHeal(unit("x", 30, 49)) === true
    && R.needsHeal(unit("y", 0, 49)) === false
    && R.needsHeal(null) === false);
  T("A6 混合效果技能卡不命中",
    R.isSingleHealCard({ name: "回春之手", allyTarget: true, healPct: .3, elranaHeal: true }) === false
    && R.isSingleHealCard({ name: "偶像之吻", allyTarget: true, healPct: .3, idolKiss: true }) === false
    && R.isSingleHealCard({ name: "咬杀", type: "slash", heal: 5 }) === false);
  T("A7 默认目标：自己受伤优先自己",
    R.defaultHealTarget({ allies: [unit("a", 30, 100), unit("b", 40, 100)] },
      unit("a", 30, 100)) === "a");
  T("A8 默认目标：自己满血转受伤队友",
    R.defaultHealTarget({ allies: [unit("a", 100, 100), unit("b", 40, 100)] },
      unit("a", 100, 100)) === "b");
  T("A9 默认目标：全员满血 null",
    R.defaultHealTarget({ allies: [unit("a", 100, 100), unit("b", 100, 100)] },
      unit("a", 100, 100)) === null);
  T("A10 敌方施法者取 enemies",
    R.defaultHealTarget({ allies: [unit("a", 100, 100)],
      enemies: [unit("e", 30, 100, { side: "enemy" })] },
      unit("e", 30, 100, { side: "enemy" })) === "e");
}

// ---------- B：UI 高亮 ----------
function testUi() {
  const w = makeCtx(), full = unit("a1", 100, 100), hurt = unit("a2", 40, 100);
  const actor = unit("a0", 100, 100), card = healCard("愈魔瓶", .3);
  const b = battle(actor, [full, hurt], card);
  w.window.state = { battle: b, view: "battle" };
  const ui = u => !!w.GameUIBattleTargeting.targetAllowed(u, b, actor, card);
  T("B1 治疗牌满血队友不可选", ui(full) === false, ui(full));
  T("B2 治疗牌受伤队友可选", ui(hurt) === true);
  T("B3 治疗牌敌方不可选", ui(b.enemies[0]) === false);
  const other = { name: "补给", type: "tactic", allyTarget: true, healPct: 0, heal: 0 };
  T("B4 非治疗 allyTarget 牌满血仍可选（不误伤）",
    !!w.GameUIBattleTargeting.targetAllowed(full, b, actor, other) === true);
}

// ---------- C：逻辑层 chooseTarget ----------
function testChoose() {
  const w = makeCtx(), full = unit("a1", 100, 100), hurt = unit("a2", 40, 100);
  const actor = unit("a0", 100, 100), card = healCard("愈魔瓶", .3);
  const b = battle(actor, [full, hurt], card), state = { battle: b };
  w.window.state = state;
  const targeting = w.BattleCombatTargeting(depsOf(w), { useCard: () => true, checkEnd: () => {} });
  T("C1 治疗牌指定满血返回 false", targeting.chooseTarget(state, full.uid) === false);
  T("C2 治疗牌指定受伤返回 true", targeting.chooseTarget(state, hurt.uid) === true);
  // 旧档残留：pendingTargetUid 指向满血时也拦得住
  b.pendingTargetUid = full.uid;
  T("C3 旧档残留满血目标不允许重新确认",
    targeting.chooseTarget(state, full.uid) === false);
  b.pendingTargetUid = null;
  const other = { name: "补给", type: "tactic", allyTarget: true, healPct: 0, heal: 0 };
  b.selectedCardIndex = 0; actor.hand = [other];
  T("C4 非治疗牌满血目标仍可选（不误伤）",
    targeting.chooseTarget(state, full.uid) === true);
  actor.hand = [healCard("愈魔瓶", .3)];
  T("C5 治疗牌敌方目标逻辑层拒绝",
    targeting.chooseTarget(state, b.enemies[0].uid) === false);
}

// ---------- D：useCard 底层防线（抽真实源码守卫行执行） ----------
function testSettle() {
  const w = makeCtx();
  const src = patched("battle-combat.js");
  const m = src.match(/if \(window\.BattleHealTargetRules\?\.isSingleHealCard\?\.\(card\)\s*&& !window\.BattleHealTargetRules\.needsHeal\(target\)\) return false;/);
  T("D1 结算层守卫在位", !!m);
  // 守卫被撤掉时等价于「结算层不拦截」，让条件函数恒 false，D2 才会精准打红。
  const cond = m ? m[0].replace(/^if \(/, "").replace(/\) return false;$/, "") : "false";
  const fn = vm.runInContext(`(function(card, target) { return (${cond}); })`,
    w.__ctx);
  const card = healCard("愈魔瓶", .3);
  T("D2 满血目标触发结算拦截（牌不消耗）",
    fn(card, unit("a", 100, 100)) === true);
  T("D3 受伤目标不拦截", fn(card, unit("a", 40, 100)) === false);
  T("D4 非治疗牌不拦截",
    fn({ name: "杀", type: "slash" }, unit("a", 100, 100)) === false);
}

// ---------- E：置灰 ----------
function testDisabled() {
  const w = makeCtx();
  const cp = w.BattleCardPlayability(depsOf(w));
  const fullAll = unit("a0", 100, 100), mate = unit("a1", 100, 100);
  const b1 = battle(fullAll, [mate], healCard("愈魔瓶", .3));
  T("E1 全员满血治疗牌置灰", cp.canPlay(fullAll, fullAll.hand[0], b1) === false);
  const hurt = unit("a2", 40, 100);
  const b2 = battle(fullAll, [mate, hurt], healCard("愈魔瓶", .3));
  T("E2 有受伤队友可用", cp.canPlay(fullAll, fullAll.hand[0], b2) === true);
  const other = { name: "补给", type: "tactic", allyTarget: true, healPct: 0, heal: 0 };
  const b3 = battle(fullAll, [mate], other);
  T("E3 非治疗牌不受置灰影响", cp.canPlay(fullAll, fullAll.hand[0], b3) === true);
}

// ---------- F：默认目标（双击 / 拖出 / 源码静态） ----------
async function testDefault() {
  const w = makeCtx();
  const quickSrc = patched("battle-action-selection.js");
  const dragSrc = patched("battle-drag-actions.js");
  T("F1 双击与拖出都接了 defaultHealTarget",
    quickSrc.includes("rules.defaultHealTarget(battle, actor)")
    && dragSrc.includes("rules.defaultHealTarget(state.battle, actor)"));
  // 真实执行 quickPlayTargetless：记录 BattleEffects.choose 收到的 uid
  const sb = w;
  vm.runInContext(patched("battle-action-selection.js"), w.__ctx,
    { filename: "battle-action-selection.js" });
  const chosen = [];
  sb.BattleEffects = { choose: (st, uid) => { chosen.push(uid); }, animating: false };
  sb.BattleSystem = {
    active: b => b.allies.find(u => u.uid === b.activeUid),
    canPlay: () => true, selectCard: () => true,
  };
  sb.render = () => {}; sb.persist = () => {};
  sb.playSelectedCard = async () => true;
  const fullSelf = unit("a0", 100, 100), hurtMate = unit("a1", 40, 100);
  const b = battle(fullSelf, [hurtMate], healCard("愈魔瓶", .3));
  sb.state = { battle: b, view: "battle" };
  sb.window.state = sb.state;
  await sb.quickPlayTargetless(0);
  T("F2 自己满血双击自动转受伤队友", chosen[0] === hurtMate.uid, chosen);
  chosen.length = 0;
  const hurtSelf = unit("a0", 40, 100), fullMate = unit("a1", 100, 100);
  const b2 = battle(hurtSelf, [fullMate], healCard("愈魔瓶", .3));
  sb.state = { battle: b2, view: "battle" };
  sb.window.state = sb.state;
  await sb.quickPlayTargetless(0);
  T("F3 自己受伤双击仍默认自己", chosen[0] === hurtSelf.uid, chosen);
  chosen.length = 0;
  const allFull = unit("a0", 100, 100), mateFull = unit("a1", 100, 100);
  const b3 = battle(allFull, [mateFull], healCard("愈魔瓶", .3));
  sb.state = { battle: b3, view: "battle" };
  sb.window.state = sb.state;
  await sb.quickPlayTargetless(0);
  T("F4 全员满血不指定任何满血目标", chosen.length === 0, chosen);
}

// ---------- G：文案与装配 ----------
function testText() {
  const cards = patched("data-cards.js");
  const tip = patched("ui-selection-tip.js");
  T("G1 两张治疗牌卡面写明满血不可指定",
    (cards.match(/满血角色不可指定/g) || []).length === 2);
  T("G2 选目标提示写明满血不可指定",
    tip.includes("满血角色不可指定")
    && !!makeCtx().UISelectionTip.tip({ battle: {}, pickedCard: healCard("愈魔瓶", .3),
      soulNeed: 0, handChoice: false }).includes("满血角色不可指定"));
  const list = fs.readFileSync(path.join(__dirname, "publish-bundles.json"), "utf8");
  T("G3 新模块登记在 startup",
    list.includes('"heal-target-rules.js"')
    && list.indexOf('"heal-target-rules.js"') < list.indexOf('"data-characters-core.js"'));
  // AI 评分：全员满血时治疗牌 0 分，不会打出后卡在 useCard 守卫上
  const ai = fs.readFileSync(path.join(ROOT, "battle-ai-tactics.js"), "utf8");
  T("G4 AI 全员满血不给治疗牌打分",
    /if \(card\.heal \|\| card\.healPct\) \{ const low = healTarget\(team\); return low \?/.test(ai));
}

async function main() {
  testRules(); testUi(); testChoose(); testSettle(); testDisabled();
  await testDefault(); testText();
  const expectedReds = {
    ui: ["B1", "B3"], choose: ["C1", "C3"], settle: ["D1", "D2"],
    disabled: ["E1"], default: ["F1", "F2", "F4"], text: ["G1", "G2"], clean: ["A4"],
  }[REVERT];
  if (REVERT) {
    const names = reds.map(r => r.split(" ")[0]);
    assert.deepStrictEqual(names.sort(), expectedReds.slice().sort(),
      `REVERT=${REVERT} reds mismatch`);
    console.log(`REVERT=${REVERT} OK  reds=${names.length} pass=${pass}`);
  } else {
    assert.strictEqual(reds.length, 0, `unexpected reds: ${reds.join(" | ")}`);
    console.log(`RESULT ${pass}/${pass}  ALL PASS`);
  }
}
main().catch(err => { console.error(err); process.exit(1); });
