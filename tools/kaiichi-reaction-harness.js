const assert = require("assert");
const { combat, card, unit, scenario } = require("./pursue-kill-fixtures");

require("../src/original/green-hat.js");
require("../src/original/nanali-sealed.js");
require("../src/original/elrana-healing-skills.js");
require("../src/original/ace-skills.js");
require("../src/original/nanali-skills.js");
require("../src/original/ace-nanali-skills.js");
require("../src/original/elrana-ace-nanali-skills.js");
require("../src/original/hoshino-yi-skills.js");
require("../src/original/hoshino-kaiichi-share-queue.js");
require("../src/original/hoshino-kaiichi-share-resolution.js");
require("../src/original/hoshino-kaiichi-share.js");
require("../src/original/hoshino-kaiichi-skills.js");
require("../src/original/hoshino-skills.js");
require("../src/original/battle-manual-hit-resume.js");
require("../src/original/battle-manual-continuation.js");
require("../src/original/battle-manual-actions.js");
require("../src/original/battle-manual-flow.js");
require("../src/original/machine-factory-skills.js");
require("../src/original/enemy-status-effects.js");
require("../src/original/enemy-kill-hooks.js");
require("../src/original/enemy-damage-hooks.js");
require("../src/original/enemy-combat-hooks.js");
require("../src/original/enemy-tactical-skills.js");
require("../src/original/enemy-skills.js");

async function resumeKaiichiPrompt(state, battleCombat = combat) {
  const result = window.HoshinoSkills.resolveShare(state, null);
  assert(result.ok, "Half-Succubus Blood prompt must resolve");
  window.BattleReactionQueue.flush(state, battleCombat.damage);
  if (state.battle.locked) return;
  const flow = window.BattleManualFlow({
    active: battle => battle.allies.concat(battle.enemies).find(unit => unit.uid === battle.activeUid),
    allUnits: battle => battle.allies.concat(battle.enemies),
    combat: battleCombat,
    finishTurn() {},
    advanceToInput: async () => {},
    runEnemyPlayPhase: async () => false,
    waitEffects: async () => {},
  });
  await flow.resumeAfterManualResponse(state);
}

function trackedCombat(drawEvents) {
  let animationId = 0;
  return window.BattleCombat({
    active: battle => battle.allies[0],
    isKillCard: window.CardUtils.isKillCard,
    tempAttack: unit => (unit.stats?.attack || 0) + (unit.tempAttack || 0),
    draw: (target, count) => {
      drawEvents.push({ uid: target.uid, count });
      return [];
    },
    intentMax: () => 3,
    nextAnim: () => ++animationId,
    finishBattle() {},
  });
}

module.exports = {
  assert,
  combat,
  card,
  unit,
  scenario,
  resumeKaiichiPrompt,
  trackedCombat,
};
