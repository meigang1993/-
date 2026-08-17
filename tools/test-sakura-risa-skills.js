const { runSakuraRisaContracts } = require("./sakura-risa-contracts");
const { runSakuraRisaIntegration } = require("./sakura-risa-integration");

async function main() {
  const context = runSakuraRisaContracts();
  await runSakuraRisaIntegration(context);
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
