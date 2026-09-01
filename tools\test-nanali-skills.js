const fs = require("fs");
const vm = require("vm");

global.window = global;

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

window.BattleLines = {
  skill(state, unit, name) {
    state.lines.push(`${unit.ref}:${name}`);
  },
};
window.BattleLog = {
  add(state, message) {
    state.log.push(message);
  },
};
window.BattleCards = {
  afterHandLost() {},
  syncStatusCards(unit) {
    unit.statusSynced = (unit.statusSynced || 0) + 1;
  },
};

load("./src/original/economy-config.js");
load("./src/original/data-cards.js");
load("./src/original/card-utils.js");
load("./src/original/battle-draw-feedback.js");
load("./src/original/elrana-healing-skills.js");
load("./src/original/ace-skills.js");
load("./src/original/nanali-skills.js");
load("./src/original/ace-nanali-skills.js");
load("./src/original/elrana-ace-nanali-skills.js");
load("./src/original/nanali-sealed.js");

function card(name, type) {
  return { name, type };
}

const nanali = {
  uid: "a1",
  side: "ally",
  ref: "nanali",
  name: "娜娜莉",
  hp: 20,
  stats: { attack: 3, magic: 3 },
  hand: [card("谋略", "tactic"), card("杀（普攻）", "slash")],
};
const lokar = { uid: "a2", side: "ally", ref: "lokar", name: "罗卡尔", hp: 20, stats: {}, hand: [] };
const enemyA = {
  uid: "e1",
  side: "enemy",
  ref: "enemy_a",
  name: "敌人A",
  hp: 30,
  stats: {},
  block: 0,
  hand: [card("调度", "tactic"), card("闪", "response")],
};
const enemyB = {
  uid: "e2",
  side: "enemy",
  ref: "enemy_b",
  name: "敌人B",
  hp: 30,
  stats: {},
  block: 0,
  hand: [card("杀（普攻）", "slash")],
};
const state = {
  lines: [],
  log: [],
  battle: { allies: [nanali, lokar], enemies: [enemyA, enemyB], animQueue: [] },
};
const damages = [];
let drawCount = 0;

window.ElranaAceNanaliSkills.afterDamage(
  state,
  enemyA,
  lokar,
  card("杀（普攻）", "slash"),
  3,
  {
    draw(unit, count) {
      if (unit.ref === "nanali") drawCount += count;
    },
    damage(_, target, amount, source, actor, revengeCard) {
      damages.push({ target: target.uid, amount, source, actor: actor.ref, card: revengeCard });
    },
  },
);

assert(state.lines.includes("nanali:罗卡尔受伤复仇"), "Nanali revenge line should trigger");
assert(state.lines.filter(line => line === "nanali:魔刀阿波罗").length === 2, "Revenge slashes should trigger Apollo on each enemy");
assert(state.lines.filter(line => line === "nanali:虚弱斩杀").length === 2, "Apollo should enable weak-execution damage on emptied enemies");
assert(enemyA.hand.length === 0 && enemyA.nanaliSealed?.length === 2, "Enemy A hand should be sealed by Apollo");
assert(enemyB.hand.length === 0 && enemyB.nanaliSealed?.length === 1, "Enemy B hand should be sealed by Apollo");
const sealEvents = state.battle.animQueue.filter(event => event.type === "sealCards");
assert(sealEvents.length === 2 && sealEvents.reduce((sum, event) => sum + event.count, 0) === 3, "Apollo must animate every sealed hand card");
assert(sealEvents[0].visualHandBefore === 2 && sealEvents[0].visualHandCount === 0, "Apollo must snapshot Enemy A's visible hand before and after sealing");
assert(sealEvents[1].visualHandBefore === 1 && sealEvents[1].visualHandCount === 0, "Apollo must snapshot Enemy B's visible hand before and after sealing");
assert(drawCount === 1, "Sealing one tactic should draw one card for Nanali");
assert(damages.length === 2, "Revenge should damage both enemies when Lokar is hit");
assert(damages.every(item => item.amount === 6), "Weak execution should double Nanali revenge slash damage");
assert(damages.every(item => item.card?.nanaliRevenge), "Revenge damage should use Nanali revenge slash cards");
const lastHandKill = card("杀（普攻）", "slash");
const lastCardNanali = { ...nanali, uid: "a3", hand: [] };
const lastCardTarget = { ...enemyA, uid: "e3", hand: [card("调度", "tactic")], nanaliSealed: [] };
ElranaAceNanaliSkills.beforeKillTargeted(state, lastCardNanali, lastCardTarget, lastHandKill, { draw() {} });
assert(lastCardTarget.hand.length === 0 && lastCardTarget.nanaliSealed.length === 1, "Apollo must count the kill card that just left Nanali's hand");
const convertedCost = card("转换费用", "tactic");
const convertedKill = { ...card("杀（普攻）", "slash"), _skipHandMove: true, convertedFrom: convertedCost.name, _entitySourceCard: convertedCost };
const convertedNanali = { ...nanali, uid: "a7", hand: [] };
const convertedTarget = { ...enemyA, uid: "e8", hand: [card("转换扣置牌", "tactic")], nanaliSealed: [] };
ElranaAceNanaliSkills.beforeKillTargeted(state, convertedNanali, convertedTarget, convertedKill, { draw() {} });
ElranaAceNanaliSkills.beforeKillTargeted(state, convertedNanali, convertedTarget, convertedKill, { draw() {} });
assert(convertedTarget.hand.length === 0 && convertedTarget.nanaliSealed.length === 1, "Converted Slash must count its consumed source card and seal only once per target");
const virtualKill = { ...card("杀（普攻）", "slash"), virtual: true };
const virtualTarget = { ...enemyA, uid: "e9", hand: [card("虚拟扣置牌", "response")], nanaliSealed: [] };
ElranaAceNanaliSkills.beforeKillTargeted(state, nanali, virtualTarget, virtualKill, { draw() {} });
assert(virtualTarget.hand.length === 0 && virtualTarget.nanaliSealed.length === 1, "Virtual single Slash must trigger Apollo");
ElranaAceNanaliSkills.endTurn(state, lokar, {});
const returnEvents = state.battle.animQueue.filter(event => event.type === "gainCards" && event.fromZone === "public");
assert(returnEvents.length === 2 && enemyA.hand.length === 2 && enemyB.hand.length === 1, "Sealed cards must animate back from the public zone");
assert(enemyA.statusSynced === 1 && enemyB.statusSynced === 1, "Returning Apollo cards must refresh status-card markers");

const sweepTarget = { ...enemyA, uid: "e4", hand: [card("闪", "response")], nanaliSealed: [] };
ElranaAceNanaliSkills.beforeKillTargeted(state, nanali, sweepTarget, { name: "机枪扫杀", type: "slash", sweep: true }, { draw() {} });
assert(sweepTarget.hand.length === 1 && !sweepTarget.nanaliSealed.length, "Apollo must not trigger for group slashes");
assert(ElranaAceNanaliSkills.modifySlashDamage(state, nanali, sweepTarget, 4, { name: "机枪扫杀", type: "slash", sweep: true }) === 4, "Weak execution must not affect group slashes");
assert(ElranaAceNanaliSkills.modifySlashDamage(state, nanali, { ...sweepTarget, hand: [] }, 4, card("杀（普攻）", "slash")) === 8, "Weak execution must double a single slash against an empty hand");

const ally = { uid: "a4", side: "ally", ref: "ally", name: "队友", hp: 12, hand: [] };
const source = { uid: "e5", side: "enemy", ref: "source", name: "伤害来源", hp: 12, hand: [] };
const soloState = { lines: [], log: [], battle: { allies: [nanali, ally], enemies: [source], animQueue: [] } };
const soloHits = [];
nanali.hp = 20;
ElranaAceNanaliSkills.afterDamage(soloState, source, ally, card("杀（普攻）", "slash"), 2, {
  draw() {},
  damage(_, target, amount, sourceName, actor) {
    soloHits.push({ target: target.uid, amount, sourceName, actor: actor.ref });
  },
});
assert(soloHits.length === 1 && soloHits[0].target === source.uid, "A normal ally taking damage must trigger one revenge slash against the source");
ElranaAceNanaliSkills.afterDamage(soloState, source, ally, card("杀（普攻）", "slash"), 0, { draw() {}, damage() { soloHits.push("invalid"); } });
ElranaAceNanaliSkills.afterDamage(soloState, source, ally, { ...card("杀（普攻）", "slash"), nanaliRevenge: true }, 2, { draw() {}, damage() { soloHits.push("invalid"); } });
assert(soloHits.length === 1, "Zero damage and Nanali revenge damage must not recursively trigger revenge");

const chainNanali = { ...nanali, uid: "a5", hp: 20, hand: [] };
const chainLokar = { ...lokar, uid: "a6" };
const chainEnemies = [
  { ...source, uid: "e6", hand: [] },
  { ...source, uid: "e7", hand: [] },
];
const chainState = { lines: [], log: [], battle: { allies: [chainNanali, chainLokar], enemies: chainEnemies, animQueue: [] } };
let chainHits = 0;
ElranaAceNanaliSkills.afterDamage(chainState, chainEnemies[0], chainLokar, card("杀（普攻）", "slash"), 2, {
  draw() {},
  damage() {
    chainHits += 1;
    chainNanali.hp = 0;
  },
});
assert(chainHits === 1, "Nanali must stop a group revenge chain if she is defeated during it");

const repeatedTarget = { ...source, uid: "e10", hand: [card("牌1", "tactic"), card("牌2", "tactic"), card("牌3", "tactic")], nanaliSealed: [] };
const repeatedState = { lines: [], log: [], battle: { allies: [chainNanali], enemies: [repeatedTarget], animQueue: [] } };
for (let i = 0; i < 3; i++) {
  ElranaAceNanaliSkills.beforeKillTargeted(repeatedState, chainNanali, repeatedTarget, card("杀（普攻）", "slash"), { draw() {} });
}
const repeatedSnapshots = repeatedState.battle.animQueue.map(event => [event.visualHandBefore, event.visualHandCount]);
assert(JSON.stringify(repeatedSnapshots) === JSON.stringify([[3, 2], [2, 1], [1, 0]]), "Repeated Apollo seals must retain each visible hand-count decrement");
assert(repeatedTarget.visualHandCount === 3, "Repeated Apollo seals must hold the pre-animation hand count until the first seal event renders");

console.log("Nanali skill contract tests passed");
