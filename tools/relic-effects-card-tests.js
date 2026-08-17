const {
  assert,
  BattleCardActiveRelics,
  BattleCardSpecials,
  BattleCombatResolver,
  CardUtils,
  unit,
} = require("./relic-effects-test-harness");

function testActiveRelicConversions() {
  const target = unit("转化目标", "enemy");
  const makeContext = (actor, used) => ({
    selectedHand: () => ({ i: 0, card: actor.hand[0], ok: !!actor.hand[0] }),
    moveHand(_state, holder, index, pile) {
      const [card] = holder.hand.splice(index, 1);
      holder[pile].push(card);
      return card;
    },
    useCard(_state, holder, pickedTarget, card) { used.push({ holder, target: pickedTarget, card }); },
  });
  const state = { battle: { allies: [], enemies: [target], animQueue: [] }, log: [] };
  const pokerActor = unit("扑克持有者");
  pokerActor.battleRelics = ["鬼王扑克"];
  state.battle.allies.push(pokerActor);
  const pokerCost = { name: "杀（普攻）", type: "slash", suit: "♦" };
  const pokerUses = [];
  pokerActor.hand.push(pokerCost);
  BattleCardActiveRelics({ draw() {} }, makeContext(pokerActor, pokerUses))
    .demonPoker(state, pokerActor, target, { demonPoker: true });
  assert.strictEqual(pokerActor.discard[0], pokerCost, "Demon Poker must discard the unchanged original card");
  assert(pokerUses[0]?.card.type === "tactic" && pokerUses[0]?.target === target,
    "Demon Poker must immediately use the converted tactic against the selected enemy");
}

function testTeamHealingTriggers() {
  const actor = unit("群疗使用者");
  const ally = unit("群疗目标");
  actor.hp = 10;
  ally.hp = 12;
  const state = { battle: { allies: [actor, ally], enemies: [], animQueue: [] }, log: [] };
  let healTriggers = 0;
  window.EnemySkills = { beforeHeal: () => null, onHeal() { healTriggers += 1; } };
  window.ElranaAceNanaliSkills = { afterHeal() {} };
  window.BertisGerlotSkills = { refreshArrogance() {} };
  const specials = BattleCardSpecials(
    { isKillCard: CardUtils.isKillCard, draw() {}, nextAnim: () => 1 },
    { sameSideUnits: () => [actor, ally], statOf: () => 0, pushFloat() {} },
  );
  specials.healTeam(state, actor, { name: "生命之泉", type: "consume", teamHealPct: .2 });
  assert.strictEqual(healTriggers, 2, "Mother Photo must trigger once for each character actually healed");
}

function testInvalidatedSlashTracking() {
  const actor = unit("黑甲攻击者");
  const target = unit("黑甲目标", "enemy");
  actor.intent = 1;
  const state = { battle: { allies: [actor], enemies: [target], combo: 0, locked: false }, log: [] };
  let whiteTriggers = 0, preKillTriggers = 0, gatlingTriggers = 0;
  const originalUnderwater = window.UnderwaterTrainSkills;
  const originalBondi = window.BondiSkills;
  const originalOrc = window.OrcDungeonSkills;
  window.OrcDungeonSkills = { beforeIntentCost() {} };
  window.BondiSkills = { cancelKillCard: () => true };
  window.UnderwaterTrainSkills = { prepareKill() { preKillTriggers += 1; } };
  const resolver = BattleCombatResolver({
    deps: { isKillCard: CardUtils.isKillCard },
    specials: { prepareGreenGatling() { gatlingTriggers += 1; }, queueBattleCourage() {} },
    hasNoIntentCost: () => false,
    triggerWhiteLolita() { whiteTriggers += 1; },
  });
  resolver.continueAfterCounter(state, actor, target, { name: "杀（普攻）", type: "slash", power: 1 });
  assert(actor.playedSlashThisTurn && actor.intent === 0 && whiteTriggers === 1,
    "An invalidated Obsidian Armor slash must still count as used and target White Lolita");
  assert(preKillTriggers === 0 && gatlingTriggers === 0,
    "Obsidian Armor must stop kill pre-damage relic and skill effects");
  actor.playedSlashThisTurn = false;
  resolver.continueAfterCounter(state, actor, target, { name: "虚拟杀", type: "slash", virtual: true, power: 1 });
  assert(actor.playedSlashThisTurn, "Virtual slashes must count for Mother Watch and Shock Hand Cannon");
  actor.playedSlashThisTurn = false;
  resolver.continueAfterCounter(state, actor, target, { name: "借刀杀", type: "slash", _skipUseKillTriggers: true, power: 1 });
  assert(!actor.playedSlashThisTurn, "Borrowed slashes must suppress use-slash relic tracking");
  window.UnderwaterTrainSkills = originalUnderwater;
  window.BondiSkills = originalBondi;
  window.OrcDungeonSkills = originalOrc;
}

module.exports = {
  testActiveRelicConversions, testInvalidatedSlashTracking, testTeamHealingTriggers,
};
