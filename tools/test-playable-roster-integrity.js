const {
  assert, fresh, GameData, Progression, ServerCore,
} = require("./progression-test-harness");

require("../src/original/bounty-render.js");
require("../src/original/bounty-rewards.js");
require("../src/original/bounty-task-rewards.js");
require("../src/original/bounty-task-generator.js");
require("../src/original/bounty-task-repair.js");
require("../src/original/bounty-tasks.js");

const initialIds = ["lokar", "besta_doll"];
const nurseryIds = [
  "manny", "nonoka", "flora", "wendy", "bertis", "angelica",
  "elrana", "nanali", "besta", "sonia", "gerda",
];
const eventIds = [
  "miller", "gerlot", "cadicis", "luka", "loki", "carlos",
  "little_elrana", "ace", "aileng", "ophelia", "chiyo",
  "hoshino_yi", "hoshino_kaiichi",
];

function assertRosterPartition() {
  const ids = GameData.characters.map(character => character.id);
  const routes = [...initialIds, ...nurseryIds, ...eventIds];
  assert(ids.length === 26 && new Set(ids).size === 26,
    "the playable roster must contain 26 unique characters");
  assert(routes.length === 26 && new Set(routes).size === 26,
    "every playable character must have exactly one unlock route");
  assert([...routes].sort().join(",") === [...ids].sort().join(","),
    "the unlock-route matrix must cover the complete playable roster");
}

async function testAllCharactersUnlock() {
  const state = fresh();
  assert(state.chars.filter(character => !character.locked)
    .map(character => character.id).sort().join(",") === [...initialIds].sort().join(","),
  "fresh saves must unlock only the two initial characters");

  state.resources.essence = 1000;
  for (const id of ["besta", "sonia", "gerda"]) {
    const result = await ServerCore.call("unlockChar", { id }, state);
    assert(!result.ok, `${id} must reject nursery unlock before its event`);
  }
  for (const id of ["besta_nursery", "sonia_nursery", "chiyo_recruit", "gerda_nursery"]) {
    const result = await ServerCore.call("unlockEvent", { id }, state);
    assert(!result.ok, `${id} must reject missing event prerequisites`);
  }
  state.flags.bestaNurseryUnlockPending = true;
  state.flags.littleElranaUnlockPending = true;
  state.flags.underwaterTrainFirstClear = true;
  state.flags.hoshinoFamilyUnlockPending = true;
  state.defeatedElites.push(
    "xx_witherer_1124", "mechanical_bull_king", "demon_king_bakaar",
  );
  for (const id of ["besta_nursery", "sonia_nursery", "gerda_nursery"]) {
    const result = await ServerCore.call("unlockEvent", { id }, state);
    assert(result.changed, `${id} must open its nursery route`);
  }
  for (const id of nurseryIds) {
    const result = await ServerCore.call("unlockChar", { id }, state);
    assert(result.changed, `${id} must unlock through its nursery route`);
  }
  for (const id of [
    "miller", "gerlot", "cadicis", "luka", "little_elrana", "ace",
    "underwater_train", "ophelia", "chiyo_recruit", "hoshino_family",
  ]) {
    const result = await ServerCore.call("unlockEvent", { id }, state);
    assert(result.changed, `${id} must complete its character unlock route`);
  }
  for (const [index, id] of ["first_defeat", "second_defeat"].entries()) {
    const defeat = await ServerCore.call(
      "settleDefeat", { defeatId: `defeat:${index + 1}` }, state,
    );
    const event = await ServerCore.call("unlockEvent", { id }, state);
    assert(defeat.ok && event.changed, `${id} must unlock after its defeat`);
  }
  assert(state.chars.every(character => !character.locked),
    `all playable characters must unlock; locked: ${state.chars
      .filter(character => character.locked).map(character => character.id).join(",")}`);
}

function testAllCharacterBondTasks() {
  const huntIds = new Set(Object.values(GameData.enemies || {})
    .flat().map(enemy => enemy.id));
  GameData.characters.forEach(template => {
    const state = fresh();
    state.flags.underwaterTrainUnlocked = true;
    state.flags.orcDungeonUnlocked = true;
    state.chars.forEach(character => {
      character.locked = character.id !== template.id;
    });
    const task = window.BountyTasks.generate(state, {
      hunt: new Set(huntIds), bond: new Set(),
    });
    assert(task?.type === "bond" && task.charId === template.id,
      `${template.id} must be eligible for a bond task`);
    assert(task.charName === template.name,
      `${template.id} bond task must use the canonical character name`);
  });
}

function testEveryLevelRaisesStats() {
  GameData.characters.forEach(template => {
    const unit = { id: template.id, level: 0, exp: 0 };
    let previous = Progression.statsAt(template, 0);
    for (let level = 1; level <= Progression.maxLevel; level += 1) {
      const result = Progression.grant(unit, Progression.need(unit.level), template);
      assert(result.level === level, `${template.id} must reach level ${level}`);
      Progression.statKeys.forEach(key => {
        assert(unit.stats[key] > previous[key],
          `${template.id} ${key} must increase at level ${level}`);
      });
      ["bloodlust", "handLimit", "drawPerTurn", "initialDraw"].forEach(key => {
        assert(unit.stats[key] === template.stats[key],
          `${template.id} ${key} must stay fixed at level ${level}`);
      });
      previous = { ...unit.stats };
    }
  });
}

(async () => {
  assertRosterPartition();
  await testAllCharactersUnlock();
  testAllCharacterBondTasks();
  testEveryLevelRaisesStats();
  console.log("Playable roster integrity tests passed");
})().catch(error => {
  console.error(error.stack);
  process.exit(1);
});
