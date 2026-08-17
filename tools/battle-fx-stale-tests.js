const {
  assert, BattleFX, flushTimers, getAppended, setArtAvailable,
} = require("./battle-fx-test-harness");

function testStaleFeedbackTasks() {
  const oldState = {
    battle: {
      floats: [{ id: "old-float", uid: "a0", kind: "heal", value: 2, seq: 0, delay: 50 }],
    },
  };
  global.state = oldState;
  BattleFX.popFloats(oldState);
  BattleFX.cancel(oldState);
  global.state = { battle: { floats: [] } };
  setArtAvailable(true);
  flushTimers();
  assert(getAppended() === 0, "delayed floats from a replaced battle must not render on matching unit ids");

  setArtAvailable(false);
  const oldSlashState = { battle: { hitFxId: 7, lastHitUid: "a0" } };
  global.state = oldSlashState;
  BattleFX.slashHit(oldSlashState);
  BattleFX.cancel(oldSlashState);
  global.state = { battle: { hitFxId: 7, lastHitUid: "a0" } };
  setArtAvailable(true);
  flushTimers();
  assert(getAppended() === 0, "slash retries from a replaced battle must not render in the new battle");

  setArtAvailable(false);
  const reusedState = {
    battle: {
      floats: [{ id: "same-state-float", uid: "a0", kind: "heal", value: 3, seq: 0, delay: 50 }],
    },
  };
  global.state = reusedState;
  BattleFX.popFloats(reusedState);
  reusedState.battle = { floats: [] };
  setArtAvailable(true);
  flushTimers();
  assert(getAppended() === 0, "delayed floats from an ended battle must not render after the same save starts another battle");

  const currentState = {
    battle: {
      floats: [{ id: "current-float", uid: "a0", kind: "heal", value: 4, seq: 0, delay: 50 }],
    },
  };
  global.state = currentState;
  BattleFX.popFloats(currentState);
  flushTimers();
  assert(getAppended() === 1, "delayed floats must still render for the current battle");
  BattleFX.cancel(currentState);
}

function testLeaveCleanup() {
  const calls = [];
  const previous = {
    BattleLines: global.BattleLines,
    BattleEffects: global.BattleEffects,
    BattleActionGuard: global.BattleActionGuard,
    NonokaIdolSkinFX: global.NonokaIdolSkinFX,
    MannyGunSkinFX: global.MannyGunSkinFX,
    BertisQueenSkinFX: global.BertisQueenSkinFX,
    CharacterSkinFX: global.CharacterSkinFX,
  };
  global.BattleLines = { cancel: () => calls.push("lines") };
  global.BattleEffects = { cancel: () => calls.push("effects") };
  global.BattleActionGuard = {
    discardQueued: () => calls.push("queued"),
    reset: () => calls.push("reset"),
  };
  global.NonokaIdolSkinFX = { cancel: () => calls.push("nonoka") };
  global.MannyGunSkinFX = { cancel: () => calls.push("manny") };
  global.BertisQueenSkinFX = { cancel: () => calls.push("bertis") };
  global.CharacterSkinFX = { cancel: () => calls.push("character") };
  const state = {
    battle: { animQueue: [], testRecoveryTimer: 7 },
    infoUnit: "a0",
    infoTab: "skills",
  };
  global.state = state;
  BattleFX.leave(state);
  assert(calls.join(",") === "lines,effects,nonoka,manny,bertis,character,queued",
    "leaving battle must cancel visuals and discard queued actions without resetting its owner");
  assert(state.infoUnit === null && state.infoTab === "stats",
    "leaving battle must clear stale character detail state");
  Object.assign(global, previous);
}

module.exports = { testStaleFeedbackTasks, testLeaveCleanup };
