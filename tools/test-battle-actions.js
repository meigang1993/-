const enemy = require("./battle-actions-enemy-tests");
const guard = require("./battle-actions-guard-tests");

(async () => {
  await enemy.testDimensionTransferSettlement();
  await enemy.testDimensionTransferCheckpointTiming();
  await enemy.testDimensionTransferContinuationFailure();
  await enemy.testStaleEnemyTasks();
  await enemy.testCounterReactionContinuations();
  await enemy.testEnemyTaskGuards();
  await guard.testManualContinuationReplacement();
  await guard.testDimensionTransferReplacement();
  await guard.testActionGenerationLocks();
  await guard.testQueuedPromptWaitsForEffects();
  console.log("Battle action recovery tests passed");
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
