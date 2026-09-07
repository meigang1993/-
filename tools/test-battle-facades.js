const { testBattleAudioFacade } = require("./battle-facade-audio-tests");
const { testCardInteractions } = require("./battle-facade-card-interaction-tests");
const { testActiveRelicMethods } = require("./battle-facade-relic-tests");

testActiveRelicMethods();
testCardInteractions();
testBattleAudioFacade();
console.log("Battle facade contract tests passed");
