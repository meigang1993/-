const assert = require("assert");

global.window = global;
require("../src/original/game-random.js");
window.BattleLog = { add(state, text) { (state.log ||= []).push(text); } };
window.CardUtils = {
  convertAs(name, card, extra = {}) { return { ...card, name, ...extra }; },
  copyPlayable(card, extra = {}) { return { ...card, ...extra }; },
};
window.GameData = {
  eliteCards: [
    { name: "魔法对决", type: "tactic" },
    { name: "魔弹特攻", type: "tactic" },
  ],
};
window.RelicSystem = {
  hasEquipped: (_state, unit, name) => (unit?.battleRelics || []).includes(name),
};

require("../src/original/battle-draw-feedback.js");
require("../src/original/battle-card-active-relics-core.js");
require("../src/original/battle-card-active-relics-demon.js");
require("../src/original/battle-card-active-relics-assassin.js");
require("../src/original/battle-card-active-relics-arsenal.js");
require("../src/original/battle-card-active-relics.js");

function actor(hand = [], deck = []) {
  return {
    uid: "actor", side: "ally", name: "测试角色",
    hp: 20, hand, deck, discard: [], consumed: [], battleRelics: [],
  };
}

function harness(owner, selectedIndex = 0) {
  const state = {
    battle: { allies: [owner], enemies: [], animQueue: [], selectedBagIndexes: [] },
    log: [],
  };
  const used = [];
  const deps = {
    draw(unit, count) {
      const cards = Array.from({ length: count }, (_, index) => ({
        name: `摸牌${index + 1}`, type: "tactic",
      }));
      unit.hand.push(...cards);
      return cards;
    },
  };
  const ctx = {
    selectedHand() {
      const card = owner.hand[selectedIndex];
      return { i: selectedIndex, card, ok: !!card && !card._pendingDraw };
    },
    moveHand(_state, unit, index, pile) {
      const [card] = unit.hand.splice(index, 1);
      unit[pile].push(card);
      return card;
    },
    putMany(_state, unit, cards, pile) { unit[pile].push(...cards); },
    useCard(_state, unit, target, card) { used.push({ unit, target, card }); },
  };
  return { state, used, specials: window.BattleCardActiveRelics(deps, ctx) };
}

function testActiveRelicMethods() {
  const target = { uid: "target", side: "enemy", name: "目标", hp: 20 };
  const oldRandom = Math.random;
  const pokerOwner = actor([{ name: "闪", type: "response", suit: "♦" }]);
  pokerOwner.battleRelics = ["鬼王扑克"];
  const poker = harness(pokerOwner);
  poker.state.battle.enemies.push(target);
  Math.random = () => 0;
  try {
    assert.strictEqual(poker.specials.demonPoker(poker.state, pokerOwner, target, {}), true);
  } finally {
    Math.random = oldRandom;
  }
  assert.strictEqual(pokerOwner.usedDemonPoker, true);
  assert.strictEqual(pokerOwner.discard[0].name, "闪");
  assert.strictEqual(poker.used[0].card.name, "魔法对决");
  assert.strictEqual(poker.used[0].card.originalType, "response");
  assert.strictEqual(poker.used[0].card.suit, "♦");
  assert.strictEqual(poker.used[0].card._skill, true);
  assert.strictEqual(poker.used[0].card._relicSkill, true);
  assert.strictEqual(poker.used[0].card._entitySourceCard, pokerOwner.discard[0]);
  assert.strictEqual(poker.used[0].target, target);

  const bagOwner = actor([
    { name: "闪", type: "response" },
    { name: "杀（普攻）", type: "slash" },
    { name: "待摸牌", type: "tactic", _pendingDraw: true },
  ]);
  const bag = harness(bagOwner);
  bag.state.battle.selectedBagIndexes = [0, 1, 2];
  assert.strictEqual(bag.specials.exchangeSelectedCards(bag.state, bagOwner, {}), true);
  assert.strictEqual(bagOwner.usedAilengBet, true);
  assert.deepStrictEqual(bagOwner.discard.map(card => card.name), ["杀（普攻）", "闪"]);
  assert.strictEqual(bagOwner.hand.filter(card => card.name.startsWith("摸牌")).length, 2);
}

module.exports = { testActiveRelicMethods };
