const harness = require("./battle-runtime-test-harness");
const cards = require("./battle-runtime-card-tests");
const timers = require("./battle-runtime-timer-tests");
const trails = require("./battle-runtime-trail-tests");

try {
  cards.testCardMovementAndPayments();
  cards.testRecklessResponse();
  cards.testForgedCharacterSkillsFailClosed();
  timers.testTurnAndMillerTimers();
  trails.testSpecialCardTrails();
  timers.testRecoveryTimers();
  timers.testMillerSlotOdds();
  cards.testCadicisResumeUsesSharedAttackValues();
  console.log("Battle runtime generation tests passed");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  harness.cleanup();
}
