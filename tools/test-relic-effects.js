const cards = require("./relic-effects-card-tests");
const defense = require("./relic-effects-defense-tests");
const harness = require("./relic-effects-test-harness");
const triggers = require("./relic-effects-trigger-tests");

harness.auditRelicReferences();
cards.testActiveRelicConversions();
cards.testTeamHealingTriggers();
cards.testInvalidatedSlashTracking();
triggers.testScytheTurns();
triggers.testGreenGatlingQueue();
triggers.testKrowRecordGuards();
defense.testScissorBlade();
defense.testSamuraiArmor();
defense.testWhiteGothicLolita();
console.log("All relic runtime audit tests passed");
