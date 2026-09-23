const { difficultyIds, missionIds } = require("./dungeon-matrix-harness");
const {
  completeRun, testEmptyRewardRejection, testRewardPayloadRecovery,
} = require("./dungeon-matrix-settlement");
const { testConfiguration, testUnlockGates } = require("./dungeon-matrix-unlocks");

(async () => {
  testConfiguration();
  await testUnlockGates();
  await testRewardPayloadRecovery();
  await testEmptyRewardRejection();
  let seed = 2971485;
  const samples = 4;
  for (const missionId of missionIds) {
    for (const difficultyId of difficultyIds) {
      for (let sample = 0; sample < samples; sample++) {
        await completeRun(missionId, difficultyId, seed++);
      }
    }
  }
  console.log(`Dungeon matrix passed: 3 missions x 5 difficulties x ${samples} seeds; every node entered and settled`);
})().catch(error => {
  console.error(error.stack);
  process.exit(1);
});
