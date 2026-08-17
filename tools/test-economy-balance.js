const fs = require("fs");
const vm = require("vm");

global.window = global;

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

load("./src/original/game-random.js");
load("./src/original/economy-config.js");
load("./src/original/data-future-dungeons.js");
window.GameDataMachineFactoryEnemies = [{ id: "machine" }];
window.GameDataUnderwaterTrainEnemies = [{ id: "train" }];
window.GameDataFutureEnemies = {};
load("./src/original/data-world.js");

assert(GameEconomy.startingGold === 0, "fresh games must start with zero Lilith gold");
const difficultyRewards = Object.values(GameDataWorld.difficulties).map(item => item.reward);
assert(JSON.stringify(difficultyRewards) === JSON.stringify([1, 1.35, 1.75, 2.2, 2.75]), "difficulty gold multipliers changed unexpectedly");

const mission = id => GameDataWorld.missions.find(item => item.id === id);
const configured = GameEconomy.dungeonGold;
const normalAverage = (configured.normal[0] + configured.normal[1]) / 2;
const normalDifficulty = GameDataWorld.difficulties.normal;
const weightTotal = Object.values(normalDifficulty.weights).reduce((sum, value) => sum + value, 0);
const randomNodeReward = normalDifficulty.eliteRate * configured.elite
  + (1 - normalDifficulty.eliteRate) * (
    normalDifficulty.weights.normal / weightTotal * normalAverage
    + normalDifficulty.weights.chest / weightTotal * configured.chest
  );
function fixedRouteCounts(id) {
  const route = mission(id).route;
  const fixed = {
    rest: new Set(route.rest || []),
    chest: new Set(route.chest || []),
    boss: new Set(route.boss || [route.layers]),
  };
  const counts = { normal: 0, mixed: 0, rest: 0, chest: 0, boss: 0 };
  for (let layer = 2; layer <= route.layers; layer += 1) {
    if (fixed.boss.has(layer)) counts.boss += 1;
    else if (fixed.rest.has(layer)) counts.rest += 1;
    else if (fixed.chest.has(layer)) counts.chest += 1;
    else if (route.type === "linear" && layer >= (route.mixedEliteFrom || Infinity)) counts.mixed += 1;
    else counts.normal += 1;
  }
  return counts;
}
function fixedRouteReward(id) {
  const counts = fixedRouteCounts(id);
  const mixedReward = normalDifficulty.eliteRate * configured.elite
    + (1 - normalDifficulty.eliteRate) * normalAverage;
  const base = counts.normal * normalAverage + counts.mixed * mixedReward
    + counts.chest * configured.chest + counts.boss * configured.boss;
  return base * mission(id).reward.goldMultiplier;
}
const underwaterCounts = fixedRouteCounts("underwater_train");
const orcCounts = fixedRouteCounts("orc_dungeon");
assert(JSON.stringify(underwaterCounts) === JSON.stringify({ normal: 7, mixed: 4, rest: 1, chest: 1, boss: 1 }), "underwater route payout counts must match its configured layers");
assert(JSON.stringify(orcCounts) === JSON.stringify({ normal: 9, mixed: 0, rest: 1, chest: 1, boss: 1 }), "orc route payout counts must match its configured layers");
const expectedRuns = {
  machine_factory: 8 * randomNodeReward + configured.boss,
  underwater_train: fixedRouteReward("underwater_train"),
  orc_dungeon: fixedRouteReward("orc_dungeon"),
};

assert(expectedRuns.machine_factory >= 1600 && expectedRuns.machine_factory <= 1680, "machine factory baseline is outside target");
assert(expectedRuns.underwater_train >= 2550 && expectedRuns.underwater_train <= 2620, "underwater train baseline is outside target");
assert(expectedRuns.orc_dungeon >= 2880 && expectedRuns.orc_dungeon <= 2940, "orc dungeon baseline is outside target");

for (const id of Object.keys(expectedRuns)) {
  const range = mission(id).reward.bountyGoldRange;
  assert(Array.isArray(range) && range.length === 2 && range[0] <= range[1], `${id} task range is invalid`);
  assert(range[1] <= expectedRuns[id], `${id} single task bonus must not exceed a representative normal run`);
}

window.GameData = window.GameDataWorld;
window.GameStoreStateFactory = { rand: min => min };
load("./src/original/store-save-schema.js");
load("./src/original/store-bounty-repairs.js");
load("./src/original/store-repairs.js");

const migrationState = {
  bounties: [
    { id: "accepted", missionId: "orc_dungeon", accepted: true, bonusGold: 9000 },
    { id: "offered", missionId: "orc_dungeon", accepted: false, bonusGold: 9000 },
    { id: "invalid", missionId: "machine_factory", accepted: true, bonusGold: 9000 },
    { id: "string", missionId: "orc_dungeon", accepted: true, bonusGold: "9000" },
  ],
  pendingBountyRewards: [
    { missionId: "orc_dungeon", bonusGold: 9000 },
    { missionId: "machine_factory", bonusGold: 9000 },
    { taskTitle: "旧任务", bonusGold: 9000 },
    { taskTitle: "损坏任务", bonusGold: 900000 },
  ],
  explore: null,
};
StoreRepairs.refreshBountyGold(migrationState);
assert(migrationState.bounties[0].bonusGold === 9000, "accepted task gold must remain committed");
assert(migrationState.bounties[1].bonusGold === 1200, "unaccepted task gold must migrate to the new range");
assert(migrationState.bounties[2].bonusGold === 500, "impossible accepted task gold must be repaired");
assert(migrationState.bounties[3].bonusGold === 9000, "numeric committed task gold must be normalized");
assert(migrationState.pendingBountyRewards[0].bonusGold === 9000, "pending reward gold must remain committed");
assert(migrationState.pendingBountyRewards[1].bonusGold === 500, "impossible pending reward gold must be repaired");
assert(migrationState.pendingBountyRewards[2].bonusGold === 9000, "bounded legacy reward without mission metadata must survive");
assert(migrationState.pendingBountyRewards[3].bonusGold === 0, "unbounded corrupt reward gold must be rejected");
assert(migrationState._needsSaveAfterMigration, "normalized bounty migration must request a save");

window.BountyRewards = {
  matchesTask: () => true,
  rollReward: () => ({ type: "essence", essence: 1 }),
  hasHuntDrop: () => true,
  claimPending: async () => {},
};
window.BountyRender = { render: () => "", title: () => "任务" };
load("./src/original/bounty-task-rewards.js");
load("./src/original/bounty-task-generator.js");
load("./src/original/bounty-task-repair.js");
load("./src/original/bounty-tasks.js");
load("./src/original/bounty.js");
const runtimeState = {
  flags: { underwaterTrainUnlocked: true, orcDungeonUnlocked: true },
  defeatedElites: [],
  chars: ["a", "b", "c", "d", "e"].map(id => ({ id, locked: false })),
  bounties: [
    { id: "a", type: "bond", charId: "a", missionId: "orc_dungeon", accepted: true, bonusGold: 9000, reward: { type: "essence", essence: 1 } },
    { id: "b", type: "bond", charId: "b", missionId: "machine_factory", accepted: false, bonusGold: 9000, reward: { type: "essence", essence: 1 } },
    { id: "c", type: "bond", charId: "c", missionId: "machine_factory", accepted: true, reward: { type: "essence", essence: 1 } },
    { id: "d", type: "bond", charId: "d", missionId: "machine_factory", accepted: false, bonusGold: 700, reward: { type: "essence", essence: 1 } },
    { id: "e", type: "bond", charId: "e", missionId: "machine_factory", accepted: true, bonusGold: 9000, reward: { type: "essence", essence: 1 } },
  ],
};
BountySystem.acceptTask(runtimeState, "missing");
assert(runtimeState.bounties[0].bonusGold === 9000, "runtime repair must preserve accepted task gold");
assert(runtimeState.bounties[1].bonusGold >= 500 && runtimeState.bounties[1].bonusGold <= 900, "runtime repair must rebalance unaccepted task gold");
assert(runtimeState.bounties[2].bonusGold >= 500 && runtimeState.bounties[2].bonusGold <= 900, "accepted tasks without a valid amount must be repaired");
assert(runtimeState.bounties[3].bonusGold === 700, "valid unaccepted task gold must remain unchanged");
assert(runtimeState.bounties[4].bonusGold >= 500 && runtimeState.bounties[4].bonusGold <= 900, "impossible accepted task gold must not bypass runtime repair");

console.log("Economy balance tests passed: dungeon, task, and difficulty curves");
