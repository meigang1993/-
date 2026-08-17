const {
  assert, BattleTurnState, combat, flushTimers, getRenders, MillerSkills,
} = require("./battle-runtime-test-harness");

function testTurnAndMillerTimers() {
  const actor = { uid: "a0", name: "测试角色", side: "ally", hand: [], stats: { handLimit: 5 }, skills: [] };
  const turnBattle = { played: [{ name: "杀", _playedByName: actor.name }], shownPlayed: [{ name: "闪" }], animQueue: [], mimicLinks: [], thinkingUid: "a0", millerSlot: {}, turn: 2, combo: 3 };
  BattleTurnState.cleanupTurn(turnBattle, null, false, [actor]);
  assert(turnBattle.played.length === 0, "turn cleanup must clear the public played-card trail");
  assert(turnBattle.shownPlayed.length === 0, "turn cleanup must clear transient shown cards");
  assert(turnBattle.animQueue[0]?.type === "trailExit", "turn cleanup must animate public cards into their pile");
  assert(turnBattle.animQueue[0]?.entries[0]?.pile === "discard",
    "turn cleanup must preserve the recorded destination pile");

  const consumedBattle = { played: [{ name: "消耗牌", type: "response", _playedByName: actor.name, _destinationPile: "consumed", _destinationSide: "ally" }], shownPlayed: [], animQueue: [], mimicLinks: [], turn: 1 };
  BattleTurnState.cleanupTurn(consumedBattle, null, false, [actor]);
  assert(consumedBattle.animQueue[0]?.entries[0]?.pile === "consumed",
    "turn cleanup must route consumed public cards to the consumed pile");

  const settledBattle = { played: [{ name: "组合进攻", comboAttack: true, _destinationSettled: true }], shownPlayed: [], animQueue: [], mimicLinks: [], turn: 1 };
  BattleTurnState.cleanupTurn(settledBattle, null, false, [actor]);
  assert(settledBattle.animQueue.length === 0,
    "turn cleanup must not animate a consumed combo card whose destination already settled");

  const millerState = { battle: {} };
  const millerBattle = millerState.battle;
  const miller = { uid: "a0", name: "米勒", hand: [], stats: { handLimit: 5 }, skills: [] };
  global.state = millerState;
  assert(MillerSkills.handleSpecialCard(millerState, miller, miller, { millerSlot: true }, { draw() {} }), "slot skill should activate");
  millerState.battle = {};
  flushTimers();
  assert(getRenders() === 0, "an ended battle's slot timer must not rerender the replacement battle");
  assert(millerBattle.millerSlot, "a stale slot timer must not mutate its detached battle");

  const currentMillerState = { battle: {} };
  global.state = currentMillerState;
  assert(MillerSkills.handleSpecialCard(currentMillerState, { ...miller, usedMillerSlot: false }, miller, { millerSlot: true }, { draw() {} }), "current slot skill should activate");
  flushTimers();
  assert(currentMillerState.battle.millerSlot === null, "the current battle's slot timer should close its popup");
  assert(getRenders() === 1, "the current battle's slot timer should rerender once");
}

function testRecoveryTimers() {
  window.SakuraRisaSkills = { pendingRevival: unit => !!unit?.risaRevivePending };
  const pendingRevivalState = {
    battle: {
      test: false,
      allies: [{ uid: "risa-ally", hp: 0, maxHp: 10, hand: [{}], risaRevivePending: true }],
      enemies: [{ uid: "enemy", hp: 1, hand: [] }],
    },
  };
  assert(!combat.checkDefeat(pendingRevivalState), "pending Risa revival must prevent an allied full-party defeat");
  assert(!pendingRevivalState.battle.pendingDefeat && !pendingRevivalState.battle.failedTriggered, "pending Risa revival must not enter defeat settlement");

  const recoveryState = {
    battle: {
      test: true,
      allies: [{ uid: "a0", hp: 0, maxHp: 10, block: 2, hand: [] }],
      enemies: [],
    },
  };
  const recoveryBattle = recoveryState.battle;
  global.state = recoveryState;
  combat.checkDefeat(recoveryState);
  assert(recoveryBattle.testRecovery, "test defeat should start the recovery notice");
  recoveryState.battle = { test: true, allies: [], enemies: [] };
  flushTimers();
  assert(getRenders() === 1, "an ended test battle's recovery timer must not rerender the replacement battle");
  assert(recoveryBattle.testRecovery, "a stale recovery timer must not mutate its detached battle");

  const currentRecoveryState = {
    battle: {
      test: true,
      allies: [{ uid: "a1", hp: 0, maxHp: 12, block: 3, hand: [] }],
      enemies: [],
    },
  };
  global.state = currentRecoveryState;
  combat.checkDefeat(currentRecoveryState);
  flushTimers();
  assert(currentRecoveryState.battle.testRecovery === false, "the current test battle's recovery notice should expire");
  assert(getRenders() === 2, "the current test battle's recovery timer should rerender once");
}

function testMillerSlotOdds() {
  const originalValue = window.GameRandom.value;
  const originalSample = window.GameRandom.sample;
  const originalShuffle = window.GameRandom.shuffle;
  function drawCount(roll) {
    const state = { battle: {} };
    const actor = { uid: "miller", name: "米勒", hand: [], stats: { handLimit: 4 } };
    let samples = 0, count = 0;
    window.GameRandom.value = () => roll;
    window.GameRandom.sample = () => samples++ === 0 ? "A" : "B";
    window.GameRandom.shuffle = values => values;
    MillerSkills.handleSpecialCard(
      state, actor, actor, { millerSlot: true },
      { draw(_unit, amount) { count = amount; } }
    );
    state.battle = {};
    return count;
  }
  try {
    assert(drawCount(.079999) === 8, "Miller jackpot chance must end below 8%");
    assert(drawCount(.08) === 4, "Miller pair chance must begin at 8%");
    assert(drawCount(.399999) === 4, "Miller pair chance must end below 40%");
    assert(drawCount(.40) === 1, "Miller all-different chance must begin at 40%");
  } finally {
    window.GameRandom.value = originalValue;
    window.GameRandom.sample = originalSample;
    window.GameRandom.shuffle = originalShuffle;
  }
}

module.exports = {
  testMillerSlotOdds, testRecoveryTimers, testTurnAndMillerTimers,
};
