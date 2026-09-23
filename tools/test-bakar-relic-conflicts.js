const {
  aiArmyOrderMove, armyOrder, assert, card, combat, lowHp, play, scenario,
} = require("./bakar-relic-conflict-helpers");

require("../src/original/bakar-relic-skills.js");
require("../src/original/bakar-core-skills.js");
require("../src/original/bakar-fire-skills.js");
require("../src/original/bakar-skills.js");
require("../src/original/bondi-skills.js");
require("../src/original/angelica-luka-skills.js");
require("../src/original/elrana-healing-skills.js");
require("../src/original/ace-skills.js");
require("../src/original/nanali-skills.js");
require("../src/original/ace-nanali-skills.js");
require("../src/original/elrana-ace-nanali-skills.js");

window.RelicSystem.hasEquipped = (_state, unit, name) => (unit?.battleRelics || []).includes(name);

["♥", "♦", "♠", "♣"].forEach(suit => {
  const move = aiArmyOrderMove([suit, suit]);
  assert.strictEqual(move?.card?.armyOrder, true, `AI must accept ${suit}+${suit} for Army Order`);
});
[["♥", "♦"], ["♥", "♠"], ["♥", "♣"], ["♦", "♠"], ["♦", "♣"], ["♠", "♣"], ["虚", "虚"]].forEach(suits => {
  assert.strictEqual(aiArmyOrderMove(suits), null, `AI must reject ${suits.join("+")} for Army Order`);
});

{
  const costs = [
    card("闪", { type: "response", suit: "♥" }),
    card("看破", { type: "response", suit: "♥" }),
  ];
  const { state, actor, target } = scenario(costs, []);
  const mimicOwner = {
    uid: "mimic-1", side: "ally", name: "诺诺卡", hp: 30, maxHp: 30,
    hand: [], deck: [], discard: [], consumed: [], skills: [],
  };
  const wolf = { name: "狼牙杀", type: "slash", lukaWolfFang: true, noIntentCost: true };
  actor.ref = "luka";
  actor.name = "卢卡";
  actor.battleRelics = ["军令状"];
  actor.discard.push(wolf);
  state.battle.allies.push(mimicOwner);
  state.battle.mimicLinks.push({ ownerUid: mimicOwner.uid, targetUid: actor.uid });

  const originalAfter = window.AngelicaLukaSkills.afterCardPlayed;
  let lukaHooks = 0;
  window.AngelicaLukaSkills.afterCardPlayed = (...args) => {
    if (args[1] === actor) lukaHooks += 1;
    return originalAfter(...args);
  };
  const order = armyOrder();
  window.state = state;
  combat.useCard(state, actor, actor, order);
  window.AngelicaLukaSkills.afterCardPlayed = originalAfter;

  assert.strictEqual(lukaHooks, 1, "Army Order must run after-card character hooks once");
  assert.strictEqual(actor.hand.includes(wolf), true, "Army Order invasion must trigger Luka's tactic recovery");
  assert.strictEqual(state.log.filter(text => text.includes("模仿的卢卡行动")).length, 1,
    "Army Order must count as one Mimic Voice card action");
  assert.strictEqual("skipAfterCardPlayed" in order, false, "Army Order runtime flags must be cleaned");
  assert.deepStrictEqual(actor.discard.map(item => item.name).sort(), ["看破", "闪"].sort());
  assert.strictEqual(target.hp, 29, "Army Order must still resolve its virtual Demon Invasion");
}

{
  const { state, actor, target } = scenario([
    card("闪", { type: "response", suit: "♦" }),
    card("看破", { type: "response", suit: "♦" }),
  ], []);
  actor.id = "demon_king_bakaar";
  actor.ref = "demon_king_bakaar";
  actor.ai = "demon_king_bakaar";
  actor.name = "魔王巴卡尔";
  actor.battleRelics = ["军令状"];
  window.state = state;
  combat.useCard(state, actor, actor, armyOrder());
  assert.strictEqual(state.log.filter(text => text.includes("天赋异能因军令状触发")).length, 0,
    "Bakaar must not draw from Talent when an active relic resolves");
  assert.strictEqual(target.hp, 29, "Bakaar's Army Order must still damage normal targets");
}

{
  const costs = Array.from({ length: 4 }, (_, index) =>
    card(index % 2 ? "看破" : "闪", { type: "response", suit: "♣" }));
  const { state, actor, target } = scenario(costs, []);
  actor.battleRelics = ["军令状"];
  window.state = state;
  combat.useCard(state, actor, actor, armyOrder());
  combat.useCard(state, actor, actor, armyOrder());
  assert.strictEqual(actor.hand.length, 0, "Army Order must remain reusable while another same-suit pair exists");
  assert.strictEqual(actor.discard.length, 4, "Repeated Army Order must pay both two-card costs");
  assert.strictEqual(target.maxHp - target.hp, 2, "Repeated Army Order must resolve both invasions");
}

{
  const slash = card("杀（普攻）", { suit: "♠" });
  const { state, actor, target } = scenario([slash], []);
  lowHp(actor, ["女勇者鲁妮的戒指", "影王斧"]);
  play(state, 0, target.uid);
  assert.strictEqual(target.maxHp - target.hp, 4, "Runi ring and Shadow Axe must stack multiplicatively");
}

{
  const slash = card("杀（普攻）", { suit: "♠" });
  const spareSlash = card("杀（普攻）", { suit: "♣" });
  const { state, actor, target } = scenario([slash, spareSlash], []);
  actor.ref = "loki";
  lowHp(actor, ["女勇者鲁妮的戒指"]);
  play(state, 0, target.uid);
  assert.strictEqual(target.maxHp - target.hp, 4, "Runi ring and Loki's damage double must both apply");
}

{
  const { state, actor, target } = scenario([card("杀（普攻）")], []);
  lowHp(actor, ["女勇者鲁妮的戒指"]);
  target.battleRelics = ["黑曜石铠甲"];
  play(state, 0, target.uid);
  assert.strictEqual(target.hp, target.maxHp, "Runi ring must not bypass Obsidian Armor slash immunity");
}

{
  const costs = [
    card("闪", { type: "response", suit: "♥" }),
    card("看破", { type: "response", suit: "♥" }),
  ];
  const { state, actor, target } = scenario(costs, []);
  lowHp(actor, ["女勇者鲁妮的戒指", "军令状"]);
  target.battleRelics = ["黑曜石铠甲"];
  window.state = state;
  combat.useCard(state, actor, actor, armyOrder());
  assert.strictEqual(target.maxHp - target.hp, 4,
    "Runi ring and Obsidian Armor tactic vulnerability must stack once each");
}

function assertResponderRingDoesNotBorrow(cardName, responseName, statName, expectedDamage) {
  const { state, actor, target } = scenario([card(cardName)], [card(responseName)]);
  target.stats[statName] = 3;
  lowHp(target, ["女勇者鲁妮的戒指"]);
  play(state, 0, target.uid);
  assert.strictEqual(actor.maxHp - actor.hp, expectedDamage,
    `A ${cardName} responder must not borrow Runi ring damage`);
  assert.strictEqual(state.log.some(text => text.includes("女勇者鲁妮的戒指触发")), false);
}

assertResponderRingDoesNotBorrow("与我一战", "杀（普攻）", "attack", 3);
assertResponderRingDoesNotBorrow("魔法对决", "魔杀", "magic", 3);

{
  const { state, actor, target } = scenario([card("与我一战")], []);
  actor.stats.attack = 3;
  lowHp(actor, ["女勇者鲁妮的戒指"]);
  play(state, 0, target.uid);
  assert.strictEqual(target.maxHp - target.hp, 6,
    "The duel initiator's Runi ring must still double damage they cause");
}

{
  const { state, actor, target } = scenario([card("杀（普攻）")], []);
  const mimicked = {
    uid: "source-1", side: "ally", name: "被模仿者", hp: 9, maxHp: 30,
    hand: [], deck: [], discard: [], consumed: [], skills: [],
    battleRelics: ["女勇者鲁妮的戒指"],
  };
  actor.mimicUid = mimicked.uid;
  state.battle.allies.push(mimicked);
  play(state, 0, target.uid);
  assert.strictEqual(target.maxHp - target.hp, 1,
    "Mimic Voice damage-source replacement must not borrow the mimicked unit's ring");
}

{
  const { state, actor, target } = scenario([card("杀（普攻）")], []);
  const mimicked = {
    uid: "source-2", side: "ally", name: "被模仿者", hp: 30, maxHp: 30,
    hand: [], deck: [], discard: [], consumed: [], skills: [],
  };
  lowHp(actor, ["女勇者鲁妮的戒指"]);
  actor.mimicUid = mimicked.uid;
  state.battle.allies.push(mimicked);
  play(state, 0, target.uid);
  assert.strictEqual(target.maxHp - target.hp, 1,
    "Mimic Voice must stop the original card user's ring after replacing the damage source");
  assert.strictEqual(state.log.some(text => text.includes("女勇者鲁妮的戒指触发")), false);
}

console.log("Bakaar relic conflict tests passed");
