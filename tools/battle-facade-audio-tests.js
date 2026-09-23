const assert = require("assert");

function testBattleAudioFacade() {
  require("../src/original/game-random.js");
  const audioCalls = [];
  window.BattleAudio = {
    beep: delay => audioCalls.push(["beep", delay]),
    cardMove: delay => audioCalls.push(["cardMove", delay]),
    cardLand: delay => audioCalls.push(["cardLand", delay]),
    burn: () => audioCalls.push(["burn"]),
    unlockAudio: () => audioCalls.push(["unlockAudio"]),
    playBattleStart: done => { audioCalls.push(["playBattleStart"]); done?.(); },
    judgeResult: success => audioCalls.push(["judgeResult", success]),
    floatSfx: kind => audioCalls.push(["floatSfx", kind]),
    cancel: () => audioCalls.push(["cancel"]),
  };
  let damageFxCancelled = 0;
  window.BattleDamageFX = { cancel() { damageFxCancelled += 1; } };
  global.document = {
    querySelector() { return null; },
    querySelectorAll() { return []; },
  };

  require("../src/original/battle-fx.js");

  let battleStarted = 0;
  window.BattleFX.beep(10);
  window.BattleFX.cardMove(20);
  window.BattleFX.cardLand(30);
  window.BattleFX.burn();
  window.BattleFX.unlockAudio();
  window.BattleFX.playBattleStart(() => { battleStarted += 1; });
  window.BattleFX.judgeResult(true);
  window.BattleFX.floatSfx("damage");
  window.BattleFX.cancel();

  assert.deepStrictEqual(audioCalls, [
    ["beep", 10], ["cardMove", 20], ["cardLand", 30], ["burn"],
    ["unlockAudio"], ["playBattleStart"], ["judgeResult", true],
    ["floatSfx", "damage"], ["cancel"],
  ]);
  assert.strictEqual(battleStarted, 1);
  assert.strictEqual(damageFxCancelled, 1);
}

module.exports = { testBattleAudioFacade };
