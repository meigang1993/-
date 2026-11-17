// 主动恢复技能（回春之手 / 偶像之吻）满血白消耗：严格检查。
//
// 上一轮只收口了「单体恢复牌」愈魔瓶 / 伤口处理。这两个主动技能同样要
// 弃 1 张手牌 + 占用出牌阶段限一次，满血目标结算时 healCap=0，弃牌与次数
// 照样消耗，战报还按理论值写「恢复 X 点生命」，比牌侧更亏。
//
// 修法：BattleHealTargetRules 增加 isHealSkillCard / healSkillValue /
// healSkillHasAnyTarget，在 UI 高亮 / chooseTarget / canResolve / canPlay
// 置灰 / useCard 结算 / 技能执行块 六处同源收口，战报改按实际恢复量写。
//
// REVERT=rules|ui|choose|access|gray|settle|elrana|idol|report|tip 源码级反向验证。
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
  if (REVERT === "rules" && file === "heal-target-rules.js") {
    s = s.replace("  const healSkillValue = (battle, actor, card, target) => {",
      "  const healSkillValue = (battle, actor, card, target) => { return true; /* reverted */");
  }
  if (REVERT === "ui" && file === "ui-battle-targeting.js") {
    s = s.replace(`    if (allowed && window.BattleHealTargetRules?.isHealSkillCard?.(card)
      && !window.BattleHealTargetRules.healSkillValue(
        battle, actor, card, unitData)) allowed = false;`,
      "    /* reverted: no heal-skill UI guard */");
  }
  if (REVERT === "choose" && file === "battle-combat-targeting.js") {
    s = s.replace(`    if (window.BattleHealTargetRules?.isHealSkillCard?.(card)
      && !window.BattleHealTargetRules.healSkillValue(b, actor, card, target)) return false;`,
      "    /* reverted: no heal-skill chooseTarget guard */");
  }
  if (REVERT === "access" && file === "character-skill-access.js") {
    s = s.replace("    const healSkillOk = !window.BattleHealTargetRules?.isHealSkillCard?.(card)\n      || window.BattleHealTargetRules.healSkillValue(battle, actor, card, target);",
      "    const healSkillOk = true; /* reverted */");
  }
  if (REVERT === "gray" && file === "battle-card-playability.js") {
    s = s.replace(`    if (window.BattleHealTargetRules?.isHealSkillCard?.(card)
      && !window.BattleHealTargetRules.healSkillHasAnyTarget(
        battle, actor, card)) return true;`,
      "    /* reverted: no heal-skill gray guard */");
  }
  if (REVERT === "settle" && file === "battle-combat.js") {
    s = s.replace(`    if (window.BattleHealTargetRules?.isHealSkillCard?.(card)
      && !window.BattleHealTargetRules.healSkillValue(
        battleAtStart, actor, card, target)) return false;`,
      "    /* reverted: no heal-skill useCard guard */");
  }
  if (REVERT === "elrana" && file === "elrana-healing-skills.js") {
    s = s.replace(`    if (window.BattleHealTargetRules?.healSkillValue
      && !window.BattleHealTargetRules.healSkillValue(
        state.battle, actor, { elranaHeal: true, _costCard: cost }, target)) return false;`,
      "    /* reverted: no elrana settle guard */");
  }
  if (REVERT === "idol" && file === "nonoka-loki-skills.js") {
    s = s.replace(`    if (window.BattleHealTargetRules?.healSkillValue
      && !window.BattleHealTargetRules.healSkillValue(
        state.battle, actor, { idolKiss: true, _costCard: heart }, target)) return false;`,
      "    /* reverted: no idol settle guard */");
  }
  if (REVERT === "report") {
    if (file === "elrana-healing-skills.js") {
      s = repAll(s, "恢复${total}点生命。", "恢复${amount}点生命。");
      s = repAll(s, "实际恢复0点生命。", "恢复${amount}点生命。");
    }
    if (file === "nonoka-loki-skills.js") {
      s = repAll(s, "自己恢复${selfHealed}点、${target.name}恢复${partnerHealed}点生命。",
        "双方各恢复${amount}点生命。");
      s = repAll(s, "双方生命已满，未恢复生命。", "双方各恢复${amount}点生命。");
    }
  }
  if (REVERT === "tip" && file === "ui-selection-tip.js") {
    s = repAll(s, "；满血目标不可指定（弃牌后手牌全红转全体恢复时除外）", "");
    s = repAll(s, "；双方满血时不可指定", "");
  }
  const expected = {
    rules: "heal-target-rules.js", ui: "ui-battle-targeting.js",
    choose: "battle-combat-targeting.js", access: "character-skill-access.js",
    gray: "battle-card-playability.js", settle: "battle-combat.js",
    elrana: "elrana-healing-skills.js", idol: "nonoka-loki-skills.js",
    report: "elrana-healing-skills.js", tip: "ui-selection-tip.js",
  }[REVERT];
  if (expected === file && REVERT !== "report" && REVERT !== "tip") {
    assert.notStrictEqual(s, before, `REVERT=${REVERT} must hit ${file}`);
  }
  return s;
}

// ---------- 夹具 ----------
function makeCtx() {
  const clean = v => {
    const n = Number(v);
    return Number.isFinite(n) ? Number(n.toFixed(2)) : 0;
  };
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
  sb.RuinsEnemySkills = { blocksKillTarget: () => false };
  sb.CardUtils = {
    battleView: () => undefined, magicBulletCards: () => [],
    isKillCard: c => c?.type === "slash", isSingleKill: () => false,
    isEntitySingleKill: c => c?.type === "slash",
  };
  sb.BattleHpValue = {
    clean,
    healCap: (u, a) => Math.max(0, Math.min(clean(a), clean(u.maxHp) - clean(u.hp))),
    applyHeal: (u, v) => { u.hp = clean(u.hp) + clean(v); },
  };
  sb.EnemySkills = {
    beforeHeal: () => undefined, clearHolyScar: () => {}, onHeal: () => {},
  };
  sb.BattleStats = { heal: () => {} };
  sb.BattleLog = { add: (s, t) => { (s.logs ||= []).push(t); } };
  sb.BattleDrawFeedback = { action: () => "摸0张牌" };
  sb.BattleLines = { skill: () => {} };
  sb.BattleCards = { put: () => {} };
  sb.AceNanaliSkills = () => ({});
  sb.NonokaNewMoonSkills = {
    beginTurn: () => {}, endTurn: () => {},
    toggleCard: () => {}, resolveShare: () => {},
  };
  sb.GreenHat = { grant: () => true, MAX: 3 };
  sb.BattleSystem = {
    active: b => (b.allies || []).concat(b.enemies || [])
      .find(u => u.uid === b.activeUid),
  };
  const ctx = vm.createContext(sb);
  const load = f => vm.runInContext(patched(f), ctx, { filename: f });
  [
    "heal-target-rules.js", "battle-card-playability.js",
    "battle-combat-targeting.js", "ui-battle-targeting.js",
    "ui-selection-tip.js", "character-skill-access.js",
    "elrana-healing-skills.js", "elrana-ace-nanali-skills.js",
    "nonoka-loki-skills.js",
  ].forEach(load);
  sb.__ctx = ctx;
  sb.__clean = clean;
  return sb;
}

const unit = (uid, hp, maxHp, extra = {}) => Object.assign({
  uid, name: uid, side: "ally", hp, maxHp, hand: [],
  stats: { attack: 10, magic: 5 }, intent: 5, gender: "female",
}, extra);
const card = (name, extra) => Object.assign({
  name, type: "tactic", suit: "♥", _skill: true, allyTarget: true,
}, extra);
const elranaCard = () => card("回春之手", { elranaHeal: true });
const idolCard = () => card("偶像之吻", { idolKiss: true });
const heart = n => ({ name: "红桃" + n, suit: "♥", type: "tactic" });
const black = n => ({ name: "黑桃" + n, suit: "♠", type: "tactic" });

function battle(actor, others, skill, hand) {
  actor.hand = hand.slice();
  // canPlay / canResolve 会经 CharacterSkillAccess.canActor 校验技能栏，
  // 夹具必须挂上同名主动技，否则所有技能卡都会被判成不可用。
  if (!actor.skills) actor.skills = [
    { type: "active", name: "回春之手", card: elranaCard() },
    { type: "active", name: "偶像之吻", card: idolCard() },
  ];
  const b = {
    allies: [actor, ...others],
    enemies: [unit("e0", 60, 100, { side: "enemy" })],
    phase: 4, turn: 7, activeUid: actor.uid,
    selectedCardIndex: 0, selectedSkillCard: skill,
    pendingTargetUid: null, locked: false, animQueue: [],
    played: [], shownPlayed: [], comboPartnerUid: null,
  };
  return b;
}
const depsOf = () => ({
  active: b => b.allies.concat(b.enemies).find(u => u.uid === b.activeUid),
  isKillCard: c => c?.type === "slash", draw: () => [],
});
const stateOf = b => ({ battle: b, logs: [] });

// ---------- A：判据 ----------
function testRules() {
  const w = makeCtx(), R = w.BattleHealTargetRules;
  T("A1 只认两个主动恢复技能",
    R.isHealSkillCard(elranaCard()) === true
    && R.isHealSkillCard(idolCard()) === true);
  T("A2 单体恢复牌 / 其它技能不命中",
    R.isHealSkillCard({ name: "愈魔瓶", allyTarget: true, healPct: .3 }) === false
    && R.isHealSkillCard({ name: "半魅魔精华", kaiichiMilk: true }) === false
    && R.isHealSkillCard({ name: "杀", type: "slash" }) === false
    && R.isHealSkillCard(null) === false);
  T("A3 needsHeal 浮点尾巴视为满血",
    R.needsHeal(unit("x", 49.00000000000001, 49)) === false
    && R.needsHeal(unit("y", 48.99999999999999, 49)) === false
    && R.needsHeal(unit("z", 40, 49)) === true);
  const a0 = unit("a0", 100, 100), full = unit("a1", 100, 100),
    hurt = unit("a2", 40, 100);
  // 弃黑牌，剩余两张红牌 → 转全体
  const h = [black(1), heart(2), heart(3)];
  const b = battle(a0, [full, hurt], elranaCard(), h);
  T("A4 全红预判命中", R.healSkillIsGroup(b, a0, b.selectedSkillCard) === true);
  T("A5 非全红不预判全体",
    R.healSkillIsGroup(battle(a0, [full, hurt], elranaCard(),
      [heart(1), black(2), heart(3)]), a0, elranaCard()) === false);
  T("A6 弃牌对象定位不到不猜全体",
    R.healSkillIsGroup({ selectedCardIndex: 9, allies: [a0] }, a0,
      elranaCard()) === false);
  T("A7 回春之手单体分支：满血拒绝 / 受伤接受",
    R.healSkillValue(battle(a0, [full, hurt], elranaCard(), [black(1)]),
      a0, elranaCard(), full) === false
    && R.healSkillValue(battle(a0, [full, hurt], elranaCard(), [black(1)]),
      a0, elranaCard(), hurt) === true);
  const a8 = unit("a0", 100, 100), f8 = unit("a1", 100, 100),
    h8 = unit("a2", 40, 100);
  const b8 = battle(a8, [f8, h8], elranaCard(), [black(1), heart(2), heart(3)]);
  T("A8 回春之手全体分支：队里有伤者时满血目标也可指定",
    R.healSkillValue(b8, a8, b8.selectedSkillCard, f8) === true);
  T("A9 回春之手全体分支：全员满血仍拒绝",
    R.healSkillValue(battle(a0, [unit("a1", 100, 100)], elranaCard(), h),
      a0, elranaCard(), a0) === false);
  const bi = battle(a0, [full, hurt], idolCard(), [heart(1), black(2)]);
  T("A10 偶像之吻：双方满血拒绝 / 一方受伤接受",
    R.healSkillValue(bi, a0, idolCard(), full) === false
    && R.healSkillValue(bi, a0, idolCard(), hurt) === true
    && R.healSkillValue(battle(unit("a0", 40, 100), [full], idolCard(),
      [heart(1)]), unit("a0", 40, 100), idolCard(), full) === true);
  T("A11 偶像之吻：绿帽收益保留（满血男性 + 存活洛基）",
    R.healSkillValue(battle(a0, [unit("a1", 100, 100,
      { gender: "male", ref: "someone" }), unit("loki", 100, 100,
      { ref: "loki" })], idolCard(), [heart(1)]), a0, idolCard(),
    unit("a1", 100, 100, { gender: "male", ref: "someone" })) === true);
  T("A12 偶像之吻：无洛基 / 女性目标 / 自己 都拒绝",
    R.healSkillValue(battle(a0, [unit("a1", 100, 100, { gender: "male" })],
      idolCard(), [heart(1)]), a0, idolCard(),
    unit("a1", 100, 100, { gender: "male" })) === false
    && R.healSkillValue(bi, a0, idolCard(), a0) === false
    && R.healSkillValue(bi, a0, idolCard(), bi.enemies[0]) === false);
  T("A13 全员满血无合法目标 / 有伤者有",
    R.healSkillHasAnyTarget(battle(a0, [full], elranaCard(), [black(1)]),
      a0, elranaCard()) === false
    && R.healSkillHasAnyTarget(battle(a0, [hurt], elranaCard(), [black(1)]),
      a0, elranaCard()) === true);
  T("A14 牌侧判据不受影响",
    R.isSingleHealCard({ name: "愈魔瓶", allyTarget: true, healPct: .3,
      heal: 0 }) === true
    && R.isSingleHealCard(elranaCard()) === false);
}

// ---------- B：UI 高亮 ----------
function testUi() {
  const w = makeCtx();
  const a0 = unit("a0", 100, 100), full = unit("a1", 100, 100),
    hurt = unit("a2", 40, 100);
  const b = battle(a0, [full, hurt], elranaCard(), [black(1)]);
  w.window.state = { battle: b, view: "battle" };
  const ui = (u, sk) => !!w.GameUIBattleTargeting.targetAllowed(u, b, a0, sk);
  T("B1 回春之手满血队友不可选", ui(full, elranaCard()) === false);
  T("B2 回春之手受伤队友可选", ui(hurt, elranaCard()) === true);
  T("B3 回春之手敌方不可选", ui(b.enemies[0], elranaCard()) === false);
  const bi = battle(a0, [full, hurt], idolCard(), [heart(1)]);
  const uii = (u) => !!w.GameUIBattleTargeting.targetAllowed(u, bi, a0, idolCard());
  T("B4 偶像之吻双方满血目标不可选", uii(full) === false);
  T("B5 偶像之吻受伤目标可选", uii(hurt) === true);
  T("B6 偶像之吻自己 / 敌方不可选",
    uii(a0) === false && uii(bi.enemies[0]) === false);
  const bg = battle(a0, [full, hurt], elranaCard(), [black(1), heart(2), heart(3)]);
  T("B7 全红转全体时满血队友可选",
    !!w.GameUIBattleTargeting.targetAllowed(full, bg, a0,
      bg.selectedSkillCard) === true);
  T("B8 愈魔瓶仍按牌侧规则（满血拒绝、受伤可选）",
    ui(full, { name: "愈魔瓶", allyTarget: true, healPct: .3,
      heal: 0, targetless: false, teamHealPct: 0, type: "consume" }) === false
    && ui(hurt, { name: "愈魔瓶", allyTarget: true, healPct: .3,
      heal: 0, targetless: false, teamHealPct: 0, type: "consume" }) === true);
}

// ---------- C：chooseTarget ----------
function testChoose() {
  const w = makeCtx();
  const a0 = unit("a0", 100, 100), full = unit("a1", 100, 100),
    hurt = unit("a2", 40, 100);
  const b = battle(a0, [full, hurt], elranaCard(), [black(1)]);
  const state = stateOf(b);
  w.window.state = state;
  const t = w.BattleCombatTargeting(depsOf(), { useCard: () => true, checkEnd: () => {} });
  T("C1 回春之手满血目标拒绝", t.chooseTarget(state, full.uid) === false);
  T("C2 回春之手受伤目标接受", t.chooseTarget(state, hurt.uid) === true);
  const bi = battle(a0, [full, hurt], idolCard(), [heart(1)]);
  const si = stateOf(bi);
  const ti = w.BattleCombatTargeting(depsOf(), { useCard: () => true, checkEnd: () => {} });
  T("C3 偶像之吻双方满血拒绝", ti.chooseTarget(si, full.uid) === false);
  T("C4 偶像之吻受伤目标接受", ti.chooseTarget(si, hurt.uid) === true);
  T("C5 敌方目标拒绝", ti.chooseTarget(si, bi.enemies[0].uid) === false);
  const bg = battle(a0, [full, hurt], elranaCard(), [black(1), heart(2), heart(3)]);
  const tg = w.BattleCombatTargeting(depsOf(), { useCard: () => true, checkEnd: () => {} });
  T("C6 全红转全体时满血目标接受",
    tg.chooseTarget(stateOf(bg), full.uid) === true);
}

// ---------- D：canResolve ----------
function testAccess() {
  const w = makeCtx(), A = w.CharacterSkillAccess;
  const a0 = unit("a0", 100, 100), full = unit("a1", 100, 100),
    hurt = unit("a2", 40, 100);
  // 让 owns() 通过：技能栏里挂同名主动技
  const withSkills = u => Object.assign(u, { skills: [
    { type: "active", name: "回春之手", card: elranaCard() },
    { type: "active", name: "偶像之吻", card: idolCard() },
  ] });
  withSkills(a0);
  const b = battle(a0, [full, hurt], elranaCard(), [black(1)]);
  const state = stateOf(b);
  T("D1 回春之手满血目标 canResolve=false",
    A.canResolve(state, a0, full, elranaCard(), () => true) === false);
  T("D2 回春之手受伤目标 canResolve=true",
    A.canResolve(state, a0, hurt, elranaCard(), () => true) === true);
  const bi = battle(a0, [full, hurt], idolCard(), [heart(1)]);
  T("D3 偶像之吻双方满血 canResolve=false",
    A.canResolve(stateOf(bi), a0, full, idolCard(), () => true) === false);
  T("D4 非恢复技能不受影响",
    A.canResolve(stateOf(b), a0, full,
      { name: "杀", type: "slash" }, () => true) === true);
}

// ---------- E：canPlay 置灰 ----------
function testGray() {
  const w = makeCtx();
  const cp = w.BattleCardPlayability(depsOf());
  const a0 = unit("a0", 100, 100), full = unit("a1", 100, 100),
    hurt = unit("a2", 40, 100);
  const allFull = battle(a0, [full], elranaCard(), [black(1)]);
  T("E1 全员满血回春之手置灰",
    cp.canPlay(a0, elranaCard(), allFull) === false);
  T("E2 有受伤队友可用",
    cp.canPlay(a0, elranaCard(), battle(a0, [full, hurt], elranaCard(),
      [black(1)])) === true);
  T("E3 全员满血偶像之吻置灰",
    cp.canPlay(a0, idolCard(), battle(a0, [full], idolCard(),
      [heart(1)])) === false);
  T("E4 有受伤队友偶像之吻可用",
    cp.canPlay(a0, idolCard(), battle(a0, [full, hurt], idolCard(),
      [heart(1)])) === true);
  T("E5 非恢复技能不受影响",
    cp.canPlay(a0, { name: "杀", type: "slash" }, allFull) === true);
}

// ---------- F：useCard 最底层防线（抽真实守卫行执行） ----------
function testSettleGuard() {
  const w = makeCtx();
  const src = patched("battle-combat.js");
  const m = src.match(/if \(window\.BattleHealTargetRules\?\.isHealSkillCard\?\.\(card\)\s*&& !window\.BattleHealTargetRules\.healSkillValue\(\s*battleAtStart, actor, card, target\)\) return false;/);
  T("F1 结算层守卫在位", !!m);
  const cond = m ? m[0].replace(/^if \(/, "").replace(/\) return false;$/, "")
    .replace(/battleAtStart/g, "battle") : "false";
  const fn = vm.runInContext(
    `(function(battle, actor, card, target) { return (${cond}); })`, w.__ctx);
  const a0 = unit("a0", 100, 100), full = unit("a1", 100, 100),
    hurt = unit("a2", 40, 100);
  const b = battle(a0, [full, hurt], elranaCard(), [black(1)]);
  T("F2 满血目标触发结算拦截", fn(b, a0, elranaCard(), full) === true);
  T("F3 受伤目标不拦截", fn(b, a0, elranaCard(), hurt) === false);
  T("F4 非恢复技能不拦截",
    fn(b, a0, { name: "杀", type: "slash" }, full) === false);
}

// ---------- G：技能执行块真实结算 ----------
function testExecution() {
  const w = makeCtx();
  const api = { draw: () => 0, pushFloat: () => {}, damage: {} };
  const ctx = {
    selectedCostCard: actor => w.state.battle.selectedCardIndex,
    statOf: (u, k) => u.stats?.[k] || 0,
  };
  const a0 = unit("a0", 100, 100), full = unit("a1", 100, 100),
    hurt = unit("a2", 40, 100);
  // 回春之手：满血目标 → 返回 false、不弃牌、不置 usedElranaHeal
  const b1 = battle(a0, [full, hurt], elranaCard(), [black(1)]);
  const s1 = stateOf(b1); w.state = s1;
  const r1 = w.ElranaAceNanaliSkills.handleSpecialCard(
    s1, a0, full, elranaCard(), api, ctx);
  T("G1 回春之手满血目标结算返回 false", r1 === false, r1);
  T("G2 满血目标不弃牌 / 不消耗限一次",
    a0.hand.length === 1 && !a0.usedElranaHeal && s1.logs.length === 0);
  // 受伤目标刻意接近满血：理论恢复 5 点，healCap 实际只有 2 点，
  // 「战报按理论值写」的旧文案才会被断言抓到，而不是碰巧数字相同。
  const nearFull = unit("a2", 98, 100);
  const b2 = battle(a0, [full, nearFull], elranaCard(), [black(1)]);
  const s2 = stateOf(b2); w.state = s2;
  delete a0.usedElranaHeal;
  const r2 = w.ElranaAceNanaliSkills.handleSpecialCard(
    s2, a0, nearFull, elranaCard(), api, ctx);
  const real2 = nearFull.hp - 98;
  T("G3 回春之手受伤目标正常结算", r2 === true && real2 > 0, nearFull.hp);
  T("G4 战报写实际恢复量、不写理论值 X",
    s2.logs.some(t => t.includes(`恢复${real2}点生命`))
    && real2 < 5, s2.logs);
  // 全红转全体：合计值必须等于全体实际恢复总量
  const nearFull3 = unit("a2", 98, 100);
  const b3 = battle(a0, [full, nearFull3], elranaCard(),
    [black(1), heart(2), heart(3)]);
  const s3 = stateOf(b3); w.state = s3;
  delete a0.usedElranaHeal;
  w.ElranaAceNanaliSkills.handleSpecialCard(
    s3, a0, full, elranaCard(), api, ctx);
  const total3 = (full.hp - 100) + (nearFull3.hp - 98);
  T("G5 全红转全体战报写合计且等于实际总恢复",
    s3.logs.some(t => t.includes("我方全体合计")
      && t.includes(`恢复${total3}点生命`)), s3.logs);
  // 偶像之吻：双方满血 → 返回 false、不弃♥牌、不置 usedIdolKiss
  const a1 = unit("a0", 100, 100), p1 = unit("a1", 100, 100);
  const bi = battle(a1, [p1], idolCard(), [heart(1)]);
  const si = stateOf(bi); w.state = si;
  const ri = w.NonokaLokiSkills.handleSpecialCard(
    si, a1, p1, Object.assign(idolCard(), { _costCard: a1.hand[0] }),
    { statOf: (u, k) => u.stats?.[k] || 0, damage: {},
      pushFloat: () => {}, draw: () => 0 }, null);
  T("G6 偶像之吻双方满血结算返回 false", ri === false, ri);
  T("G7 双方满血不弃牌 / 不消耗限一次",
    a1.hand.length === 1 && !a1.usedIdolKiss && si.logs.length === 0);
  // 一方受伤：战报按实际值分列
  const a2 = unit("a0", 40, 100), p2 = unit("a1", 100, 100);
  const bi2 = battle(a2, [p2], idolCard(), [heart(1)]);
  const si2 = stateOf(bi2); w.state = si2;
  w.NonokaLokiSkills.handleSpecialCard(
    si2, a2, p2, Object.assign(idolCard(), { _costCard: a2.hand[0] }),
    { statOf: (u, k) => u.stats?.[k] || 0, damage: {},
      pushFloat: () => {}, draw: () => 0 }, null);
  const realSelf = a2.hp - 40, realPartner = p2.hp - 100;
  T("G8 偶像之吻战报按实际值分列、不谎报",
    si2.logs.some(t => t.includes(`自己恢复${realSelf}点`)
      && t.includes(`恢复${realPartner}点生命`))
    && !si2.logs.some(t => t.includes("双方各恢复")), si2.logs);
}

// ---------- H：文案 / 装配 / 副作用 ----------
function testText() {
  const tip = patched("ui-selection-tip.js");
  const uiTip = w => w.UISelectionTip.tip;
  const w = makeCtx();
  T("H1 回春之手提示写明满血不可指定（含全红例外）",
    uiTip(w)({ battle: {}, pickedCard: elranaCard(), soulNeed: 0,
      handChoice: false }).includes("满血目标不可指定")
    && uiTip(w)({ battle: {}, pickedCard: elranaCard(), soulNeed: 0,
      handChoice: false }).includes("全红转全体"));
  T("H2 偶像之吻提示写明双方满血不可指定",
    uiTip(w)({ battle: {}, pickedCard: idolCard(), soulNeed: 0,
      handChoice: false }).includes("双方满血时不可指定"));
  const list = fs.readFileSync(path.join(__dirname, "publish-bundles.json"), "utf8");
  T("H3 规则模块登记在 startup 且早于技能消费方",
    list.includes('"heal-target-rules.js"')
    && list.indexOf('"heal-target-rules.js"')
      < list.indexOf('"elrana-ace-nanali-skills.js"'));
  T("H4 六处接线静态在位", [
    ["ui-battle-targeting.js", "isHealSkillCard"],
    ["battle-combat-targeting.js", "isHealSkillCard"],
    ["character-skill-access.js", "healSkillValue"],
    ["battle-card-playability.js", "healSkillHasAnyTarget"],
    ["battle-combat-defeat.js", "battle-combat.js", "isHealSkillCard"],
    ["elrana-healing-skills.js", "healSkillValue"],
  ].every(([f, key]) => read(f).includes(key)));
  // 自动/被动恢复技能无「指定目标」环节，且 0 恢复时都不该写战报/触发：
  const auto = ["hitwell-skills.js", "enemy-skills.js",
    "underwater-train-bite-skills.js", "angelica-luka-skills.js"];
  T("H5 自动恢复技能仍保留 0 恢复守卫",
    auto.every(f => /if \((?:!healed|healed <= 0|healed > 0)\)/.test(read(f))));
  T("H6 半魅魔血治疗不因本次改动被收口（无指定/消耗）",
    read("hoshino-kaiichi-skills.js").includes("kaiichiBloodHeal")
    && !read("hoshino-kaiichi-skills.js").includes("isHealSkillCard"));
}

async function main() {
  testRules(); testUi(); testChoose(); testAccess(); testGray();
  testSettleGuard(); testExecution(); testText();
  const expectedReds = {
    rules: ["A7", "A9", "A10", "A12", "A13", "B1", "B4", "C1", "C3",
      "D1", "D3", "E1", "E3", "F2", "G1", "G2", "G6", "G7"],
    ui: ["B1", "B4"], choose: ["C1", "C3"], access: ["D1", "D3"],
    gray: ["E1", "E3"], settle: ["F1", "F2"], elrana: ["G1", "G2"],
    idol: ["G6", "G7"], report: ["G4", "G5", "G8"], tip: ["H1", "H2"],
  }[REVERT];
  if (REVERT) {
    const names = reds.map(r => r.split(" ")[0]);
    assert.deepStrictEqual(names.sort(), expectedReds.slice().sort(),
      `REVERT=${REVERT} reds mismatch`);
    console.log(`REVERT=${REVERT} OK  reds=${names.length} pass=${pass} :: ${names.join(",")}`);
  } else {
    assert.strictEqual(reds.length, 0, `unexpected reds: ${reds.join(" | ")}`);
    console.log(`RESULT ${pass}/${pass}  ALL PASS`);
  }
}
main().catch(err => { console.error(err); process.exit(1); });
