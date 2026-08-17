/* global BattleCardSpecials, BondiSkills, CardUtils, EnemySkills */

module.exports = ({ assert, card, unit }) => {
  const feintActor = unit("feint-actor", "enemy");
  const feintHolder = unit("feint-holder", "enemy", {
    hand: [card("佯攻", "response", { feint: true })],
  });
  const feintTarget = unit("feint-target", "ally", {
    hand: [card("被弃置牌", "tactic")],
  });
  const feintState = {
    battle: {
      allies: [feintTarget], enemies: [feintActor, feintHolder],
      animQueue: [],
    },
  };
  BondiSkills.beforeKillTargeted(
    feintState, feintActor, feintTarget,
    card("佯攻触发杀", "slash"));
  const feintEvent = feintState.battle.animQueue
    .find(event => event.type === "response");
  assert(feintHolder.hand.length === 0
    && feintEvent?.visualHandBefore === 1
    && feintEvent?.visualHandCount === 0,
  "Feint must animate its holder's hand count from one to zero");

  const repeatedSweepHits = [];
  const repeatedSweep = BattleCardSpecials({
    nextAnim: () => 2,
    isKillCard: item => CardUtils.isKillCard(item),
  }, {
    damage(_state, target, _amount, _source, _actor, usedCard) {
      repeatedSweepHits.push({
        targetUid: target.uid,
        extraResolution: !!usedCard._extraSlashResolution,
      });
      return { hpLoss: 0 };
    },
  });
  const sweepActor = unit("repeat-sweep-actor", "ally");
  const sweepTarget = unit("repeat-sweep-target", "enemy");
  repeatedSweep.sweepDamage({
    battle: {
      allies: [sweepActor], enemies: [sweepTarget], animQueue: [],
    },
  }, sweepActor, 3, card("Repeated Sweep", "slash", {
    sweep: true, targetless: true, gatlingRepeats: 2,
  }));
  assert(repeatedSweepHits.length === 2
    && !repeatedSweepHits[0].extraResolution
    && repeatedSweepHits[1].extraResolution,
  "a repeated group Slash must mark only the later hit as an extra settlement");

  const succubus = unit("succubus", "enemy", {
    ai: "succubus",
    stats: { attack: 3, magic: 4 },
    hand: [
      card("Whip Cost", "tactic", { suit: "♥" }),
      card("Heart Count", "tactic", { suit: "♥" }),
    ],
    deck: [card("Whip Top", "tactic", { suit: "♥" })],
  });
  const whipFirst = unit("whip-first", "ally", {
    hp: 30, hand: [card("First Suit", "tactic", { suit: "♦" })],
    deck: [card("First Top", "tactic", { suit: "♥" })],
  });
  const whipSecond = unit("whip-second", "ally", {
    hp: 5, hand: [card("Second Suit", "tactic", { suit: "♠" })],
    deck: [card("Second Top", "tactic", { suit: "♠" })],
  });
  const state = {
    battle: {
      allies: [whipFirst, whipSecond], enemies: [succubus], animQueue: [],
    },
  };
  let whipTarget = null;
  const originalRandom = Math.random;
  Math.random = () => .99;
  try {
    EnemySkills.prepare(state, succubus, (_state, target) => { whipTarget = target; });
  } finally {
    Math.random = originalRandom;
  }
  assert(whipTarget === whipSecond,
    "Love Whip must choose from living opponents by random index instead of HP priority");
  assert(succubus.hand.length === 2 && whipSecond.hand.length === 1,
    "Love Whip clash must not consume either participant's hand");
  assert(succubus.discard.at(-1).name === "Whip Top"
    && whipSecond.discard.at(-1).name === "Second Top",
  "Love Whip must discard both revealed top cards");
};
