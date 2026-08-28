global.window = global;
require("../src/original/game-random.js");

window.BattleLog = { add(state, message) { (state.log ||= []).push(message); } };
window.BattleLines = { skill() {} };
window.BattleCards = {
  visibleHandCount(unit) {
    return (unit?.hand || []).filter(card => !card._pendingDraw).length;
  },
  put(battle, unit, card, pile, opts = {}) {
    const destination = pile === "discard" && (card?.void || card?.copiedByEdis) ? "consumed" : pile;
    if (opts.forcedDiscard) {
      battle.played.unshift({
        ...card, dismantled: true, _playedByName: unit.name, _playedAction: "被弃置",
      });
    } else if (opts.showDiscard) {
      battle.played.unshift({
        ...card, _playedByName: unit.name, _playedAction: "弃置了",
      });
    }
    (unit[destination] ||= []).push(card);
  },
  putMany(battle, unit, cards, pile) { cards.forEach(card => this.put(battle, unit, card, pile)); },
  afterHandLost() {},
  syncStatusCards() {},
};
window.RelicSystem = { hasEquipped: () => false };

[
  "economy-config.js", "data-cards.js", "card-utils.js", "witherer-relic-skills.js",
  "witherer-skills.js", "nonoka-new-moon-skills.js", "nonoka-loki-skills.js",
  "battle-ai-helpers.js", "battle-ai-tactics.js", "battle-ai-slash-planner.js",
  "battle-ai-skill-helpers.js", "battle-ai-skill-evaluation.js",
  "battle-ai-skill-moves.js", "battle-ai-skill-planner.js", "battle-ai.js",
  "battle-status-card-registry.js", "battle-status-cards.js",
  "battle-draw-feedback.js", "battle-turn-state.js", "battle-combat-visuals.js",
  "battle-card-playability.js", "battle-combat-targeting.js",
  "battle-reaction-queue.js",
  "battle-card-tactics.js", "battle-card-active-relics.js",
  "battle-card-hand-interactions.js", "battle-card-counter-interactions.js",
  "battle-card-interactions.js",
  "battle-card-specials.js", "battle-card-resume-state.js",
  "battle-card-resume-hooks.js", "battle-card-resume-flow.js", "battle-card-resume.js",
  "edis-skills.js", "wendy-skills.js", "cadicis-skills.js",
  "wendy-cadicis-skills.js", "battle-damage-utils.js",
  "battle-damage-triggers.js", "battle-thunder-hammer-response.js",
  "battle-dodge-cards.js", "battle-dodge-resume.js",
  "battle-dodge-auto-response.js", "battle-dodge-response.js",
  "battle-damage-response.js", "battle-damage-relics.js",
  "battle-damage-lifecycle.js", "battle-damage-resolution.js",
  "battle-damage-hit.js", "battle-damage.js",
  "battle-combat-responses.js", "battle-card-cleanup.js", "battle-combat-card-effects.js",
  "battle-combat-attack-values.js", "battle-combat-attack-flow.js",
  "battle-combat-attack.js", "battle-combat-resolver.js",
  "battle-combat.js",
].forEach(file => require(`../src/original/${file}`));
window.GameData = { cardCodex: window.GameDataCards.cardCodex };

let animationId = 0;
const combat = window.BattleCombat({
  active: battle => battle.allies[0],
  isKillCard: window.CardUtils.isKillCard,
  tempAttack: unit => (unit.stats?.attack || 0) + (unit.tempAttack || 0),
  draw: () => [],
  intentMax: () => 3,
  nextAnim: () => ++animationId,
  finishBattle() {},
});

function card(name, extra = {}) {
  return window.CardUtils.cloneEntity(name, { suit: "♠", ...extra });
}

function unit(uid, side, hand) {
  return {
    uid, side, name: side === "ally" ? "测试角色" : "测试目标", hp: 30, maxHp: 30,
    block: 0, intent: 2, stats: { attack: 0, magic: 0, speed: 0 }, statuses: [],
    skills: [], hand, deck: [], discard: [], consumed: [],
  };
}

function scenario(actorHand, targetHand) {
  const actor = unit("ally-1", "ally", actorHand);
  const target = unit("enemy-1", "enemy", targetHand);
  return {
    actor,
    target,
    state: {
      settings: { manualResponse: false }, log: [],
      battle: {
        allies: [actor], enemies: [target], phase: 4, locked: false, combo: 0,
        hitFxId: 0, animQueue: [], played: [], shownPlayed: [], defeatedEnemyIds: [], mimicLinks: [],
      },
    },
  };
}

module.exports = { combat, card, unit, scenario };
