// 外神之眼触发口径诊断：技能伤害是否误触发
const fs = require("fs");
const vm = require("vm");

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function setup() {
  global.window = global;
  window.GameData = { enemies: {}, statDefs: [] };
  window.BattleLog = { add(state, m) { (state.log ||= []).push(m); } };
  window.BattleLines = { skill(state, unit, name) { (state.lines ||= []).push(`${unit.id}:${name}`); } };
  window.BattleDamageLifecycle = {
    delayUntilHitSettled(state, fn) { fn(); return true; },
  };
  load("./src/original/game-random.js");
  ["economy-config.js", "data-cards.js", "card-utils.js", "battle-card-cleanup.js"].forEach(f =>
    load(`./src/original/${f}`));
  window.BattleSystem = {
    pushFloat() {},
    useVirtualKill(state, attacker, target, card) {
      (state.virtualKills ||= []).push({ from: attacker.id, to: target.id });
    },
  };
  load("./src/original/ruins-witherer-skills.js");
}

function makeState() {
  const witherer = {
    id: "witherer_1312", name: "1312号", ai: "ruins_witherer",
    side: "enemy", hp: 300, stats: { attack: 12 }, hand: [],
  };
  const a1 = { id: "a1", name: "罗卡尔", uid: "u1", side: "ally", hp: 200, stats: { attack: 10 }, hand: [] };
  const a2 = { id: "a2", name: "贝丝妲", uid: "u2", side: "ally", hp: 200, stats: { attack: 10 }, hand: [] };
  return { battle: { allies: [a1, a2], enemies: [witherer] }, log: [], lines: [], witherer, a1, a2 };
}

// 触发一次：actor 打 witherer
function fire(state, card) {
  const s = { ...state, log: [], lines: [], virtualKills: [] };
  s.battle = { ...state.battle };
  window.RuinsWithererSkills.afterDamage(s, state.a1, state.witherer, card, 5, {});
  return {
    triggered: (s.lines || []).some(l => l.includes("外神之眼")),
    virtualKills: s.virtualKills || [],
    log: s.log || [],
  };
}

function run() {
  setup();
  const state = makeState();

  const entitySlash = { name: "杀（普攻）", type: "slash", suit: "♠" };
  const tacticCard = { name: "火球", type: "tactic", suit: "♥" };
  const skillCard = { name: "猛龙断空斩", _skill: true, type: "slash" };
  const pureVirtual = { name: "杀（普攻）", type: "slash", virtual: true };
  const converted = {
    name: "杀（普攻）", type: "slash", virtual: true,
    _entitySourceCard: { name: "杀（普攻）", type: "slash", suit: "♠" },
  };

  const r1 = fire(state, entitySlash);
  const r2 = fire(state, tacticCard);
  const r3 = fire(state, skillCard);
  const r4 = fire(state, pureVirtual);
  const r5 = fire(state, converted);
  const r6 = fire(state, null);

  let pass = 0, fail = 0;
  const check = (cond, msg) => {
    if (cond) { pass++; console.log("  PASS " + msg); }
    else { fail++; console.log("  FAIL " + msg); }
  };

  console.log("--- 外神之眼触发口径 ---");
  console.log("  实体杀触发=" + r1.triggered + " 虚拟杀数=" + r1.virtualKills.length);
  console.log("  战术牌触发=" + r2.triggered);
  console.log("  技能卡触发=" + r3.triggered + "  ← 期望 false");
  console.log("  纯虚拟杀触发=" + r4.triggered + "  ← 期望 false");
  console.log("  转换杀触发=" + r5.triggered + "  ← 期望 true");
  console.log("  无卡触发=" + r6.triggered);

  check(r1.triggered, "实体杀应触发外神之眼");
  check(r2.triggered, "实体战术牌应触发外神之眼");
  check(!r3.triggered, "技能卡伤害不应触发外神之眼");
  check(!r4.triggered, "纯虚拟杀不应触发外神之眼（防自激循环）");
  check(r5.triggered, "转换杀（源自实体手牌）应触发外神之眼");
  check(!r6.triggered, "无卡（直接伤害）不应触发外神之眼");

  console.log(`结论 ${pass}/${pass + fail}`);
  if (fail > 0) process.exitCode = 1;
}

run();
