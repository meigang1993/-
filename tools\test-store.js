require("./store-test-env");

const runMainBasicTests = require("./store-main-basic-tests");
const runSettingsTests = require("./store-settings-tests");
const runSlotTests = require("./store-slot-tests");
const runValidationTests = require("./store-validation-tests");
const runDirectKvTests = require("./store-direct-kv-tests");
const runOfflineTests = require("./store-offline-tests");
const runLifecycleTests = require("./store-lifecycle-tests");

(async () => {
  const state = await runMainBasicTests();
  await runSettingsTests();
  await runSlotTests(state);
  const validLocal = await runValidationTests();
  await runDirectKvTests(validLocal);
  await runOfflineTests(state);
  await runLifecycleTests();
  console.log("GameStore tests passed");
})().catch(err => {
  console.error(err.stack || err.message);
  process.exit(1);
});
