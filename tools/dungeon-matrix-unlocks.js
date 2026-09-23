const {
  assert,
  DungeonEnemyGroups,
  DungeonRewards,
  GameData,
  GameStoreStateFactory,
  ServerCore,
  triggerOrcDungeonUnlockEvent,
} = require("./dungeon-matrix-harness");

function testConfiguration() {
  assert(JSON.stringify(GameData.difficulties.normal.weights) === JSON.stringify({ normal: 78, rest: 12, chest: 10 }), "Normal map rest weight changed");
  ["adventure", "warrior", "king", "hell"].forEach(id => {
    assert(JSON.stringify(GameData.difficulties[id].weights) === JSON.stringify({ normal: 75, rest: 10, chest: 15 }), `${id} map rest weight changed`);
  });
  assert(JSON.stringify(GameData.missions.find(item => item.id === "underwater_train").route.rest) === "[10]", "Underwater Train must have one rest layer");
  assert(JSON.stringify(GameData.missions.find(item => item.id === "orc_dungeon").route.rest) === "[9]", "Orc Dungeon must have one rest layer");
  const orcPool = GameData.enemies.orc_dungeon;
  const bakaar = orcPool.find(enemy => enemy.id === "demon_king_bakaar");
  const bakaarGroup = DungeonEnemyGroups.bossGroup(orcPool, GameData.difficulties.normal, [bakaar]);
  assert(bakaarGroup.map(enemy => enemy.id).join("|") === "demon_mecha_cerberus|demon_king_bakaar", "Bakaar boss group must contain Cerberus and Bakaar");
}

async function testUnlockGates() {
  const access = GameStoreStateFactory.freshState();
  access.flags.underwaterTrainUnlocked = true;
  assert(!(await ServerCore.call("startDungeon", { missionId: "orc_dungeon", difficultyId: "normal" }, access)).ok, "Locked Orc Dungeon must reject entry");
  access.flags.orcDungeonUnlocked = true;
  assert(!(await ServerCore.call("startDungeon", { missionId: "orc_dungeon", difficultyId: "adventure" }, access)).ok, "Locked adventure difficulty must reject entry");
  assert((await ServerCore.call("startDungeon", { missionId: "orc_dungeon", difficultyId: "normal" }, access)).ok, "Unlocked Orc normal difficulty must allow entry");

  const eventState = GameStoreStateFactory.freshState();
  assert(!triggerOrcDungeonUnlockEvent(eventState, { missionId: "underwater_train", difficultyId: "normal" }), "Underwater normal clear must not open Orc Dungeon");
  assert(triggerOrcDungeonUnlockEvent(eventState, { missionId: "underwater_train", difficultyId: "adventure" }), "Underwater adventure clear must queue Orc Dungeon");
  assert((await ServerCore.call("unlockEvent", { id: "orc_dungeon" }, eventState)).ok, "Orc Dungeon unlock event must complete");
  assert(eventState.flags.orcDungeonUnlocked && eventState.flags.orcDungeonUnlockSeen, "Orc Dungeon unlock flags must persist");

  const failedBank = GameStoreStateFactory.freshState();
  failedBank.flags.orcDungeonUnlocked = true;
  failedBank.unlockedDifficulties.push("adventure");
  failedBank.explore = {
    focusId: "failed-bank", missionId: "orc_dungeon", difficultyId: "adventure",
    complete: true, banked: false, party: ["lokar"], activeParty: ["lokar"],
    earned: { gold: 0, essence: 0, cards: [], relics: [] },
  };
  const originalCall = ServerCore.call;
  try {
    ServerCore.call = async (method, args, state) => method === "bankRun" ? { ok: false } : originalCall(method, args, state);
    await DungeonRewards.finish(failedBank);
  } finally {
    ServerCore.call = originalCall;
  }
  assert(!failedBank.flags.hoshinoFamilyUnlockPending, "Failed reward banking must not queue Hoshino Yi");
}

module.exports = { testConfiguration, testUnlockGates };
