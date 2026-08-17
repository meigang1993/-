const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.resolve(__dirname, "..");
let loaded = false;

function loadRuntime() {
  if (loaded) return;
  global.window = global;
  global.console = console;
  [
    "game-random.js",
    "economy-config.js",
    "data-cards.js",
    "data-characters-core.js",
    "data-characters-extra.js",
    "data-future-characters.js",
    "data-new-characters.js",
    "data-characters.js",
    "data-future-dungeons.js",
    "data-future-orc-enemies.js",
    "data-bakar-enemy.js",
    "data-future-enemies.js",
    "data-orc-bondi.js",
    "data-guard-kelly.js",
    "data-sakura-risa.js",
    "data-machine-factory-enemies.js",
    "data-underwater-train-enemies.js",
    "data-world.js",
    "data.js",
    "character-progression.js",
    "bounty-ledger.js",
    "receipt-ledger.js",
    "unlock-event-progress.js",
    "store-state-factory.js",
    "battle-setup.js",
  ].forEach(file => {
    const full = path.join(root, "src", "original", file);
    vm.runInThisContext(fs.readFileSync(full, "utf8"), { filename: full });
  });
  window.RelicSystem = {
    statsOf: () => ({}),
    statsForNames: () => ({}),
    hasEquipped: () => false,
  };
  window.SkinSystem = { applyToChar: (_, character) => character };
  window.GameAssets = { preloadBattle: async () => {} };
  window.AngelicaLukaSkills = { battleStart() {} };
  window.OrcDungeonSkills = { battleStart() {} };
  loaded = true;
}

function unitSnapshot(unit) {
  return {
    uid: unit.uid,
    ref: unit.ref,
    hp: unit.hp,
    maxHp: unit.maxHp,
    stats: unit.stats,
    hand: unit.hand.map(card => `${card.suit}:${card.name}`),
    deck: unit.deck.map(card => `${card.suit}:${card.name}`),
  };
}

function snapshot(input, state) {
  const battle = state.battle;
  return {
    input,
    missionId: battle.missionId,
    battleBgm: battle.battleBgm,
    allies: battle.allies.map(unitSnapshot),
    enemies: battle.enemies.map(unitSnapshot),
    sharedAllyPile: battle.allies.length < 2 || battle.allies[0].deck === battle.allies[1].deck,
  };
}

function digest(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function create(input, random) {
  loadRuntime();
  const group = window.GameData.enemies[input.missionId];
  const template = group?.find(enemy => enemy.id === input.enemyId);
  const difficulty = window.GameData.difficulties[input.difficultyId];
  if (!template) throw new Error(`Unknown enemy ${input.enemyId} for ${input.missionId}`);
  if (!difficulty) throw new Error(`Unknown difficulty ${input.difficultyId}`);
  const enemy = window.GameData.scaleEnemyStats(template, difficulty, template.type);
  const state = window.GameStoreStateFactory.freshState();
  state.random = { version: 1, seed: random.seed >>> 0, cursor: random.cursor };
  await window.BattleSetup().create(state, input.missionId, null, {
    test: true,
    allyIds: input.allyIds,
    enemies: [enemy],
  });
  return { snapshot: snapshot(input, state), random: window.GameRandom.snapshot(state) };
}

async function record(input) {
  loadRuntime();
  const random = window.GameRandom.create(input.seed);
  const output = await create(input, random);
  const randomCalls = output.random.cursor - random.cursor;
  return {
    version: 2,
    recordedAt: new Date().toISOString(),
    input,
    random,
    finalCursor: output.random.cursor,
    randomCalls,
    snapshot: output.snapshot,
    digest: digest(output.snapshot),
  };
}

async function verify(replay) {
  const validRandom = replay?.random?.version === 1
    && Number.isInteger(replay.random.seed)
    && Number.isSafeInteger(replay.random.cursor)
    && replay.random.cursor >= 0;
  if (replay?.version !== 2 || !validRandom
    || !Number.isSafeInteger(replay.finalCursor)
    || !Number.isSafeInteger(replay.randomCalls)) {
    throw new Error("Unsupported battle replay format");
  }
  const output = await create(replay.input, replay.random);
  const randomCalls = output.random.cursor - replay.random.cursor;
  if (output.random.cursor !== replay.finalCursor || randomCalls !== replay.randomCalls) {
    throw new Error(`Replay used ${randomCalls} random calls instead of ${replay.randomCalls}`);
  }
  const actual = digest(output.snapshot);
  if (actual !== replay.digest || JSON.stringify(output.snapshot) !== JSON.stringify(replay.snapshot)) {
    throw new Error(`Battle replay diverged: expected ${replay.digest}, received ${actual}`);
  }
  return { digest: actual, randomCalls };
}

module.exports = { record, verify };
