const { runSakuraRisaCoreContracts } = require("./sakura-risa-core-contracts");
const { runSakuraRisaAdvancedContracts } = require("./sakura-risa-advanced-contracts");

function runSakuraRisaContracts() {
  const context = runSakuraRisaCoreContracts();
  return runSakuraRisaAdvancedContracts(context);
}

module.exports = { runSakuraRisaContracts };
