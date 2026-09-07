const {
  assert,
  BattleEnemyTurn,
  BattleManualFlow,
  BattleResolutionActions,
  getDirectSettlementCalls,
  tryDimensionTransfer,
} = require("./battle-actions-test-harness");

async function testDimensionTransferSettlement() {
  const originalResolve = global.BattleSystem.resolveDimensionTransfer;
  global.BattleSystem.resolveDimensionTransfer = () => false;
  assert(!await tryDimensionTransfer("enemy"), "dimension transfer must remain open until its selected cost is valid");
  global.BattleSystem.resolveDimensionTransfer = originalResolve;
  const handled = await tryDimensionTransfer("enemy");
  assert(handled, "dimension transfer should complete through BattleEffects");
  assert(getDirectSettlementCalls() === 0, "dimension transfer must not settle outside BattleEffects");
}

async function testDimensionTransferCheckpointTiming() {
  const originalResolve = global.BattleSystem.resolveDimensionTransfer;
  const originalRender = global.render;
  const originalPersist = global.persist;
  const originalState = global.state;
  const order = [];
  const ally = { uid: "ally-input", side: "ally", hp: 10 };
  const enemy = { uid: "enemy-acting", side: "enemy", hp: 10 };
  const state = {
    battle: {
      dimensionTransfer: {},
      activeUid: enemy.uid,
      phase: 4,
      locked: false,
      allies: [ally],
      enemies: [enemy],
    },
  };
  const resolution = BattleResolutionActions({
    active: battle => battle.allies.concat(battle.enemies)
      .find(unit => unit.uid === battle.activeUid),
    allUnits: battle => battle.allies.concat(battle.enemies),
    combat: {
      resolveDimensionTransfer() {
        order.push("resolve");
        return true;
      },
    },
    manualFlow: {
      async resumeInterruptedActions() { order.push("resume"); return true; },
      async continueAfterInterruptedActions() {
        order.push("continue");
        state.battle.activeUid = ally.uid;
      },
    },
    waitEffects: async () => {},
    isCurrentState: candidate => candidate === state,
  });
  global.state = state;
  global.render = () => order.push("render");
  global.persist = () => order.push("persist");
  global.BattleSystem.resolveDimensionTransfer = resolution.resolveDimensionTransfer;
  try {
    assert(await tryDimensionTransfer(enemy.uid), "dimension transfer should finish its enemy continuation");
    assert(order.indexOf("continue") < order.indexOf("persist"),
      "checkpoint persistence must wait for enemy continuation to reach allied input");
    assert(order.filter(item => item === "persist").length === 1,
      "completed dimension transfer should create one checkpoint request");
  } finally {
    global.BattleSystem.resolveDimensionTransfer = originalResolve;
    global.render = originalRender;
    global.persist = originalPersist;
    global.state = originalState;
  }
}

async function testDimensionTransferContinuationFailure() {
  const originalResolve = global.BattleSystem.resolveDimensionTransfer;
  const originalError = global.battleActionError;
  const originalPersist = global.persist;
  const originalState = global.state;
  let errors = 0;
  let persists = 0;
  const enemy = { uid: "enemy-failure", side: "enemy", hp: 10 };
  const state = {
    battle: {
      dimensionTransfer: {},
      activeUid: enemy.uid,
      phase: 4,
      locked: false,
      allies: [],
      enemies: [enemy],
    },
  };
  const resolution = BattleResolutionActions({
    active: battle => battle.enemies[0],
    allUnits: battle => battle.allies.concat(battle.enemies),
    combat: { resolveDimensionTransfer: () => true },
    manualFlow: {
      async resumeInterruptedActions() { return true; },
      async continueAfterInterruptedActions() {
        throw new Error("continuation failed");
      },
    },
    waitEffects: async () => {},
    isCurrentState: candidate => candidate === state,
  });
  global.state = state;
  global.battleActionError = () => { errors += 1; };
  global.persist = () => { persists += 1; };
  global.BattleSystem.resolveDimensionTransfer = resolution.resolveDimensionTransfer;
  try {
    assert(await tryDimensionTransfer(enemy.uid),
      "failed dimension transfer continuation should consume the prompt action");
    assert(errors === 1, "failed continuation should reach the battle action boundary");
    assert(persists === 0, "failed continuation must not persist an unstable checkpoint");
  } finally {
    global.BattleSystem.resolveDimensionTransfer = originalResolve;
    global.battleActionError = originalError;
    global.persist = originalPersist;
    global.state = originalState;
  }
}

async function testStaleEnemyTasks() {
  let releaseThink;
  let enemyActions = 0;
  const oldState = { battle: { activeUid: "e0", locked: false, thinkingUid: null } };
  const enemy = { uid: "e0", hp: 10 };
  global.state = oldState;
  const enemyTurn = BattleEnemyTurn({
    wait: () => new Promise(resolve => { releaseThink = resolve; }),
    waitEffects: async () => {},
    autoEnemy: async () => { enemyActions += 1; },
  });
  const thinking = enemyTurn.runEnemyPlayPhase(oldState, enemy, null, true);
  global.state = { battle: null };
  releaseThink();
  assert(await thinking === false, "replaced battle should stop an old enemy thinking task");
  assert(enemyActions === 0, "old enemy thinking task must not act after a state replacement");
  assert(oldState.battle.thinkingUid === null,
    "interrupted enemy thinking must clear its stale thinking marker");

  enemyActions = 0;
  const alreadyReplaced = { battle: { activeUid: "e0", locked: false, thinkingUid: "keep" } };
  global.state = { battle: null };
  assert(await enemyTurn.runEnemyPlayPhase(alreadyReplaced, enemy, null, false) === false, "already replaced enemy task should stop before changing old state");
  assert(alreadyReplaced.battle.thinkingUid === "keep" && enemyActions === 0, "stale enemy task must not start its play phase");

  let releaseInterruptedThink;
  enemyActions = 0;
  const interruptedState = { battle: { activeUid: "e0", locked: false, thinkingUid: null } };
  global.state = interruptedState;
  const interruptedTurn = BattleEnemyTurn({
    wait: () => new Promise(resolve => { releaseInterruptedThink = resolve; }),
    autoEnemy: async () => { enemyActions += 1; },
  });
  const originalThinking = interruptedTurn.runEnemyPlayPhase(interruptedState, enemy, null, true);
  interruptedState.battle.kaiichiShareQueue = [{ resumeEnemyUid: enemy.uid }];
  interruptedState.battle.kaiichiShareQueue = null;
  assert(await interruptedTurn.runEnemyPlayPhase(interruptedState, enemy, null, false),
    "resolved interruption should resume the current enemy");
  releaseInterruptedThink();
  assert(await originalThinking === false,
    "resuming an interrupted enemy must supersede its old thinking task");
  assert(enemyActions === 1,
    "an interrupted enemy must not act again when its old thinking delay finishes");

  let releaseAction;
  let activeActions = 0;
  let peakActions = 0;
  enemyActions = 0;
  const activeState = { battle: { activeUid: "e0", locked: false, thinkingUid: null } };
  global.state = activeState;
  const activeTurn = BattleEnemyTurn({
    wait: async () => {},
    autoEnemy: async () => {
      enemyActions += 1;
      activeActions += 1;
      peakActions = Math.max(peakActions, activeActions);
      await new Promise(resolve => { releaseAction = resolve; });
      activeActions -= 1;
    },
  });
  const activeTask = activeTurn.runEnemyPlayPhase(activeState, enemy);
  assert(releaseAction, "enemy action should enter its guarded asynchronous work");
  assert(await activeTurn.runEnemyPlayPhase(activeState, enemy) === false,
    "a second resume must not enter while the same battle is already acting");
  releaseAction();
  assert(await activeTask, "the original enemy action should retain turn ownership");
  assert(enemyActions === 1 && peakActions === 1,
    "enemy action ownership must prevent concurrent or duplicate auto play");

  let stepCalls = 0;
  const stepState = { battle: { activeUid: "e0", locked: false, thinkingUid: null } };
  global.state = stepState;
  const stepTurn = BattleEnemyTurn({
    wait: async () => {},
    autoEnemy: async () => {},
  });
  assert(await stepTurn.runEnemyPlayPhase(stepState, enemy, () => { stepCalls += 1; }, true),
    "a normal thinking enemy should complete its play phase");
  assert(stepCalls === 2,
    "enemy thinking should notify only once when thinking starts and once when it ends");
}

async function testCounterReactionContinuations() {
  const lethalCounters = ["终焉回旋斩", "复仇反击", "复仇之刃", "刺刀AK47", "弹反", "血色刺伞", "剑盾反攻", "电磁反制装置"];
  for (const counterName of lethalCounters) {
    const counteredEnemy = { uid: `countered-${counterName}`, hp: 5 };
    const counterState = { battle: { activeUid: counteredEnemy.uid, locked: false, thinkingUid: null } };
    global.state = counterState;
    const counterTurn = BattleEnemyTurn({
      wait: async () => {},
      waitEffects: async () => {},
      autoEnemy: async () => { counteredEnemy.hp = 0; },
    });
    assert(await counterTurn.runEnemyPlayPhase(counterState, counteredEnemy), `${counterName} lethal counter must allow enemy turn cleanup`);
  }

  for (const counterName of lethalCounters) {
    const interruptedEnemy = { uid: `blood-${counterName}`, side: "enemy", hp: 5 };
    const interruptedState = { battle: { activeUid: interruptedEnemy.uid, phase: 4, locked: false } };
    global.state = interruptedState;
    let continued = 0;
    const interruptedTurn = BattleEnemyTurn({
      wait: async () => {},
      autoEnemy: async () => {
        continued += 1;
        interruptedState.battle.kaiichiShareQueue = [{ resumeEnemyUid: interruptedEnemy.uid }];
      },
    });
    assert(!await interruptedTurn.runEnemyPlayPhase(interruptedState, interruptedEnemy), `${counterName} with Half-Succubus Blood pending must pause enemy turn cleanup`);
    assert(continued === 1, `${counterName} must stop enemy continuation as soon as a Half-Succubus Blood reaction is pending`);
  }

  const advancingEnemy = { uid: "advancing-countered", side: "enemy", hp: 5 };
  const advancingState = { battle: { activeUid: advancingEnemy.uid, phase: 4, locked: false, allies: [], enemies: [advancingEnemy, { uid: "enemy-next", side: "enemy", hp: 5 }] } };
  global.state = advancingState;
  let counterCleanup = 0;
  let counterEndChecks = 0;
  let counterAdvances = 0;
  const advancingTurn = BattleEnemyTurn({
    wait: async () => {},
    autoEnemy: async () => { advancingEnemy.hp = 0; },
  });
  const advancingFlow = BattleManualFlow({
    active: battle => battle.enemies.find(unit => unit.uid === battle.activeUid),
    allUnits: battle => battle.allies.concat(battle.enemies),
    combat: { checkEnd() { counterEndChecks += 1; } },
    finishTurn() { counterCleanup += 1; },
    advanceToInput: async () => { counterAdvances += 1; },
    runEnemyPlayPhase: advancingTurn.runEnemyPlayPhase,
    waitEffects: async () => {},
  });
  await advancingFlow.resumeAfterManualResponse(advancingState);
  assert(counterCleanup === 1, "lethal counter must finish the acting enemy turn");
  assert(counterEndChecks === 1 && counterAdvances === 1, "lethal counter must check settlement and advance to the next unit");
}

async function testEnemyTaskGuards() {
  const replacedEnemy = { uid: "replaced-active", hp: 5 };
  const replacedState = { battle: { activeUid: replacedEnemy.uid, locked: false, thinkingUid: null } };
  global.state = replacedState;
  const replacedTurn = BattleEnemyTurn({
    wait: async () => {},
    autoEnemy: async () => { replacedState.battle.activeUid = "new-active"; },
  });
  assert(await replacedTurn.runEnemyPlayPhase(replacedState, replacedEnemy) === false, "enemy task must not clean up a turn whose active unit changed");

  const settlingEnemy = { uid: "settling-enemy", hp: 5 };
  const settlingState = { battle: { activeUid: settlingEnemy.uid, locked: false, thinkingUid: null } };
  global.state = settlingState;
  const settlingTurn = BattleEnemyTurn({
    wait: async () => {},
    waitEffects: async () => {},
    autoEnemy: async () => {
      settlingEnemy.hp = 0;
      settlingState.battle.locked = true;
    },
  });
  assert(await settlingTurn.runEnemyPlayPhase(settlingState, settlingEnemy) === false, "settlement lock must keep control of a lethal counter victory");
}

module.exports = {
  testCounterReactionContinuations,
  testDimensionTransferContinuationFailure,
  testDimensionTransferCheckpointTiming,
  testDimensionTransferSettlement,
  testEnemyTaskGuards,
  testStaleEnemyTasks,
};
