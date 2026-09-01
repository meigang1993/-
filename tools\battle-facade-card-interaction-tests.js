const assert = require("assert");

function unit(uid, side, hand = []) {
  return {
    uid, side, name: uid, hp: 20,
    hand, discard: [], consumed: [], statuses: [],
  };
}

function testCardInteractions() {
  global.window = global;
  require("../src/original/game-random.js");
  require("../src/original/card-utils.js");
  require("../src/original/battle-cards-system.js");
  require("../src/original/battle-status-card-registry.js");
  require("../src/original/battle-status-cards.js");
  require("../src/original/battle-pile-stats.js");
  require("../src/original/battle-card-hand-interactions.js");
  require("../src/original/battle-card-counter-interactions.js");
  require("../src/original/battle-card-interactions.js");

  const logs = [];
  const reveals = [];
  const deps = { nextAnim: () => 7 };
  const ctx = {
    putCard(_state, owner, card, pile) { owner[pile].push(card); },
    useCard() {},
    damage() {},
  };
  const interactions = window.BattleCardInteractions(deps, ctx, {
    log(_state, text) { logs.push(text); },
    reveal(_state, title, cards) { reveals.push({ title, cards }); },
    visible: owner => owner.hand.filter(card => !card._pendingDraw),
  });

  const actor = unit("actor", "ally", [{ name: "费用", suit: "♥" }]);
  const enemy = unit("enemy", "enemy", [
    window.BattleStatusCards.create("seal"),
    { name: "目标牌", suit: "♥" },
  ]);
  const state = { settings: {}, battle: { allies: [actor], enemies: [enemy], animQueue: [] } };
  assert.strictEqual(interactions.openHandReveal(state, actor, enemy, { name: "魔弹特攻" }, "magicBullet"), true);
  assert.strictEqual(state.battle.locked, true);
  assert.strictEqual(state.battle.handReveal.shownSuit, "♥");
  assert.strictEqual(state.battle.handReveal.shownCard.name, "目标牌");
  assert.deepStrictEqual(state.battle.handReveal.validIndexes, [0]);
  assert.strictEqual(reveals[0].title, "魔弹特攻");

  state.battle.locked = false;
  state.battle.handReveal = null;
  const statusOnly = unit("status-only", "enemy", [
    window.BattleStatusCards.create("stun"),
  ]);
  assert.strictEqual(interactions.openHandReveal(
    state, actor, statusOnly, { name: "魔弹特攻" }, "magicBullet"
  ), false, "Magic Bullet must reject a hand containing only status cards");

  const enemyActor = unit("enemy-actor", "enemy");
  const discardTarget = unit("discard-target", "ally", [{ name: "闪", suit: "♦" }]);
  state.battle.allies.push(discardTarget);
  assert.strictEqual(interactions.discardTarget(state, enemyActor, discardTarget, { name: "拆解" }), true);
  assert.strictEqual(discardTarget.hand.length, 0);
  assert.strictEqual(discardTarget.discard[0].name, "闪");

  const ownStatus = unit("own-status", "enemy", [
    window.BattleStatusCards.create("stun"),
    { name: "普通牌", suit: "♣" },
  ]);
  state.battle.enemies.push(ownStatus);
  assert.strictEqual(interactions.discardTarget(
    state, enemyActor, ownStatus, { name: "拆解" }
  ), true);
  assert.strictEqual(ownStatus.consumed[0].name, "眩晕");
  assert.strictEqual(ownStatus.hand[0].name, "普通牌",
    "enemy dismantle must prioritize a friendly status card");

  const stolenCard = { name: "看破", suit: "♣" };
  const stealTarget = unit("steal-target", "ally", [stolenCard]);
  state.battle.allies.push(stealTarget);
  assert.strictEqual(interactions.stealCard(state, enemyActor, stealTarget, { name: "偷取" }), true);
  assert.strictEqual(enemyActor.hand[0], stolenCard);
  assert.strictEqual(stolenCard.stolenFromUid, stealTarget.uid);
  assert.strictEqual(state.battle.animQueue.at(-1).type, "stealCard");

  const friendlyActor = unit("friendly-actor", "ally");
  const friendlyTarget = unit("friendly-target", "ally", [
    { name: "正面手牌", suit: "♦" },
  ]);
  state.battle.allies.push(friendlyActor, friendlyTarget);
  assert.strictEqual(interactions.stealCard(
    state, friendlyActor, friendlyTarget, { name: "偷窃" }
  ), true);
  assert.strictEqual(state.battle.handReveal.mode, "steal");
  assert.strictEqual(state.battle.handReveal.targetUid, friendlyTarget.uid,
    "friendly steal must open a manual face-up hand choice");
  state.battle.handReveal = null;
  state.battle.locked = false;

  const responder = unit("responder", "ally", [{ name: "看破", counterTactic: true }]);
  state.battle.allies.push(responder);
  assert.strictEqual(interactions.counterTactic(
    state, enemyActor, responder, { name: "战术牌", type: "tactic" }
  ), true);
  assert.strictEqual(responder.hand.length, 0);
  assert.strictEqual(state.battle.animQueue.at(-1).type, "response");
  assert.strictEqual(state.battle.animQueue.at(-1).visualHandBefore, 1);
  assert.strictEqual(state.battle.animQueue.at(-1).visualHandCount, 0);

  let invalidBackflips = 0;
  window.SakuraRisaSkills = {
    backflipCandidates: () => [],
    resolveBackflip() { invalidBackflips += 1; return true; },
  };
  window.GuardKellySkills = {
    canCounterTacticCard: (owner, card) => owner.uid === "kelly" && ["♠", "♣"].includes(card.suit),
    responseCard: (_owner, card, name) => ({ ...card, name, convertedFrom: card.name }),
  };
  const kelly = unit("kelly", "ally", [{ name: "后空翻", type: "response", suit: "♠", backflip: true }]);
  state.battle.allies.push(kelly);
  assert.strictEqual(interactions.counterTactic(
    state, enemyActor, responder, { name: "第二张战术牌", type: "tactic" }
  ), true);
  assert.strictEqual(kelly.hand.length, 0);
  const convertedCounter = state.battle.animQueue.at(-1);
  assert.strictEqual(convertedCounter.type, "response");
  assert.strictEqual(convertedCounter.card.name, "看破");
  assert.strictEqual(convertedCounter.card.convertedFrom, "后空翻");
  assert.deepStrictEqual(
    [
      convertedCounter.visualHandBefore,
      convertedCounter.visualHandCount,
      convertedCounter.visualHandDelta,
    ],
    [1, 0, -1],
    "a converted Insight response must animate its source hand count",
  );
  assert.strictEqual(invalidBackflips, 0, "a non-target black Backflip converted to Insight must not resolve as Backflip");

  const clashActor = unit("clash-actor", "ally", [{ name: "保留手牌A", suit: "♦" }]);
  const clashTarget = unit("clash-target", "enemy", [{ name: "保留手牌B", suit: "♣" }]);
  clashActor.deck = [{ name: "A", suit: "♥" }];
  clashTarget.deck = [{ name: "B", suit: "♠" }];
  assert.strictEqual(interactions.resolveClash(state, clashActor, clashTarget), true);
  assert.strictEqual(state.battle.lastClash.result, "成功");
  assert.strictEqual(state.battle.lastClash.actorCard.name, "A");
  assert.strictEqual(state.battle.lastClash.targetCard.name, "B");
  assert.notStrictEqual(state.battle.lastClash.actorCard, clashActor.discard[0]);
  assert.notStrictEqual(state.battle.lastClash.targetCard, clashTarget.discard[0]);
  assert.strictEqual(clashActor.hand.length, 1);
  assert.strictEqual(clashTarget.hand.length, 1);
  assert.strictEqual(clashActor.discard[0].name, "A");
  assert.strictEqual(clashTarget.discard[0].name, "B");
  assert(logs.some(text => text.includes("拼花对决")));
}

module.exports = { testCardInteractions };
