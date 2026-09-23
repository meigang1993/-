const {
  assert, contracts,
} = require("./relic-contract-harness");

require("./relic-contracts/group-1");
require("./relic-contracts/group-2");
require("./relic-contracts/group-3");
require("./relic-contracts/group-4");

(async () => {
  const allRelics = Object.keys({ ...GameDataRelics, ...GameDataFutureRelics });
  assert.strictEqual(allRelics.length, 30);
  assert.deepStrictEqual(
    [...contracts.keys()].sort(),
    allRelics.sort(),
    "every relic must have an explicit behavior contract"
  );
  for (const name of allRelics) {
    try {
      await contracts.get(name)();
    } catch (error) {
      error.message = `${name}: ${error.message}`;
      throw error;
    }
  }
  console.log(`All relic contracts passed: ${allRelics.length}/30`);
})().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
