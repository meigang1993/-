const assert = require("assert");
const { record, verify, probeRandom } = require("./battle-replay-harness");

// Full-battle replay: a fixed seed must reproduce an identical setup (phase=4)
// AND an identical full-battle outcome (HP / MVP / performance / random cursor),
// catching cross-round regressions in AI, damage, status, and settlement.
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
  // Setup digest (phase=4 deck/hand/state).
  assert.strictEqual(result.setupDigest, replay.setupDigest);
  assert.ok(result.setupRandomCalls > 0, "replay should capture setup random calls");
  // Final digest (full battle outcome: HP, performance, MVP ranking).
  assert.strictEqual(result.finalDigest, replay.finalDigest);
  // The mock runtime never drives enemy AI decisions, so a full battle may
  // legitimately consume zero randomness after setup (all setup consumption
  // comes from deck shuffling). "Battle consumed randomness" is therefore NOT
  // a valid liveness guarantee — use the action count instead, and verify the
  // seeded-random mechanism directly via probeRandom below.
  assert.ok(replay.play.actions > 0, "auto-play should actually run battle actions");
  assert.strictEqual(result.outcome, "win", "auto-play should resolve the battle to a win");
  // Seeded-random mechanism: enemy target selection must consume the seeded
  // stream and reproduce the same choice for the same seed.
  const probe = probeRandom(input.seed);
  assert.strictEqual(probe.consumed, 1, "AI target selection should consume exactly 1 seeded random call");
  assert.strictEqual(probe.first, probe.repeat, "same seed must select the same target");
  // Tamper detection: any divergence (setup or final) must reject.
  const damagedSetup = { ...replay, setupDigest: "0".repeat(64) };
  await assert.rejects(() => verify(damagedSetup), /setup diverged/);
  const damagedFinal = { ...replay, finalDigest: "0".repeat(64) };
  await assert.rejects(() => verify(damagedFinal), /final diverged/);
  console.log(`Battle replay passed: setup ${result.setupRandomCalls} + final ${result.finalRandomCalls} deterministic calls, outcome=${result.outcome}`);
})().catch(error => {
  console.error(error.message);
  process.exit(1);
});
