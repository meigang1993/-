global.window = global;
require("../src/original/game-random.js");

const logs = [];
const damageCalls = [];
const floatCalls = [];

global.CardUtils = {
  fromEntity: (name, extra) => ({ name, virtual: true, ...extra }),
  isSingleKill: card => card?.type === "slash"
    && !card.targetless && !card.sweep && !card.allTargets && !card.aoeLineShown,
};
window.BattleLog = { add: (_state, message) => logs.push(message) };
window.BattleLines = { skill() {} };
window.BattleSystem = { pushFloat: (...args) => floatCalls.push(args) };
window.BattleCards = {
  put: (_battle, unit, card, pile) => { (unit[pile] ||= []).push(card); },
  putMany: (_battle, unit, cards, pile) => { (unit[pile] ||= []).push(...cards); },
};

require("../src/original/battle-pile-stats.js");
require("../src/original/battle-draw-feedback.js");
require("../src/original/machine-factory-skills.js");
require("../src/original/enemy-status-effects.js");
require("../src/original/enemy-kill-hooks.js");
require("../src/original/enemy-damage-hooks.js");
require("../src/original/enemy-combat-hooks.js");
require("../src/original/enemy-tactical-skills.js");
require("../src/original/enemy-skills.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const oldRandom = Math.random;
const recycledPile = {
  deck: [],
  discard: [{ suit: "♥", name: "first" }, { suit: "♠", name: "last" }],
};
Math.random = () => 0;
const recycledTop = window.BattlePileStats.revealTop(recycledPile);
Math.random = oldRandom;
assert(recycledTop.name === "first" && recycledPile.deck[0].name === "last",
  "clash reveal must shuffle a recycled discard pile before taking its top card");
assert(recycledPile.shuffleCount === 1, "clash reveal must count the discard recycle shuffle");

const skills = window.MachineFactorySkills({
  alive: units => units.filter(unit => unit.hp > 0),
  stat: (unit, key) => unit.stats?.[key] || 0,
  black: card => card.suit === "♠" || card.suit === "♣",
  hpPct: unit => unit.hp / unit.maxHp,
  markStatus: (unit, status) => {
    unit.statuses ||= [];
    if (!unit.statuses.includes(status)) unit.statuses.push(status);
  },
  drawJudge: () => ({ card: { suit: "♠", name: "判定" }, success: true }),
});

const bull = {
  uid: "bull",
  name: "机械牛头王",
  ai: "mechanical_bull_king",
  hp: 50,
  maxHp: 100,
  defenseSystem: 2,
  annihilationMode: false,
  annihilationBgm: "annihilation.mp3",
  statuses: [],
  stats: { attack: 5 },
  hand: [{ suit: "♠", name: "牛王牌" }],
  deck: [{ suit: "♠", name: "牛王拼花牌" }],
  discard: [],
};
const ally = {
  uid: "ally",
  name: "测试角色",
  hp: 20,
  hand: [{ suit: "♥", name: "测试牌" }],
  deck: [{ suit: "♥", name: "角色拼花牌" }],
  discard: [],
};
const state = { battle: { allies: [ally], animQueue: [] } };
const damage = (...args) => {
  damageCalls.push(args);
  return { hpLoss: args[2] };
};

const defenseMeta = { damageTypes: ["thunder"], effectCritical: true };
const defense = skills.absorbDefense(state, bull, 5, defenseMeta);
assert(defense.absorbed === 2 && defense.rest === 3, "defense system should absorb its remaining value");
assert(!floatCalls[0][8]?.damageTypes, "partially absorbed defense should leave damage effect metadata for the HP damage float");
assert(bull.annihilationMode, "defense break should activate annihilation mode");
assert(!bull.statuses.includes("歼灭"), "annihilation presentation must wait for the defense-break float");
assert(!state.battle.bgmOverride, "annihilation BGM must not switch before the defense-break float");
assert(typeof floatCalls[0][8]?.commit === "function", "defense break must carry a presentation commit");
floatCalls[0][8].commit();
assert(bull.statuses.includes("歼灭"), "annihilation status should be marked");
assert(state.battle.bgmOverride === bull.annihilationBgm, "annihilation BGM should replace battle BGM");

const fullAbsorbBull = { ...bull, defenseSystem: 5, annihilationMode: false, statuses: [] };
delete fullAbsorbBull._annihilationPresented;
const fullDefense = skills.absorbDefense(state, fullAbsorbBull, 3, defenseMeta);
assert(fullDefense.rest === 0
  && JSON.stringify(floatCalls.at(-1)[8].damageTypes) === JSON.stringify(defenseMeta.damageTypes),
"fully absorbed defense should retain the incoming damage effect metadata");

skills.prepare(state, bull, damage, () => 7);
assert(damageCalls.at(-1)[2] === 5, "gatling damage should equal attack with no base damage");
assert(state.battle.animQueue[0].id === "frenzy7", "gatling should enqueue its virtual play animation");
assert(state.battle.animQueue[0].show === true,
  "annihilation Gatling must reveal its virtual sweep in the public play area");
assert(state.battle.animQueue[0].card.virtual === true,
  "annihilation Gatling must remain classified as a virtual card");
assert(state.battle.animQueue[0].card.aoeLineShown === true
  && state.battle.animQueue[0].targetUids[0] === ally.uid,
"annihilation Gatling must draw a target line to every living opposing unit");

assert(skills.hammerMove(bull)?.card.bullHammer, "hammer move should unlock below 80% HP");
skills.useHammer(state, bull, damage);
assert(bull.hammerUsed, "hammer should be limited after use");
assert(damageCalls.at(-1)[2] === 5, "different top-deck suits should deal attack damage");
assert(damageCalls.at(-1)[5].ignoreResponse, "hammer damage should ignore responses");
assert(bull.hand.length === 1 && ally.hand.length === 1, "hammer clash must not consume hand cards");
assert(bull.discard.at(-1)?.name === "牛王拼花牌", "hammer should discard the bull top-deck clash card");
assert(ally.discard.at(-1)?.name === "角色拼花牌", "hammer should discard the target top-deck clash card");
const hammerClash = state.battle.animQueue.find(event => event.type === "clash");
assert(hammerClash.actorCard?.name === "牛王拼花牌"
  && hammerClash.targetCard?.name === "角色拼花牌",
"hammer clash must retain both revealed card snapshots for presentation");
skills.endTurn(bull);
assert(!bull.hammerUsed, "hammer limit should reset at turn end");

bull.hp = 59;
skills.afterDamage(state, ally, bull, 1, damage);
const counter = damageCalls.at(-1);
assert(counter[1] === ally && counter[2] === 8, "electromagnetic counter should hit the damage source");
assert(counter[5].shock && counter[5].skipDamageModify, "counter should apply shock without damage modifiers");

function krowWith(suits) {
  return {
    uid: "krow", name: "克罗博士", ai: "krow_doctor", hp: 60, maxHp: 60,
    hand: suits.map((suit, index) => ({ name: `手牌${index + 1}`, suit, type: "response" })),
    discard: [], statuses: [], stats: {},
  };
}

["♥", "♦", "♠", "♣"].forEach(suit => {
  const krow = krowWith([suit, suit]);
  assert(window.EnemySkills.grenadeMove({ battle: { allies: [ally] } }, krow)?.card?.poisonGrenade,
    `Krow AI must accept ${suit}+${suit}`);
});
[["♥", "♦"], ["♥", "♠"], ["♥", "♣"], ["♦", "♠"], ["♦", "♣"], ["♠", "♣"], ["虚", "虚"]].forEach(suits => {
  const krow = krowWith(suits);
  assert(window.EnemySkills.grenadeMove({ battle: { allies: [ally] } }, krow) === null,
    `Krow AI must reject ${suits.join("+")}`);
});

const grenadeTarget = { uid: "grenade-target", name: "手雷目标", hp: 20, statuses: [] };
const grenadeKrow = krowWith(["♣", "♣", "♥"]);
const grenadeState = { battle: { allies: [grenadeTarget] } };
window.EnemySkills.useGrenade(grenadeState, grenadeKrow);
assert(grenadeKrow.hand.length === 1 && grenadeKrow.discard.length === 2, "Poison Grenade must discard one exact-suit pair");
assert(grenadeKrow.discard.every(card => card.suit === "♣"), "Poison Grenade must discard cards of the identical suit");
assert(grenadeTarget.poison === 1, "Poison Grenade must add one poison stack");
assert(logs.at(-1).includes("♣手牌"), "Poison Grenade log must reveal the discarded suit and cards");

const radarTarget = { uid: "radar-target", name: "雷达目标", hp: 20 };
const handRadar = {
  uid: "hand-radar", side: "enemy", name: "骷髅巡逻机", ai: "radar",
  hand: [{ suit: "♦", name: "手牌费用" }], deck: [{ suit: "♠", name: "牌堆备用" }], discard: [],
};
window.EnemySkills.useRadar({ battle: { allies: [radarTarget] } }, handRadar, radarTarget);
assert(radarTarget.lockSuit === "♦" && handRadar.hand.length === 0 && handRadar.deck.length === 1,
  "Radar must discard a visible hand card before using the draw pile fallback");
const deckRadar = {
  uid: "deck-radar", side: "enemy", name: "骷髅巡逻机", ai: "radar",
  hand: [], deck: [{ suit: "♣", name: "牌堆费用" }], discard: [],
};
window.EnemySkills.useRadar({ battle: { allies: [radarTarget] } }, deckRadar, radarTarget);
assert(radarTarget.lockSuit === "♣" && deckRadar.deck.length === 0 && deckRadar.discard[0]?.name === "牌堆费用",
  "Radar must preserve its draw pile fallback when no hand card is available");

const chiyo = {
  uid: "chiyo", ref: "chiyo", side: "ally", name: "橘千樱", hp: 32,
  skills: [{ name: "红缨连鬼斩" }, { name: "心眼拔刀术" }],
  hand: [], deck: [{ suit: "♠", name: "黑色判定" }, ...Array.from({ length: 9 }, (_, i) => ({ suit: i % 2 ? "♦" : "♥", name: `红色判定${i + 1}` }))], discard: [],
};
const chiyoTarget = { uid: "chiyo-target", side: "enemy", name: "测试敌人", hp: 20, hand: [{ suit: "♥", name: "红桃牌" }] };
const chiyoCard = { name: "杀（普攻）", type: "slash" };
const chiyoState = { battle: { allies: [chiyo], enemies: [chiyoTarget], animQueue: [] } };
const chiyoLogStart = logs.length;
window.EnemySkills.beforeKillTargeted(chiyoState, chiyo, chiyoTarget, chiyoCard);
assert(chiyoCard.ignoreResponse, "playable Chiyo should retain Heart-sealing Slash");
assert(chiyoCard.gatlingRepeats === 10, "Red Cherry Chain Slash must continue beyond eight red judgements until black");
const chiyoLogs = logs.slice(chiyoLogStart);
assert(chiyoLogs.some(line => line.includes("本次杀额外结算9次")),
  "Red Cherry Chain Slash must describe repeated hits as extra settlements");
assert(!chiyoLogs.some(line => line.includes("虚拟攻击")),
  "Red Cherry Chain Slash must not mislabel same-card settlements as virtual attacks");
chiyo.deck = [{ suit: "♠", name: "群体黑色判定" }, { suit: "♥", name: "群体红色判定" }];
chiyo.discard = [];
const groupCard = { name: "机枪扫杀", type: "slash", sweep: true };
const groupLogStart = logs.length;
window.EnemySkills.beforeKillTargeted(chiyoState, chiyo, chiyoTarget, groupCard);
assert(groupCard.ignoreResponse, "Heart-sealing Slash should still apply to a grouped kill target");
assert(groupCard.gatlingRepeats == null, "Red Cherry Chain Slash must not repeat a grouped kill");
assert(chiyo.deck.length === 2 && chiyo.discard.length === 0,
  "Red Cherry Chain Slash must not judge for a grouped kill");
assert(!logs.slice(groupLogStart).some(line => line.includes("红缨连鬼斩判定")),
  "Grouped kills must not create Red Cherry Chain Slash judgement logs");

console.log("Machine factory skill regression tests passed");
