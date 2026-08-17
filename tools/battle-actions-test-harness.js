const fs = require("fs");
const vm = require("vm");

global.window = global;
global.battleActionError = () => {};
global.state = {
  battle: {
    dimensionTransfer: {},
    enemies: [{ uid: "enemy", hp: 1 }],
  },
};
global.render = () => {};
global.persist = () => {};
global.lockControl = control => {
  if (control.dataset.locked === "1") return false;
  control.dataset.locked = "1";
  control.style.pointerEvents = "none";
  if (control.tagName === "BUTTON") control.disabled = true;
  return true;
};
global.BattleEffects = {
  animating: false,
  whenIdle: async () => {},
  settlementBlocked: () => false,
};

let directSettlementCalls = 0;
global.BattleSystem = {
  active: () => ({ side: "ally" }),
  async resolveDimensionTransfer(_state, _uid, onStep) { onStep?.(); await global.BattleEffects.whenIdle(); return true; },
  settlePending() { directSettlementCalls += 1; },
};

[
  "battle-prepare-actions.js",
  "battle-action-share-selection.js",
  "battle-action-selection.js",
  "battle-action-hand-bindings.js",
  "battle-action-prompt-bindings.js",
  "battle-action-target-bindings.js",
  "battle-action-special-bindings.js",
  "battle-actions.js",
  "battle-enemy-turn.js",
  "battle-action-guard.js",
  "battle-manual-flow.js",
  "battle-resolution-actions.js",
].forEach(file => vm.runInThisContext(fs.readFileSync(`src/original/${file}`, "utf8")));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

module.exports = {
  assert,
  BattleActionGuard: window.BattleActionGuard,
  BattleEffects: global.BattleEffects,
  BattleEnemyTurn: window.BattleEnemyTurn,
  BattleManualFlow: window.BattleManualFlow,
  BattleResolutionActions: window.BattleResolutionActions,
  BattleSystem: global.BattleSystem,
  getDirectSettlementCalls: () => directSettlementCalls,
  tryDimensionTransfer: global.tryDimensionTransfer,
};
