const { runKaiichiCharacterCombos } = require("./kaiichi-character-combos");
const { runKaiichiGenericResume } = require("./kaiichi-generic-resume");
const { runKaiichiStatusDamage } = require("./kaiichi-status-damage");
const { runBattlePrepareResume } = require("./battle-prepare-resume");

async function runKaiichiMultihitResume() {
  await runKaiichiCharacterCombos();
  await runKaiichiGenericResume();
  await runKaiichiStatusDamage();
  runBattlePrepareResume();
  console.log("Kaiichi generic multi-hit and group resume regression passed");
}

module.exports = { runKaiichiMultihitResume };
