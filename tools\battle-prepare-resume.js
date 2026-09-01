const assert = require("assert");
global.window = global;

require("../src/original/battle-prepare-sequence.js");

function runBattlePrepareResume() {
  const saved = {
    BakarSkills: window.BakarSkills,
    EnemySkills: window.EnemySkills,
    AngelicaLukaSkills: window.AngelicaLukaSkills,
    NonokaLokiSkills: window.NonokaLokiSkills,
    GuestCharacterSkills: window.GuestCharacterSkills,
    BertisGerlotSkills: window.BertisGerlotSkills,
  };
  const events = [];
  const unit = { uid: "prepare-unit", name: "准备角色", hp: 30, intent: 2 };
  const state = { battle: { locked: false, prepareUnitUid: unit.uid, prepareStep: 0 } };
  const damage = () => {};
  const combat = {
    damage,
    directDamage() {},
    checkDefeat() { events.push("check-defeat"); },
    checkEnd() { events.push("check-end"); },
  };
  window.BakarSkills = { tickBurning() { events.push("burning"); } };
  window.EnemySkills = {
    tickPoison(currentState) {
      events.push("poison");
      currentState.battle.locked = true;
    },
    prepare(currentState, currentUnit) {
      events.push("enemy-prepare");
      currentState.battle.enemyPrepareUnitUid = currentUnit.uid;
      currentState.battle.enemyPrepareStep = 4;
      currentState.battle.enemyPrepareHandled = true;
      return true;
    },
  };
  window.AngelicaLukaSkills = { beginTurn() { events.push("angelica"); } };
  window.NonokaLokiSkills = { beginTurn() { events.push("nonoka"); } };
  window.GuestCharacterSkills = { beginTurn() { events.push("guest"); } };
  window.BertisGerlotSkills = { beginTurn() { events.push("bertis"); } };
  const sequence = window.BattlePrepareSequence({
    combat,
    draw() {},
    intentMax: () => 3,
    nextAnim: () => 1,
    record() { events.push("record"); },
    relicPrepare() { events.push("relic"); },
  });

  assert.strictEqual(sequence.resolve(state, unit), false, "preparation must pause when Poison opens a prompt");
  assert.strictEqual(state.battle.prepareStep, 2, "preparation must retain the next unfinished step");
  assert.deepStrictEqual(events, ["record", "burning", "poison", "check-defeat", "check-end"],
    "preparation must stop immediately after the locking status effect");

  state.battle.locked = false;
  assert.strictEqual(sequence.resolve(state, unit), true, "preparation must resume after the prompt resolves");
  assert.deepStrictEqual(events, [
    "record", "burning", "poison", "check-defeat", "check-end",
    "enemy-prepare", "relic", "angelica", "nonoka", "guest", "bertis", "check-defeat", "check-end",
  ], "resumed preparation must continue every later hook without repeating earlier status ticks");
  assert.strictEqual(state.battle.prepareUnitUid, undefined, "completed preparation must clear its unit cursor");
  assert.strictEqual(state.battle.prepareStep, undefined, "completed preparation must clear its step cursor");
  assert.strictEqual(state.battle.enemyPrepareUnitUid, undefined,
    "completed preparation must clear the nested enemy preparation cursor");
  assert.strictEqual(state.battle.enemyPrepareStep, undefined,
    "completed preparation must clear the nested enemy preparation step");
  assert.strictEqual(state.battle.enemyPrepareHandled, undefined,
    "completed preparation must clear the nested enemy preparation marker");

  Object.assign(window, saved);
}

module.exports = { runBattlePrepareResume };
