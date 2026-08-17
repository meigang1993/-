const fs = require("fs");
const vm = require("vm");

global.window = global;
require("../src/original/game-random.js");

const timers = new Map();
let nextTimer = 1;
let renders = 0;
const originalSetTimeout = global.setTimeout;
const originalClearTimeout = global.clearTimeout;
global.setTimeout = callback => {
  const id = nextTimer++;
  timers.set(id, callback);
  return id;
};
global.clearTimeout = id => timers.delete(id);

function load(file) {
  vm.runInThisContext(fs.readFileSync(file, "utf8"), { filename: file });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function flushTimers() {
  while (timers.size) {
    const callbacks = [...timers.values()];
    timers.clear();
    callbacks.forEach(callback => callback());
  }
}

window.render = () => { renders += 1; };
window.BattleLog = { add() {} };
window.BattleLines = { skill() {} };
window.GuestCharacterSkills = { visibleHandCount: unit => unit.hand.length };
load("src/original/ui-common-skill-model.js");
load("src/original/ui-common-skill-view.js");
load("src/original/ui-common-skills.js");
window.UICommon = window.UICommonSkills({
  esc: value => String(value),
  classToken: value => String(value),
});

load("src/original/battle-card-animation-events.js");
load("src/original/battle-cards-system.js");
load("src/original/battle-draw-feedback.js");
load("src/original/card-utils.js");
load("src/original/battle-status-card-registry.js");
load("src/original/battle-status-cards.js");
load("src/original/battle-card-tactics.js");
load("src/original/miller-skills.js");
load("src/original/gerda-skills.js");
load("src/original/battle-turn-state.js");
load("src/original/battle-prepare-prompts.js");

window.BattleCombatVisuals = () => ({
  holdVisual() {},
  visualOf() {},
  pushFloat() {},
  queueSlashText() {},
  queueSlashPlay() {},
  pendingFatalAnim: () => false,
});
window.BattleCombatTargeting = () => ({
  sameSideUnits: () => [],
  comboPartner() {},
  clearSelection() {},
  canPlay: () => true,
  selectCard() {},
  selectSkill() {},
  selectExtract() {},
  selectMimic() {},
  selectPrepareSkill() {},
  chooseTarget() {},
  cancelSelection() {},
  playSelectedCard() {},
  playActiveCard() {},
});
window.BattleCardSpecials = () => ({});
window.BattleDamage = () => ({
  damage() {},
  directDamage() {},
  resolveThunderHammer() {},
  cancelThunderHammer() {},
  resolveManualDodge() {},
});
window.BattleCombatResolver = () => ({
  continueAfterCounter() {},
  slashTargetAmount() {},
});
window.BattleCombatResponses = () => ({
  resolveHandReveal() {},
  continueAfterCadicisResponsibility() {},
  resolveManualCounter() {},
});
load("src/original/battle-card-cleanup.js");
load("src/original/battle-card-resume-state.js");
load("src/original/battle-card-resume-hooks.js");
load("src/original/battle-card-resume-flow.js");
load("src/original/battle-card-resume.js");
load("src/original/character-skill-access.js");
load("src/original/battle-combat.js");

const combat = window.BattleCombat({
  draw(unit, count) { unit.hand.push(...Array.from({ length: count }, () => ({ name: "测试摸牌" }))); },
  isKillCard: () => false,
  finishBattle() {},
  nextAnim: () => 1,
});

function cleanup() {
  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
}

module.exports = {
  assert,
  BattleCards: window.BattleCards,
  BattleCardTactics: window.BattleCardTactics,
  BattlePreparePrompts: window.BattlePreparePrompts,
  BattleTurnState: window.BattleTurnState,
  cleanup,
  combat,
  flushTimers,
  GerdaSkills: window.GerdaSkills,
  getRenders: () => renders,
  MillerSkills: window.MillerSkills,
};
