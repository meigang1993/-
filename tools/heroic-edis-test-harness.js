const assert = require("assert");
const { card, unit, scenario } = require("./pursue-kill-fixtures");

require("../src/original/data-future-relics.js");
require("../src/original/data-relics.js");
require("../src/original/relics.js");
require("../src/original/data-machine-factory-enemies.js");
require("../src/original/data-underwater-train-enemies.js");
require("../src/original/data-ruins-sand-city-enemies.js");
require("../src/original/data-world.js");

window.GameData = {
  ...window.GameDataCards,
  ...window.GameDataWorld,
  enemies: { machine_factory: window.GameDataMachineFactoryEnemies },
};
require("../src/original/dungeon-enemies.js");
require("../src/original/machine-factory-skills.js");
require("../src/original/enemy-status-effects.js");
require("../src/original/enemy-kill-hooks.js");
require("../src/original/enemy-damage-hooks.js");
require("../src/original/enemy-combat-hooks.js");
require("../src/original/enemy-tactical-skills.js");
require("../src/original/enemy-skills.js");

window.UICommon = {
  skillsOf(actor) {
    return [
      ...(actor.skills || []),
      ...window.RelicSystem.skillsForNames(actor.battleRelics || []),
    ];
  },
};

let drawId = 0;
let animId = 0;
function draw(target, count, battle) {
  const cards = Array.from({ length: count }, () =>
    card("看破", { suit: "♣", _heroicEdisDraw: ++drawId }));
  cards.forEach(drawn => {
    if (battle?.animQueue) drawn._pendingDraw = true;
    target.hand.push(drawn);
  });
  return cards;
}

const combat = window.BattleCombat({
  active: battle => battle.allies[0],
  isKillCard: window.CardUtils.isKillCard,
  tempAttack: actor => (actor.stats?.attack || 0) + (actor.tempAttack || 0),
  draw,
  intentMax: actor => actor.stats?.bloodlust || 1,
  nextAnim: () => ++animId,
  finishBattle() {},
});

const template = window.GameDataMachineFactoryEnemies.find(enemy => enemy.id === "pursuer_edis");
const expectedRelics = ["伊迪斯电锯剑", "白色哥特洛丽塔"];
const hell = window.GameDataWorld.difficulties.hell;
const group = window.DungeonEnemyGroups.bossGroup(
  window.GameDataMachineFactoryEnemies,
  hell,
  [template],
);
const scaled = group[0];

function testConfiguration() {
  assert.strictEqual(group.length, 1, "heroic Edis must remain a solo boss");
  assert.strictEqual(template.role, "连锁追击封疗Boss",
    "Edis's identity must summarize her pursuit and healing-lock mechanics");
  assert(template.evaluation.includes("连锁追击")
    && template.evaluation.includes("恢复封锁")
    && template.evaluation.includes("拷贝魔眼"),
  "Edis's positioning must describe her actual pursuit, healing lock, and copy kit");
  assert.deepStrictEqual(scaled.battleRelics, expectedRelics,
    "heroic Edis must carry her remaining relic drops");
  assert.deepStrictEqual(
    window.RelicSystem.skillsForNames(expectedRelics).filter(skill => skill.type === "active"),
    [],
    "heroic Edis must not expose a removed active relic skill",
  );
  assert.strictEqual(
    template.skills.find(skill => skill.name === "无限暗刃")?.icon,
    "⭐",
    "Infinite Dark Blade must use the locked-skill star icon",
  );
}

function makeEdis(hand = [], relics = expectedRelics) {
  const edis = unit("edis", "enemy", hand);
  Object.assign(edis, {
    id: template.id,
    ref: template.id,
    ai: template.ai,
    name: template.name,
    skills: template.skills,
    hp: scaled.hp,
    maxHp: scaled.hp,
    intent: scaled.bloodlust,
    stats: {
      attack: scaled.attack,
      magic: scaled.magic,
      speed: scaled.speed,
      bloodlust: scaled.bloodlust,
      handLimit: scaled.handLimit,
    },
    battleRelics: [...relics],
  });
  return edis;
}

function battleState(edis, allies) {
  const state = scenario([], []).state;
  state.equipment = {};
  state.battle.enemies = [edis];
  state.battle.allies = allies;
  window.state = state;
  return state;
}

function revealPending(actor) {
  actor.hand.forEach(item => { delete item._pendingDraw; });
}

module.exports = {
  assert, battleState, card, combat, makeEdis, revealPending, testConfiguration, unit,
};
