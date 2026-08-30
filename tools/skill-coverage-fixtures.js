const fs = require("fs");
const vm = require("vm");

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function card(name, type = "tactic", extra = {}) {
  return { name, type, suit: extra.suit || "♥", text: `${name} test`, ...extra };
}

function sampleHand() {
  return [
    card("杀（普攻）", "slash", { power: 1, scale: "attack", suit: "♠" }),
    card("魔杀", "slash", { power: 1, scale: "magic", suit: "♥" }),
    card("闪", "response", { suit: "♦" }),
    card("看破", "response", { counterTactic: true, suit: "♣" }),
    card("治疗药水", "tactic", { healPct: 0.2, suit: "♥" }),
  ];
}

function unitFromCharacter(character, uid = "a0") {
  const stats = { ...character.stats };
  return {
    uid, side: "ally", ref: character.id, id: character.id, name: character.name, gender: character.gender,
    hp: stats.maxHp, maxHp: stats.maxHp, block: 0, intent: stats.bloodlust, statuses: [], stats,
    skills: character.skills, hand: sampleHand(), deck: sampleHand(), discard: [], consumed: [],
    pileStats: { deck: [], discard: [], consumed: [] },
  };
}

function enemyFromTemplate(enemy, uid = "e0") {
  const stats = {
    attack: enemy.attack, magic: enemy.magic, speed: enemy.speed, maxHp: enemy.hp,
    bloodlust: enemy.bloodlust, handLimit: enemy.handLimit,
    drawPerTurn: enemy.drawPerTurn, initialDraw: enemy.initialDraw,
  };
  return {
    uid, side: "enemy", id: enemy.id, ref: enemy.id, ai: enemy.ai, type: enemy.type, name: enemy.name,
    gender: enemy.gender || "male", hp: enemy.hp, maxHp: enemy.hp, block: 0, intent: enemy.bloodlust,
    statuses: [], stats, skills: enemy.skills, battleRelics: [], hand: sampleHand(), deck: sampleHand(),
    discard: [], consumed: [], pileStats: { deck: [], discard: [], consumed: [] },
  };
}

function createState() {
  const allies = GameData.characters.slice(0, 3).map((character, index) => unitFromCharacter(character, `a${index}`));
  const enemies = Object.values(GameData.enemies).flat().slice(0, 3).map((enemy, index) => enemyFromTemplate(enemy, `e${index}`));
  const state = {
    resources: { relics: [] }, equipment: {}, testEquipment: {}, relicCollection: [], testRelics: [],
    battle: {
      test: true, allies, enemies, phase: 4, turn: 0, roundNo: 1, activeUid: allies[0].uid,
      animQueue: [], played: [], shownPlayed: [], combo: 0, locked: false, hitFxId: 0, defeatedEnemyIds: [],
    },
  };
  window.state = state;
  return state;
}

function installGlobals() {
  global.window = global;
  load("./src/original/game-random.js");
  window.BattleLog = { add(state, message) { (state.log ||= []).push(message); } };
  window.BattleLines = { skill(state, unit, name) { (state.skillLines ||= []).push(`${unit?.name || "unit"}:${name}`); } };
  window.BattleCards = {
    put() {}, putMany() {}, afterHandLost() {}, syncStatusCards() {},
    visibleHandCount(unit) {
      return (unit?.hand || []).filter(item => !item._pendingDraw).length;
    },
    queueResponse(battle, holder, event, before,
      after = this.visibleHandCount(holder)) {
      if (before !== after) {
        if (holder && holder.visualHandCount == null) {
          holder.visualHandCount = before;
        }
        Object.assign(event, {
          visualHandBefore: before,
          visualHandCount: after,
        });
      }
      battle?.animQueue?.push(event);
      return event;
    },
  };
  window.BattleSystem = {
    active: battle => battle?.allies?.[0] || null,
    canPlay: () => true,
    draw(unit, count) {
      const cards = Array.from({ length: count }, (_, index) => card(`摸牌${index}`, "tactic", { suit: "♠" }));
      unit.hand.push(...cards);
      return cards;
    },
    pushFloat() {},
    holdVisual() {},
    damage() { return { hpLoss: 1, dodged: false }; },
  };
  window.SkinSystem = { applyToChar: () => null };
}

function loadRuntime() {
  [
    "economy-config.js", "data-cards.js", "data-ruins-content.js", "card-utils.js", "card-art.js", "data-characters-core.js",
    "data-characters-extra.js", "data-future-characters.js", "data-new-characters.js", "data-characters.js",
    "data-future-orc-enemies.js", "data-bakar-enemy.js", "data-ruins-sand-city-enemies.js",
    "data-future-enemies.js",
    "data-orc-bondi.js", "data-guard-kelly.js", "data-sakura-risa.js",
    "data-machine-factory-enemies.js", "data-underwater-train-enemies.js",
    "data-ruins-sand-city.js",
    "data-combat-roles.js", "data-world.js", "data.js", "battle-damage-attributes.js",
    "data-future-relics.js", "data-relics.js", "relics.js", "battle-pile-stats.js",
    "battle-ai-tactics.js", "battle-ai-helpers.js", "battle-ai-slash-planner.js",
    "battle-ai-skill-helpers.js", "battle-ai-skill-evaluation.js",
    "battle-ai-skill-moves.js", "battle-ai-skill-planner.js",
    "guest-ophelia-guard.js", "green-hat.js", "battle-reaction-queue.js",
    "witherer-relic-skills.js", "witherer-skills.js", "bondi-skills.js",
    "nonoka-new-moon-skills.js", "nonoka-loki-skills.js",
    "battle-draw-transaction.js", "flora-speed-assault.js", "flora-skills.js",
    "carlos-skills.js", "flora-carlos-skills.js",
    "wendy-skills.js", "cadicis-skills.js", "wendy-cadicis-skills.js",
    "lokar-skills.js", "battle-card-tactics.js", "manny-skills.js",
    "miller-skills.js", "bertis-gerlot-skills.js", "angelica-luka-skills.js", "nanali-sealed.js",
    "elrana-healing-skills.js", "ace-skills.js", "nanali-skills.js",
    "ace-nanali-skills.js", "elrana-ace-nanali-skills.js",
    "edis-skills.js", "machine-factory-skills.js", "enemy-status-effects.js",
    "enemy-kill-hooks.js", "enemy-damage-hooks.js", "enemy-combat-hooks.js",
    "enemy-tactical-skills.js", "enemy-skills.js", "abe-mike-skills.js",
    "underwater-train-control-skills.js", "underwater-train-bite-skills.js",
    "underwater-train-prepare-skills.js", "underwater-train-target-counters.js",
    "underwater-train-target-actions.js", "underwater-train-target-skills.js",
    "underwater-train-damage-skills.js", "underwater-train-attack-skills.js",
    "underwater-train-combat-skills.js", "underwater-train-skills.js",
    "orc-drone-skills.js", "orc-combat-skills.js", "orc-dungeon-skills.js",
    "bakar-relic-skills.js", "bakar-core-skills.js", "bakar-fire-skills.js",
    "bakar-skills.js", "sakura-risa-combat-skills.js",
    "sakura-risa-lifecycle-skills.js", "sakura-risa-skills.js",
    "guard-kelly-skills.js", "battle-draw-feedback.js", "gerda-skills.js", "hoshino-yi-skills.js",
    "hoshino-kaiichi-share-queue.js", "hoshino-kaiichi-share-resolution.js",
    "hoshino-kaiichi-share.js", "hoshino-kaiichi-skills.js",
    "hoshino-skills.js", "guest-aileng-skills.js", "guest-characters-skills.js",
    "ui-common-skill-model.js", "ui-common-skill-view.js",
    "ui-common-skills.js", "ui-common-art.js", "ui-common-card-art.js",
    "ui-common-card-combat.js", "ui-common-cards.js",
    "ui-common-relics.js", "ui-common.js", "battle-ai.js",
  ].forEach(file => load(`./src/original/${file}`));
}

module.exports = { assert, card, unitFromCharacter, enemyFromTemplate, createState, installGlobals, loadRuntime };
