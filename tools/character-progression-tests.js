const {
  assert, character, fresh, GameData, Progression, ServerCore, Store,
} = require("./progression-test-harness");

function testGrowthProfiles() {
  assert(Progression.expToNext.reduce((sum, value) => sum + value, 0) === 20410,
    "level 15 must require 20410 total experience");
  const nodeRewards = Object.values(GameData.difficulties).map(difficulty =>
    ["normal", "elite", "boss"].map(kind =>
      Progression.rewardFor(kind, difficulty)));
  assert(JSON.stringify(nodeRewards) === JSON.stringify([
    [30, 70, 130], [35, 81, 150], [41, 95, 176],
    [48, 112, 208], [57, 133, 247],
  ]), "difficulty experience rewards changed");
  assert(Object.keys(Progression.growth).sort().join(",")
    === GameData.characters.map(character => character.id).sort().join(","),
  "every playable character needs exactly one dedicated growth profile");
  const template = GameData.characters.find(item => item.id === "besta_doll");
  const level15 = Progression.statsAt(template, 15);
  const level20 = Progression.statsAt(template, 20);
  assert(level20.magic > level15.magic && level20.maxHp > level15.maxHp,
    "level 16-20 must continue applying character growth");
  const targets = {
    artina: { maxHp: 130, attack: 18.5, magic: 12.5, speed: 19.5 },
    maria: { maxHp: 128, attack: 13.5, magic: 15.5, speed: 17 },
  };
  Object.entries(targets).forEach(([id, expected]) => {
    const current = GameData.characters.find(item => item.id === id);
    assert(JSON.stringify(Progression.statsAt(current, 20)) === JSON.stringify(expected),
      `${id} level-20 attributes changed`);
  });
}

function testExperienceGrant() {
  const template = GameData.characters.find(item => item.id === "lokar");
  const unit = { id: template.id, level: 0, exp: 0 };
  const first = Progression.grant(unit, 30, template);
  assert(first.level === 0 && unit.exp === 30,
    "one normal victory must retain partial level-zero experience");
  const multi = Progression.grant(unit, 20380, template);
  assert(multi.level === 15 && unit.exp === 0, "large rewards must support multi-level gains and cap at 15");
  const capped = JSON.stringify(unit);
  Progression.grant(unit, 99999, template);
  assert(JSON.stringify(unit) === capped, "capped characters must not accumulate overflow experience");
}

function testMigration() {
  const state = fresh();
  const unit = character(state);
  delete state.flags.characterProgressionVersion;
  state.flags.characterStatResetVersion = 4;
  state.view = "training";
  unit.level = "10";
  unit.exp = 9999;
  unit.spent = { maxHp: 5, attack: 20, drawPerTurn: 2 };
  unit.stats = { ...unit.stats, maxHp: 50 };
  unit.hp = 25;
  Store.migrate(state);
  const migrated = character(state);
  assert(migrated.level === 10 && migrated.exp === 0,
    "legacy migration must preserve level and reset current-level experience");
  assert(!Object.hasOwn(migrated, "spent"),
    "legacy manual allocations must be removed");
  assert(migrated.hp === Math.round(migrated.stats.maxHp * .5),
    "legacy migration must preserve the current HP ratio");
  assert(state.flags.characterProgressionVersion === 1
    && !Object.hasOwn(state.flags, "characterStatResetVersion"),
  "migration must advance the progression version and remove the old reset flag");
  assert(state.view === "hall", "legacy training snapshots must return to the hall");
  assert(state.log[0].includes("手动加点已移除"),
    "migration must explain the progression conversion");

  const growth = fresh();
  const growthUnit = character(growth);
  delete growth.flags.characterGrowthVersion;
  growthUnit.level = 10;
  growthUnit.exp = 120;
  growthUnit.hp = 22;
  window.GameStoreCompact.compactSaveData(growth);
  Store.migrate(growth);
  const grown = character(growth);
  assert(grown.level === 10 && grown.exp === 120,
    "growth migration must preserve level and current-level experience");
  assert(grown.stats.maxHp === 84 && grown.hp === 31,
    "growth migration must rebuild rebalanced stats and preserve compact-save HP ratio");
  assert(growth.flags.characterGrowthVersion === 3,
    "growth migration must advance its independent version");
  assert(growth.log[0].includes("等级与经验保留"),
    "growth migration must explain the preserved progression");

  const secondGrowth = fresh();
  const secondGrowthUnit = character(secondGrowth);
  secondGrowth.flags.characterGrowthVersion = 2;
  secondGrowthUnit.level = 10;
  secondGrowthUnit.exp = 120;
  secondGrowthUnit.hp = 40;
  window.GameStoreCompact.compactSaveData(secondGrowth);
  Store.migrate(secondGrowth);
  assert(character(secondGrowth).hp === 40
    && secondGrowth.flags.characterGrowthVersion === 3,
  "version-2 growth migration must preserve HP when maximum-HP growth is unchanged");
  assert(character(secondGrowth).stats.attack === 12
    && character(secondGrowth).stats.magic === 4,
  "version-2 growth migration must rebuild attack and magic from the new growth table");

  const current = fresh();
  const currentUnit = character(current);
  const template = GameData.characters.find(item => item.id === currentUnit.id);
  currentUnit.level = 10;
  currentUnit.exp = 120;
  currentUnit.stats = Progression.statsAt(template, currentUnit.level);
  currentUnit.hp = 40;
  window.GameStoreCompact.compactSaveData(current);
  assert(!Object.hasOwn(character(current), "stats"),
    "compact saves must omit derived character stats");
  Store.migrate(current);
  assert(character(current).stats.maxHp === 84,
    "current compact saves must rebuild level-derived maximum HP");
  assert(character(current).hp === 40,
    "current compact saves must preserve exact HP instead of healing to full");
}

async function testSettlementExperience() {
  const state = fresh();
  const run = {
    focusId: "xp-run", missionId: "machine_factory", difficultyId: "normal",
    activeParty: ["lokar", "besta_doll"], pending: "n2-0",
    layers: [[{
      id: "n2-0", type: "normal", done: false,
      enemies: [{ id: "mechanical_goblin" }],
    }]],
  };
  const args = {
    run, nodeId: "n2-0", kind: "normal",
    defeatedEnemyIds: ["mechanical_goblin"],
  };
  const first = await ServerCore.call("settleDungeon", args, state);
  assert(first.changed, "first valid battle settlement must change progression");
  assert(character(state, "lokar").level === 0
    && character(state, "lokar").exp === 30
    && character(state, "besta_doll").level === 0
    && character(state, "besta_doll").exp === 30,
  "all battle participants must receive full experience");
  const reward = first.result.core.lastLocalReward;
  assert(reward.experience === 30 && reward.progression.length === 2,
    "settlement receipt must contain experience and participant results");
  const snapshot = state.chars.map(unit => [unit.id, unit.level, unit.exp]);
  const repeated = await ServerCore.call("settleDungeon", args, state);
  assert(repeated.ok && !repeated.changed,
    "repeated settlement must reconcile from the receipt");
  assert(JSON.stringify(snapshot) === JSON.stringify(
    state.chars.map(unit => [unit.id, unit.level, unit.exp])),
  "repeated settlement must not duplicate experience");
}

async function testSettlementPartySanitization() {
  const state = fresh();
  const run = {
    focusId: "xp-party-sanitize", missionId: "machine_factory",
    difficultyId: "normal", party: ["lokar"],
    activeParty: ["lokar", "lokar", "besta_doll"], pending: "n2-0",
    layers: [[{
      id: "n2-0", type: "normal", done: false,
      enemies: [{ id: "mechanical_goblin" }],
    }]],
  };
  const result = await ServerCore.call("settleDungeon", {
    run, nodeId: "n2-0", kind: "normal",
    defeatedEnemyIds: ["mechanical_goblin"],
  }, state);
  assert(character(state, "lokar").level === 0
    && character(state, "lokar").exp === 30,
  "duplicate active-party ids must grant experience only once");
  assert(character(state, "besta_doll").level === 0,
    "characters outside the expedition party must not receive experience");
  assert(result.result.core.lastLocalReward.progression.length === 1,
    "the reward receipt must contain only normalized expedition participants");
}

module.exports = {
  testExperienceGrant, testGrowthProfiles, testMigration,
  testSettlementExperience, testSettlementPartySanitization,
};
