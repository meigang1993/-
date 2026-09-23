const tests = require("./character-progression-tests");

(async () => {
  tests.testGrowthProfiles();
  tests.testExperienceGrant();
  tests.testMigration();
  await tests.testSettlementExperience();
  console.log("Character progression tests passed: growth, experience, migration, and receipts");
})().catch(error => {
  console.error(error.stack);
  process.exit(1);
});
