global.window = global;

let releasePlay;
let settlementError = null;
let playFailure = null;
window.BattleEffectUtils = {
  center() {},
  selectedCard() {},
  targetArt() {},
  wait: () => Promise.resolve(),
  setLine() {},
  setLines() {},
  setComboLines() {},
  flashComboPartner() {},
  hideLine() {},
};
window.BattleEffectHandlers = { clearVisuals() {} };
window.BattleEffectPlay = {
  async playCard(state, commit, setAnimating, resolveIdle, setRenderFrozen, active) {
    setAnimating(true);
    await new Promise(resolve => { releasePlay = resolve; });
    try {
      if (playFailure) throw playFailure;
      if (!active()) return false;
      return commit();
    } finally {
      setAnimating(false);
      resolveIdle();
    }
  },
};
window.BattleSystem = {
  shiftAnim(battle) { return battle.animQueue.shift(); },
  settlePending() {
    if (settlementError) throw settlementError;
    return false;
  },
};
window.BattleFX = {
  slashHit() {}, popFloats() {}, hasDamageEffect: () => true,
  clearBumps() {}, judgeResult() {}, beep() {}, cardMove() {}, cardLand() {},
};
global.document = {
  querySelectorAll() { return []; },
  querySelector() { return null; },
  createElement() {
    const inner = { style: {} };
    return {
      className: "",
      dataset: {},
      style: {},
      classList: { add() {}, remove() {} },
      querySelector(selector) {
        return selector === ".card-flight-inner" ? inner : null;
      },
      remove() {},
    };
  },
  body: { appendChild() {}, classList: { remove() {} } },
};
global.requestAnimationFrame = callback => callback();

require("../src/original/battle-effect-event-runner.js");
require("../src/original/battle-effect-drain-recovery.js");
require("../src/original/battle-effect-drain.js");
require("../src/original/battle-effects.js");
require("../src/original/battle-session-settlement.js");
require("../src/original/battle-session.js");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
async function stateAfterTick(promise) {
  return Promise.race([
    promise.then(() => "resolved"),
    new Promise(resolve => setTimeout(() => resolve("waiting"), 10)),
  ]);
}

module.exports = {
  assert,
  releasePlay: () => releasePlay(),
  setPlayFailure: value => { playFailure = value; },
  setSettlementError: value => { settlementError = value; },
  stateAfterTick,
};
