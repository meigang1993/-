// 检查废墟沙城 5 张牌能否被【闪】响应抵消，以及【枪林弹雨】能否被【看破】失效
const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();

const extra = [
  "battle-damage-attributes.js",
  "battle-damage-utils.js",
  "battle-damage-relics.js",
  "battle-damage-lifecycle.js",
  "battle-damage-hit.js",
  "battle-damage-resolution.js",
  "battle-damage-response.js",
  "battle-damage-triggers.js",
  "battle-damage.js",
  "data-ruins-content.js",
];
extra.forEach(file => vm.runInThisContext(
  fs.readFileSync(`./src/original/${file}`, "utf8"), { filename: file }));

// 构造真实的 BattleDamage（使用真实 deps.isKillCard）
let anim = 0;
const deps = {
  isKillCard: c => window.CardUtils.isKillCard(c),
  nextAnim: () => ++anim,
  damage: () => ({ hpLoss: 0 }),
  statOf: () => 0,
  log: [],
  sound: () => {},
};
const noop = () => {};
const ctx = {
  allUnits: () => [],
  hasSkill: () => false,
  statOf: () => 0,
  holdVisual: noop,
  visualOf: () => ({}),
  pushFloat: noop,
  queueSlashText: noop,
  queueSlashPlay: noop,
  checkDefeat: noop,
  checkEnd: noop,
  clearSelection: noop,
};

const api = window.BattleDamage(deps, ctx);
const realCanDodge = api.canDodge;
console.log("BattleDamage 构造成功, canDodge 类型:", typeof realCanDodge);

const cards = window.GameDataRuinsContent.cards;
const find = name => cards.find(c => c.name === name);
// 用 CardUtils.clean 走真实字段归一化（cardFields 逻辑）
const real = name => window.CardUtils.clean(find(name));

const dodge = { name: "闪", type: "response", suit: "♥" };
const kanpo = { name: "看破", type: "response", counterTactic: true, suit: "♥" };

let pass = 0, fail = 0;
const check = (label, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${label}`); }
  else { fail++; console.log(`  ❌ ${label}`); }
};

console.log("\n===== 1. 五张牌能否被【闪】抵消 =====");
const targets = ["流星杀", "吸魔杀", "枪林弹雨", "拼杀", "魔之连杀"];
const flashResult = {};
targets.forEach(name => {
  const c = real(name);
  const ok = realCanDodge(c, dodge);
  flashResult[name] = ok;
  console.log(`  ${name.padEnd(6)} type=${c.type.padEnd(9)} sweep=${!!c.sweep} targetless=${!!c.targetless} kill=${window.CardUtils.isKillCard(c)}  → 闪可响应: ${ok}`);
});

console.log("\n===== 2. 卡面承诺 vs 实际（枪林弹雨写明「敌方可用【闪】抵消」）=====");
const qly = real("枪林弹雨");
console.log(`  卡面 text: ${find("枪林弹雨").text}`);
console.log(`  实际 canDodge(枪林弹雨, 闪) = ${realCanDodge(qly, dodge)}`);
console.log(`  实际 isKillCard(枪林弹雨)   = ${window.CardUtils.isKillCard(qly)}`);

console.log("\n===== 3. 枪林弹雨能否被【看破】失效 =====");
const counterable = window.CardUtils.isCounterableTactic(qly);
console.log(`  isCounterableTactic(枪林弹雨) = ${counterable}`);
console.log(`    ├ type === "tactic"        : ${qly.type === "tactic"}`);
console.log(`    ├ !ignoreResponse          : ${!qly.ignoreResponse}`);
console.log(`    └ (!_skill||virtual||conv) : ${!qly._skill || !!qly.virtual || !!qly.convertedFrom}`);

console.log("\n===== 4. 对照：其他牌的闪响应 =====");
[["杀", { name: "杀", type: "slash" }],
 ["魔王军入侵", { name: "魔王军入侵", type: "tactic", demonInvasion: true, targetless: true }],
 ["流星杀", real("流星杀")],
].forEach(([label, c]) => {
  console.log(`  ${label.padEnd(6)} → 闪可响应: ${realCanDodge(c, dodge)}`);
});

console.log("\n===== 5. 拼杀 clashResponse 生效时 =====");
const pin = real("拼杀");
console.log(`  常态 闪可响应: ${realCanDodge(pin, dodge)}`);
const pinNoResp = { ...pin, ignoreResponse: true };
console.log(`  ignoreResponse=true（杀牌数多于目标）闪可响应: ${realCanDodge(pinNoResp, dodge)}`);

console.log(`\n===== 汇总 ${pass}/${pass + fail} =====`);
console.log("闪响应结果:", JSON.stringify(flashResult, null, 0));
console.log("看破对枪林弹雨:", counterable);
process.exit(fail ? 1 : 0);
