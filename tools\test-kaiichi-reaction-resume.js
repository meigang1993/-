const { runKaiichiTeamPursuit } = require("./kaiichi-team-pursuit");
const { runKaiichiMultihitResume } = require("./kaiichi-multihit-resume");

async function main() {
  runKaiichiTeamPursuit();
  await runKaiichiMultihitResume();
  console.log("Kaiichi reaction resume regression passed");
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
