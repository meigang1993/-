const assert = require("assert");
const { record, verify } = require("./battle-replay-harness");

(async () => {
  const input = {
    seed: 1124,
    missionId: "machine_factory",
    enemyId: "mechanical_goblin",
    difficultyId: "normal",
    allyIds: ["lokar", "besta_doll"],
  };
  const replay = await record(input);
  const result = await verify(replay);
  assert.strictEqual(result.digest, replay.digest);
  assert.ok(result.randomCalls > 0, "replay should capture random calls");
  const damaged = { ...replay, digest: "0".repeat(64) };
  await assert.rejects(() => verify(damaged), /diverged/);
  console.log(`Battle replay passed: ${result.randomCalls} deterministic random calls`);
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
