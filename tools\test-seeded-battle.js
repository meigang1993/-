const fs = require("fs");
const vm = require("vm");

global.window = global;
global.console = console;

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

[
  "./src/original/game-random.js",
  "./src/original/economy-config.js",
  "./src/original/data-cards.js",
  "./src/original/data-characters-core.js",
  "./src/original/data-characters-extra.js",
  "./src/original/data-future-characters.js",
  "./src/original/data-new-characters.js",
  "./src/original/data-characters.js",
  "./src/original/character-progression.js",
  "./src/original/data-future-dungeons.js",
  "./src/original/data-future-orc-enemies.js",
  "./src/original/data-bakar-enemy.js",
  "./src/original/data-future-enemies.js",
  "./src/original/data-orc-bondi.js",
  "./src/original/data-guard-kelly.js",
  "./src/original/data-sakura-risa.js",
  "./src/original/data-machine-factory-enemies.js",
  "./src/original/data-underwater-train-enemies.js",
  "./src/original/data-world.js",
  "./src/original/data.js",
  "./src/original/bounty-ledger.js",
  "./src/original/receipt-ledger.js",
  "./src/original/unlock-event-progress.js",
  "./src/original/store-state-factory.js",
  "./src/original/battle-setup.js",
].forEach(load);

window.RelicSystem = {
  statsOf: () => ({}),
  statsForNames: () => ({}),
  hasEquipped: () => false,
};
window.SkinSystem = { applyToChar: (_, character) => character };
window.GameAssets = { preloadBattle: async () => {} };
window.AngelicaLukaSkills = { battleStart() {} };
window.OrcDungeonSkills = { battleStart() {} };

async function createBattle(seed, missionId, enemy, difficultyId = "normal") {
  const setup = window.BattleSetup();
  const state = window.GameStoreStateFactory.freshState();
  state.random = window.GameRandom.create(seed);
  await setup.create(state, missionId, null, {
    test: true,
    allyIds: ["lokar", "besta_doll"],
    enemies: [enemy],
  });
  const battle = state.battle;
  const label = `${missionId}/${difficultyId}/${enemy.id}/seed ${seed}`;
  assert(battle.missionId === missionId, `${label}: mission id mismatch`);
  assert(battle.allies.length === 2, `${label}: expected two allies`);
  assert(battle.enemies.length === 1, `${label}: expected one enemy`);
  assert(battle.enemies[0].ref === enemy.id, `${label}: enemy reference mismatch`);
  assert(battle.enemies[0].maxHp === enemy.hp, `${label}: difficulty-scaled hp mismatch`);
  assert(battle.allies[0].deck === battle.allies[1].deck, `${label}: allies must share a deck`);
  assert(battle.allies[0].hp > 0 && battle.enemies[0].hp > 0, `${label}: units must start alive`);
  return battle;
}

async function signature(seed) {
  const enemy = window.GameData.enemies.machine_factory[0];
  const battle = await createBattle(seed, "machine_factory", enemy);
  return battle.allies[0].deck.map(card => `${card.suit}${card.name}`).join("|");
}

(async () => {
  assert(window.GameStoreStateFactory.freshState().resources.gold === 0, "fresh games must start with zero Lilith gold");
  const idStateA = { random: window.GameRandom.create(1124) };
  const idStateB = { random: window.GameRandom.create(1124) };
  assert(window.GameRandom.persistentId("run-", idStateA)
    === window.GameRandom.persistentId("run-", idStateB), "persistent ids must replay from seed and cursor");
  assert(idStateA.random.cursor === 0, "persistent ids must not alter later gameplay randomness");
  const missionIds = ["machine_factory", "underwater_train", "orc_dungeon"];
  const difficultyIds = Object.keys(window.GameData.difficulties);
  for (const missionId of missionIds) {
    const enemies = window.GameData.enemies[missionId];
    assert(Array.isArray(enemies) && enemies.length > 0, `${missionId}: enemy group must not be empty`);
    for (const difficultyId of difficultyIds) {
      const difficulty = window.GameData.difficulties[difficultyId];
      for (let index = 0; index < enemies.length; index += 1) {
        const enemy = window.GameData.scaleEnemyStats(enemies[index], difficulty, enemies[index].type);
        await createBattle(2000 + index, missionId, enemy, difficultyId);
      }
    }
  }
  const first = await signature(1124);
  const repeated = await signature(1124);
  const different = await signature(1125);
  assert(first === repeated, "same seed must produce the same battle deck");
  assert(first !== different, "different seeds should produce different battle decks");
  for (let seed = 1; seed <= 100; seed += 1) await signature(seed);
  console.log("Battle setup passed: all dungeon enemies across 5 difficulties and 100 deterministic seeds");
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
