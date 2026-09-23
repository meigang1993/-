const combat = require("./heroic-edis-combat-tests");
const copies = require("./heroic-edis-copy-tests");
const guard = require("./heroic-edis-guard-tests");
const harness = require("./heroic-edis-test-harness");
const heals = require("./heroic-edis-heal-tests");

harness.testConfiguration();
combat.testAiSequenceAndPursuits();
combat.testSetupCardPriority();
combat.testReturnedSlashRecalculation();
copies.testPassiveCopyResponse();
copies.testCopiedSlashResponseUses();
guard.testDeclinedDimensionTransferLifecycle();
guard.testOpheliaGuardPursuitResume();
heals.testSingleHealCounter();
heals.testGroupHealCounter();
console.log("Heroic Edis regression tests passed");
