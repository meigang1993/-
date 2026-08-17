const {
  assert,
  BattleActionGuard,
  BattleEffects,
  BattleManualFlow,
  BattleSystem,
  tryDimensionTransfer,
} = require("./battle-actions-test-harness");

async function testManualContinuationReplacement() {
  let manualWaits = 0;
  let comboResumes = 0;
  let greenResumes = 0;
  let finishedTurns = 0;
  const manualState = { battle: { locked: false, phase: 4, activeUid: "a0", allies: [{ uid: "a0", side: "ally" }], enemies: [], comboAttackResume: {}, greenGatlingResume: { actorUid: "a0", targetUid: "e0" } } };
  global.state = manualState;
  const manualFlow = BattleManualFlow({
    active: battle => battle.allies[0],
    allUnits: battle => battle.allies.concat(battle.enemies),
    combat: { resumeComboAttack() { comboResumes += 1; }, resumeGreenGatling() { greenResumes += 1; }, checkEnd() {} },
    finishTurn() { finishedTurns += 1; },
    advanceToInput: async () => {},
    runEnemyPlayPhase: async () => true,
    waitEffects: async () => { manualWaits += 1; if (manualWaits === 1) global.state = { battle: null }; },
  });
  await manualFlow.resumeAfterManualResponse(manualState);
  assert(comboResumes === 1, "current combo continuation should begin normally");
  assert(greenResumes === 0 && finishedTurns === 0, "state replacement during a manual continuation must stop later battle steps");
}

async function testDimensionTransferReplacement() {
  let staleEnemyEndPlays = 0;
  const dimensionState = { battle: { dimensionTransfer: {}, enemies: [{ uid: "dimension-enemy", hp: 1 }] } };
  global.state = dimensionState;
  BattleSystem.active = () => ({ side: "enemy" });
  BattleSystem.endPlay = async () => { staleEnemyEndPlays += 1; };
  BattleEffects.whenIdle = async () => { global.state = { battle: { locked: false } }; };
  await tryDimensionTransfer("dimension-enemy");
  assert(staleEnemyEndPlays === 0, "dimension transfer must not end a turn in a replacement battle");
}

async function testActionGenerationLocks() {
  let releaseOldAction;
  let releaseNewAction;
  const control = { isConnected: true, dataset: {}, style: {}, tagName: "BUTTON", disabled: false };
  const oldAction = BattleActionGuard.run("old", () => new Promise(resolve => { releaseOldAction = resolve; }), { control });
  BattleActionGuard.reset();
  assert(control.dataset.locked !== "1", "reset should release controls held by the old generation");
  const newAction = BattleActionGuard.run("new", () => new Promise(resolve => { releaseNewAction = resolve; }), { control });
  releaseOldAction(true);
  await oldAction;
  assert(control.dataset.locked === "1", "old action cleanup must not unlock a control reused by the new generation");
  const overlapping = await BattleActionGuard.run("overlap", async () => true);
  assert(overlapping === false, "finishing an old action must not release the new generation lock");
  releaseNewAction(true);
  await newAction;
  assert(control.dataset.locked !== "1", "new generation should unlock its control after completion");
  assert(await BattleActionGuard.run("after", async () => true), "new generation lock should release after its own action finishes");

  let rejectOldAction;
  let staleRecoveries = 0;
  global.battleActionError = () => { staleRecoveries += 1; };
  const failingOldAction = BattleActionGuard.run("stale failure", () => new Promise((resolve, reject) => { rejectOldAction = reject; }));
  BattleActionGuard.reset();
  rejectOldAction(new Error("old action failed"));
  await failingOldAction;
  assert(staleRecoveries === 0, "stale action errors must not recover or modify the replacement battle");

  let releaseStagedAction;
  let stagedReady = false;
  const stagedAction = BattleActionGuard.run("staged", () => new Promise(resolve => { releaseStagedAction = resolve; }));
  const idle = BattleActionGuard.whenIdle().then(() => { stagedReady = true; });
  await Promise.resolve();
  assert(!stagedReady, "staged follow-up input must wait for the current action to finish");
  releaseStagedAction(true);
  await stagedAction;
  await idle;
  assert(stagedReady, "staged follow-up input must resume when the current action releases");
}

module.exports = {
  testActionGenerationLocks,
  testDimensionTransferReplacement,
  testManualContinuationReplacement,
};
