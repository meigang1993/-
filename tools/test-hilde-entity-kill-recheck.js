// 【暗幕隐身】改「实体单体杀不可指定」后的独立复查：真实牌形态、UI/逻辑一致性、
// 入口防护、存档排除、文案与装配顺序。REVERT=entity|ui|guard|text 做源码级反向验证。
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
  const before = s;
  if (REVERT === "entity" && file === "ruins-elite-skills.js") {
    s = s.replace(
      "const blocksKillTarget = (unit, card) => entitySingleKill(card) && stealthOn(unit);",
      "const blocksKillTarget = (unit, card) => !!card && stealthOn(unit) && singleKill(card);");
  }
  if (REVERT === "ui" && file === "ui-battle-targeting.js") {
    s = s.replace(
      "if (allowed && window.RuinsEnemySkills?.blocksKillTarget?.(unitData, card)) allowed = false;",
      "/* reverted: no UI guard */");
  }
  if (REVERT === "guard" && file === "battle-combat-targeting.js") {
    s = s.replace(
      "if (window.RuinsEnemySkills?.blocksKillTarget?.(target, card)) return false;",
      "/* reverted: no logic guard */");
  }
  if (REVERT === "text" && file === "data-ruins-sand-city-enemies.js") {
    s = s.replace("你不会成为实体单体【杀】牌的目标；虚拟【杀】不受此限。",
      "你不会成为单体【杀】牌的目标。");
  }
  const expected = {
    entity: "ruins-elite-skills.js", ui: "ui-battle-targeting.js",
    guard: "battle-combat-targeting.js", text: "data-ruins-sand-city-enemies.js",
  }[REVERT];
  if (expected === file) assert.notStrictEqual(s, before, `REVERT=${REVERT} must hit ${file}`);
  return s;
}

const codex = [
  { name: "杀（普攻）", type: "slash", scale: "attack", suit: "♠" },
  { name: "刺杀", type: "slash", scale: "attack", suit: "♠" },
  { name: "咬杀", type: "slash", scale: "attack", suit: "♠" },
  { name: "雷杀", type: "slash", scale: "attack", suit: "♠" },
  { name: "机枪扫杀", type: "slash", scale: "attack", sweep: true, suit: "♠" },
];

function makeCtx(opts = {}) {
  const sb = {
    console: { warn() {}, log() {} },
    Math, Number, Array, Object, Set, Map, JSON, String, RegExp, Proxy, Date,
  };
  sb.window = sb;
  sb.GameDataCards = { cardCodex: codex, baseDeck: [], eliteCards: [] };
  sb.BattleStatusCards = { isStatus: () => false, has: () => false };
  sb.MieryulaTimeStop = { isSkillDisabled: u => !!opts.stopped?.has?.(u.uid) };
  sb.BattleLog = { add: (st, text) => { (st.log ||= []).push(text); } };
  sb.BattleLines = { skill() {} };
  sb.RelicSystem = { hasEquipped: (st, u, name) => name === "鲨鱼头套" && !!opts.sharkHead };
  sb.WithererSkills = { displayCard: (a, c) => c };
  sb.BattlePlayabilityRegistries = () => ({
    oncePerTurnRegistry: () => ({ blocked: () => false }),
    timeStopTable: () => ({ isSkillDisabled: () => false }),
    mieryulaSkillsRegistry: () => ({ blocksTactic: () => false }),
  });
  const ctx = vm.createContext(sb);
  const load = f => vm.runInContext(patched(f), ctx, { filename: f });
  [
    "card-utils.js", "ruins-elite-skills.js", "ruins-enemy-skills.js",
    "underwater-train-bite-skills.js", "battle-card-playability.js",
    "battle-combat-targeting.js", "ui-battle-targeting.js",
  ].forEach(load);
  sb.UnderwaterTrainSkills = {
    displayBiteCard: sb.UnderwaterTrainBiteSkills({
      singleSlash: sb.CardUtils.isSingleKill,
    }).displayBiteCard,
  };
  return sb;
}

function hilde(uid = "h0", extra = {}) {
  return Object.assign({
    uid, name: "内英组杀手希尔德", side: "enemy", ai: "ruins_hilde",
    hp: 100, maxHp: 100, block: 0, hand: [{ name: "黑牌", suit: "♠", type: "slash" }],
    stats: { attack: 26 },
  }, extra);
}
function actor() {
  return {
    uid: "a0", name: "玩家", side: "ally", hp: 100, maxHp: 100,
    block: 0, intent: 5, stats: { attack: 10 }, hand: [],
  };
}

// ---------- A：真实牌形态的判定源口径 ----------
function testShapes() {
  const w = makeCtx();
  const j = (u, c) => !!w.RuinsEnemySkills.blocksKillTarget(u, c);
  const h = hilde();
  const C = w.CardUtils;
  const entity = name => C.cloneEntity(name, { suit: "♠" });
  T("A1 手牌实体单体杀不可指定", j(h, entity("杀（普攻）")) === true);
  T("A2 实体衍生单体杀（雷杀）不可指定", j(h, entity("雷杀")) === true);
  T("A3 实体转换杀 convertAs 不可指定",
    j(h, C.convertAs("刺杀", { name: "杀（普攻）", suit: "♠" })) === true);
  // 真实饰品主动技：convertAs + _skill + _entityConversion
  const relicKill = C.convertAs("魅杀", { name: "杀（普攻）", suit: "♠" }, {
    _skill: true, _relicSkill: true, _skipHandMove: true,
    _entitySourceCard: {}, _entityConversion: true,
  });
  T("A4 饰品主动技转换的实体杀不可指定", j(h, relicKill) === true);
  // 冰心双刺剑：获得阶段就地转换，带 _iceDagger + convertedFrom
  const ice = C.convertAs("刺杀", { name: "杀（普攻）", suit: "♠" }, {
    _iceDagger: true, noIntentCost: true, convertedFrom: "杀（普攻）",
  });
  T("A5 冰心双刺剑转换的实体杀不可指定", j(h, ice) === true);
  // 鲨鱼头套：displayBiteCard 产物（实体牌展开 + 咬杀形态）
  const bitten = { ...entity("杀（普攻）"), name: "咬杀",
    convertedFrom: "杀（普攻）", biteKill: true, power: 0 };
  T("A6 鲨鱼头套咬杀显示牌不可指定", j(h, bitten) === true);
  // 凋零者暴走显示牌（displayCard 产物，实体样）
  const berserk = { ...entity("杀（普攻）"), name: "杀（普攻）",
    convertedFrom: "杀（普攻）", withererBerserkKill: true, noIntentCost: true };
  T("A7 凋零者暴走显示牌不可指定", j(h, berserk) === true);
  T("A8 虚拟杀 fromEntity 可指定",
    j(h, C.fromEntity("杀（普攻）", { generatedBySkill: "测试" })) === false);
  T("A9 useVirtualKill 只置 virtual 的产物可指定",
    j(h, { name: "咬杀", type: "slash", suit: "♠", virtual: true }) === false);
  T("A10 技能生成牌（generatedBySkill）可指定",
    j(h, { name: "杀（普攻）", type: "slash", suit: "♠", generatedBySkill: "红缨连鬼斩" }) === false);
  T("A11 实体群体杀不受限制", j(h, entity("机枪扫杀")) === false);
  T("A12 技能伤害载荷不受限制", j(h, { name: "潜影背刺", type: "skill" }) === false);
  T("A13 无黑色牌不隐身", j(hilde("h1", { hand: [] }), entity("杀（普攻）")) === false);
  T("A14 非希尔德不隐身",
    j(hilde("h2", { ai: "ruins_soldier" }), entity("杀（普攻）")) === false);
  T("A15 时停令隐身失效",
    !!makeCtx({ stopped: new Set(["h0"]) }).RuinsEnemySkills
      .blocksKillTarget(h, entity("杀（普攻）")) === false);
  T("A16 空牌对象不拦", j(h, null) === false && j(h, undefined) === false);
}

// ---------- B：UI 高亮与逻辑层 chooseTarget 同牌同结论 ----------
function consistency(w, opts, handCard) {
  const a = actor();
  a.hand = [handCard];
  const b = {
    allies: [a], enemies: [opts.hidden || hilde()], phase: 4, turn: 7,
    activeUid: a.uid, selectedCardIndex: 0, selectedSkillCard: null,
    pendingTargetUid: null, locked: false, animQueue: [], played: [],
    shownPlayed: [], comboPartnerUid: null,
  };
  const state = { battle: b, view: "battle", log: [] };
  w.window.state = state;
  w.BattleSystem = { active: bb => bb.allies.concat(bb.enemies).find(u => u.uid === bb.activeUid) };
  // 与 ui-battle-units.js:22-24 完全一致的计算式（非自写等价式）
  const raw = b.selectedSkillCard || a.hand[b.selectedCardIndex];
  const picked = w.WithererSkills?.displayCard?.(a, raw) || raw;
  const hidden = b.enemies[0];
  const ui = !!w.GameUIBattleTargeting.targetAllowed(hidden, b, a, picked);
  const deps = { active: w.BattleSystem.active, isKillCard: w.CardUtils.isKillCard };
  const hooks = { useCard: () => true, checkEnd: () => {} };
  const logic = !!w.BattleCombatTargeting(deps, hooks).chooseTarget(state, hidden.uid);
  return { ui, logic, state, b };
}
function testConsistency() {
  const C = makeCtx().CardUtils;
  const cases = [
    ["B1 实体手牌杀：UI 与逻辑同时拒绝", {}, C.cloneEntity("杀（普攻）", { suit: "♠" })],
    ["B2 虚拟杀：UI 与逻辑同时放行", {},
      C.fromEntity("杀（普攻）", { generatedBySkill: "测试" })],
    ["B3 饰品转换实体杀：UI 与逻辑同时拒绝", {},
      C.convertAs("魅杀", { name: "杀（普攻）", suit: "♠" },
        { _skill: true, _relicSkill: true, _entityConversion: true })],
    ["B4 鲨鱼头套咬杀：UI 与逻辑同时拒绝", { sharkHead: true },
      C.cloneEntity("杀（普攻）", { suit: "♠" })],
    ["B5 实体群体杀：UI 与逻辑同时放行", {},
      C.cloneEntity("机枪扫杀", { suit: "♠" })],
    ["B6 时停后实体杀：UI 与逻辑同时放行", { stopped: new Set(["h0"]) },
      C.cloneEntity("杀（普攻）", { suit: "♠" })],
    ["B7 无黑色牌时实体杀：UI 与逻辑同时放行",
      { hidden: hilde("h1", { hand: [] }) }, C.cloneEntity("杀（普攻）", { suit: "♠" })],
  ];
  cases.forEach(([name, opts, card]) => {
    const w = makeCtx(opts);
    const r = consistency(w, opts, card);
    T(name, r.ui === r.logic, r);
  });
  // 反向占位：确保 chooseTarget 不是恒 true / 恒 false
  const w = makeCtx();
  const yes = consistency(w, {}, C.fromEntity("杀（普攻）", { generatedBySkill: "x" }));
  const no = consistency(w, {}, C.cloneEntity("杀（普攻）", { suit: "♠" }));
  T("B8 逻辑层确实区分可指定与不可指定",
    yes.logic === true && no.logic === false, { yes: yes.logic, no: no.logic });
}

// ---------- C：入口、存档排除、装配与文案 ----------
function testStatic() {
  const targeting = read("battle-combat-targeting.js");
  const ui = read("ui-battle-targeting.js");
  const relic = read("battle-relic-turns.js");
  const chain = read("chiyo-chain-skills.js");
  const stable = read("battle-save-checkpoint-validation.js");
  const compact = read("store-compact.js");
  T("C1 chooseTarget 仍挂统一判定源", /blocksKillTarget\?\.\(target, card\)/.test(targeting));
  T("C2 UI 高亮仍挂统一判定源", /blocksKillTarget\?\.\(unitData, card\)/.test(ui));
  T("C3 妖刀村雨自动斩仍挂统一判定源", /blocksKillTarget\?\.\(enemy, slash\)/.test(relic));
  T("C4 红缨连鬼斩候选池仍挂统一判定源", /targetable\(unit, probe\)/.test(chain));
  T("C5 选目标状态被稳定存档点排除",
    /"pendingTargetUid"/.test(stable) && /"selectedCardIndex"/.test(stable));
  T("C6 选目标状态被主存档压缩排除",
    /"pendingTargetUid"/.test(compact) && /"selectedCardIndex"/.test(compact));
  // 所有「打出已选牌」的调用方，都不许自行把 pendingTargetUid 写成敌方 uid 绕过
  // chooseTarget（写自己 / 清空 / 比较表达式均不算）。= 后的负向先行断言排除 ===。
  const all = fs.readdirSync(ROOT).filter(f => f.endsWith(".js"))
    .map(f => ({ f, s: read(f) }));
  const playCallers = all.filter(x =>
    /playSelectedCard\(|playActiveCard\(/.test(x.s)
    && !["battle-combat-targeting.js", "battle-effects.js", "battle.js"].includes(x.f));
  const bypass = playCallers.filter(x => [...x.s.matchAll(
    /pendingTargetUid\s*=(?!=)\s*([^;\n]+)/g)]
    .some(m => !/^(null|undefined|actor|b\?\.selected|state\.battle\?\.pendingTargetUid)/.test(m[1].trim())));
  T("C7 无「绕过 chooseTarget 直接写敌方目标」的旁路", bypass.length === 0,
    bypass.map(x => x.f));
  const bundle = JSON.parse(fs.readFileSync(path.join(__dirname, "publish-bundles.json"), "utf8"));
  const flat = JSON.stringify(bundle);
  T("C8 判定源与时停模块都在 bundle 清单内",
    /ruins-elite-skills\.js/.test(flat) && /mieryula/i.test(flat));
  const recent = patched("update-notice-recent.js");
  const data = fs.readdirSync(ROOT).filter(f => f.startsWith("data-") && f.endsWith(".js"))
    .map(f => patched(f)).join("\n");
  T("C9 今日公告写明新口径",
    /实体单体【杀】牌的目标；虚拟【杀】不受此限/.test(recent));
  T("C10 技能描述写明新口径",
    /暗幕隐身/.test(data) && /不会成为实体单体【杀】牌的目标/.test(data));
  T("C11 近期公告无旧口径残留（历史归档除外）",
    !/不会成为单体【杀】牌的目标/.test(recent));
}

testShapes();
testConsistency();
testStatic();
console.log(`\nRESULT ${pass}/${pass + reds.length} RED=${reds.length} REVERT=${REVERT || "none"}`);
if (reds.length && !REVERT) {
  reds.forEach(r => console.log("  FAILED", r));
  process.exit(1);
}
