const feedback = require("./battle-fx-feedback-tests");
const harness = require("./battle-fx-test-harness");
const stale = require("./battle-fx-stale-tests");

try {
  stale.testStaleFeedbackTasks();
  stale.testLeaveCleanup();
  feedback.testDamageFeedback();
  feedback.testUtilityFeedbackSounds();
  console.log("Battle FX generation tests passed");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  harness.cleanup();
}
