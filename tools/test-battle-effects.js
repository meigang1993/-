const opening = require("./battle-effects-opening-tests");
const recovery = require("./battle-effects-recovery-tests");
const response = require("./battle-effects-response-tests");

(async () => {
  await opening.run();
  await recovery.run();
  await response.run();
  console.log("Battle effect recovery tests passed");
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
