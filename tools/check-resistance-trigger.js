/* 执行层：给 elite/boss 挂状态牌+2张手牌，验证【霸王色抗性】是否真正触发 */
const fs = require("fs");
const vm = require("vm");
const { installGlobals, loadRuntime } = require("./skill-coverage-fixtures");

installGlobals();
loadRuntime();

[
  "battle-status-card-registry.js",
  "battle-status-card-storage.js",
  "battle-status-card-triggers.js",
  "battle-status-cards.js",
].forEach(f => vm.runInThisContext(
  fs.readFileSync(`./src/original/${f}`, "utf8"), { filename: f },
));

window.BattleCards = window.BattleCards || {
  putMany: (b, holder, cards, pile) => {
    (cards || []).forEach(c => { holder[pile] = holder[pile] || []; holder[pile].push(c); });
  },
  put: (b, holder, c, pile) => { holder[pile] = holder[pile] || []; holder[pile].push(c); },
  visibleHandCount: u => (u.hand || []).length,
};
window.BattleLog = window.BattleLog || { add: (s, t) => (s.log = s.log || []).push(t) };
window.BattleLines = window.BattleLines || { skill: () => {} };

const card = (name, suit = "♠") => ({ name, suit, type: "slash" });

function scenario(unitName, type) {
  const piles = { deck: [], discard: [], consumed: [], shuffleCount: 0 };
  const unit = {
    uid: "e0", side: "enemy", name: unitName, type, hp: 100,
    hand: [], statuses: [], pileStats: piles,
    deck: piles.deck, discard: piles.discard, consumed: piles.consumed,
  };
  const state = { log: [], battle: { allies: [], enemies: [unit], animQueue: [], played: [] } };
  return { state, unit };
}

function run(unitName, type, dungeon) {
  const { state, unit } = scenario(unitName, type);
  const status = window.BattleStatusCards.create("stun");
  unit.hand = [card("杀（普攻）"), card("闪"), status];
  window.BattleStatusCards.sync?.(unit, state.battle);
  const before = { hand: unit.hand.length, discard: unit.discard.length, consumed: unit.consumed.length };
  const ok = window.BattleStatusCards.resolveResistance(state, unit);
  const after = { hand: unit.hand.length, discard: unit.discard.length, consumed: unit.consumed.length };
  const logged = (state.log || []).some(l => String(l).includes("霸王色抗性"));
  const statusGone = !unit.hand.some(c => window.BattleStatusCards.isStatus(c));
  return { ok, before, after, logged, statusGone, unit };
}

const cases = [
  ["机械AI龙", "boss", "ruins_sand_city"],
  ["XX型凋零者1312号", "boss", "ruins_sand_city"],
  ["内英组杀手希尔德", "elite", "ruins_sand_city"],
  ["武装直升机", "elite", "ruins_sand_city"],
  ["装甲运输车", "elite", "ruins_sand_city"],
  ["机械牛头王", "boss", "machine_factory"],
  ["狂鲨海盗团船长莫迪奥", "boss", "underwater_train"],
  ["魔王巴卡尔", "boss", "orc_dungeon"],
];

let fail = 0;
console.log("=== 【霸王色抗性】执行层触发检查（1状态牌 + 2手牌）===\n");
for (const [name, type, dung] of cases) {
  const r = run(name, type, dung);
  // 触发成功三要素：返回 true、写了霸王色抗性日志、手牌从 3 张清空（弃2 + 移除1状态牌）
  const pass = r.ok && r.logged && r.after.hand === 0 && r.statusGone;
  if (!pass) fail += 1;
  console.log(`${pass ? "✅" : "❌"} [${dung}] ${name}(${type}) ok=${r.ok} 日志=${r.logged} 手牌${r.before.hand}→${r.after.hand} 状态牌已移除=${r.statusGone}`);
}

console.log("\n=== 对照：手牌不足2张时不得移除状态牌 ===");
{
  const { state, unit } = scenario("对照单位", "boss");
  const status = window.BattleStatusCards.create("stun");
  unit.hand = [card("杀（普攻）"), status]; // 只有1张其他牌
  window.BattleStatusCards.sync?.(unit, state.battle);
  const ok = window.BattleStatusCards.resolveResistance(state, unit);
  const stillHas = unit.hand.some(c => window.BattleStatusCards.isStatus(c));
  const pass = ok === false && stillHas;
  if (!pass) fail += 1;
  console.log(`${pass ? "✅" : "❌"} 手牌不足时不移除状态牌 ok=${ok} 状态牌仍在=${stillHas}`);
}

console.log("\n=== 对照：普通怪不得触发 ===");
{
  const { state, unit } = scenario("贵族军士兵", "normal");
  const status = window.BattleStatusCards.create("stun");
  unit.hand = [card("杀（普攻）"), card("闪"), status];
  window.BattleStatusCards.sync?.(unit, state.battle);
  const ok = window.BattleStatusCards.resolveResistance(state, unit);
  const pass = ok === false && unit.hand.length === 3;
  if (!pass) fail += 1;
  console.log(`${pass ? "✅" : "❌"} 普通怪不触发 ok=${ok} 手牌保持=${unit.hand.length}`);
}

console.log(`\n失败 ${fail} 个`);
process.exit(fail ? 1 : 0);
