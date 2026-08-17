const {
  assert,
  BattleCardSpecials,
  BattleCombatResolver,
  CardUtils,
  RelicSystem,
  unit,
  WithererRelicSkills,
} = require("./relic-effects-test-harness");

function testScytheTurns() {
  const actor = unit("镰刀持有者");
  const first = unit("击杀目标甲", "enemy");
  const second = unit("击杀目标乙", "enemy");
  const friendly = unit("友方误伤目标");
  first.hp = 0;
  second.hp = 0;
  friendly.hp = 0;
  const state = { battle: { allies: [actor, friendly], enemies: [first, second], roundOrder: ["x"], roundIndex: 1 }, log: [] };
  RelicSystem.hasEquipped = (_state, holder, name) => holder === actor && name === "1124号镰刀";
  WithererRelicSkills.afterDamage(state, actor, first, { name: "杀（普攻）", type: "slash" }, 1);
  WithererRelicSkills.afterDamage(state, actor, second, { name: "杀（普攻）", type: "slash" }, 1);
  WithererRelicSkills.afterDamage(state, actor, friendly, { name: "杀（普攻）", type: "slash" }, 1);
  WithererRelicSkills.endTurn(state, actor);
  assert.deepStrictEqual(state.battle.roundOrder, ["x", actor.uid, actor.uid],
    "Scythe must grant one extra turn for each distinct defeated enemy, excluding friendly fire");
}

function testGreenGatlingQueue() {
  const actor = unit("机枪持有者");
  const target = unit("目标", "enemy");
  const state = { battle: { allies: [actor], enemies: [target], animQueue: [] }, log: [] };
  RelicSystem.hasEquipped = (_state, holder, name) => holder === actor && name === "格林机枪";
  const specials = BattleCardSpecials(
    { isKillCard: CardUtils.isKillCard, draw() {}, nextAnim: () => 1 },
    { useCard() {}, sameSideUnits: () => [actor] },
  );
  specials.prepareGreenGatling(state, actor, target, { name: "杀（普攻）", type: "slash" });
  assert(!actor.usedGreenGatling, "Green Gatling must not consume its limit without follow-up slashes");
  actor.hand.push({ name: "杀（普攻）", type: "slash" });
  specials.prepareGreenGatling(state, actor, target, {
    name: "技能杀", type: "slash", _skill: true,
  });
  assert(!actor.usedGreenGatling, "Green Gatling must ignore non-hand skill slashes");
  const root = { name: "杀（普攻）", type: "slash", _playedFromHand: true };
  specials.prepareGreenGatling(state, actor, target, root);
  assert(actor.usedGreenGatling && root.greenGatlingQueue.length === 1, "Green Gatling must queue visible slashes");
}

function testKrowRecordGuards() {
  const actor = unit("克罗记录持有者");
  const target = unit("空手目标", "enemy");
  const state = { battle: { allies: [actor], enemies: [target], animQueue: [], locked: false }, log: [] };
  let repeats = 0;
  const resolver = BattleCombatResolver({
    deps: { isKillCard: CardUtils.isKillCard, draw() {} },
    specials: {
      discardTarget: () => false, stealCard: () => false,
      repeatTactic: () => { repeats += 1; },
    },
  });
  resolver.continueAfterCounter(state, actor, target, { name: "拆解", type: "tactic", discardTarget: true });
  resolver.continueAfterCounter(state, actor, target, { name: "偷窃", type: "tactic", stealCard: true });
  assert.strictEqual(repeats, 0, "failed discard and steal tactics must not trigger Krow Record");
  RelicSystem.hasEquipped = (_state, holder, name) => holder === actor && name === "克罗研究记录";
  const specials = BattleCardSpecials({ draw() {} }, { useCard() { repeats += 1; } });
  const repeated = specials.repeatTactic(state, actor, target, {
    name: "鬼王扑克转化牌", type: "tactic", drawCards: 1,
    convertedFrom: "闪", _skill: true, _relicSkill: true,
  });
  assert.strictEqual(repeated, false);
  assert.strictEqual(repeats, 0, "Demon Poker relic tactics must not trigger Krow Record");
}

module.exports = {
  testGreenGatlingQueue, testKrowRecordGuards, testScytheTurns,
};
