const { test, expect } = require("@playwright/test");
const { openOnlineGame } = require("./helpers/online-game");

test("battle core continuations stop after the action generation resets", async ({ page }) => {
  await openOnlineGame(page);
  const result = await page.evaluate(async () => {
    await window.GameBundles.load("battle");
    const originalState = window.state;
    const unit = { uid: "a1", side: "enemy", hp: 10 };
    const actionState = {
      battle: {
        allies: [unit], enemies: [], activeUid: unit.uid, phase: 4, locked: false,
      },
    };
    window.state = actionState;
    let releaseManual;
    let manualResumes = 0;
    const manualFlow = window.BattleManualFlow({
      active: battle => battle?.allies[0],
      allUnits: battle => [...(battle?.allies || []), ...(battle?.enemies || [])],
      combat: {
        resolveManualDodge: () => true,
        checkEnd: () => { manualResumes += 10; },
      },
      finishTurn: () => { manualResumes += 100; return true; },
      advanceToInput: async () => { manualResumes += 1000; },
      runEnemyPlayPhase: async () => { manualResumes += 10000; return true; },
      waitEffects: () => new Promise(resolve => { releaseManual = resolve; }),
    });
    const manualTask = manualFlow.resolveManualDodge(actionState, false, 0);
    while (!releaseManual) await Promise.resolve();
    window.BattleActionGuard.reset();
    releaseManual();
    await manualTask;

    let releaseShare;
    let shareResumes = 0;
    const originalResolveShare = window.HoshinoSkills.resolveShare;
    window.HoshinoSkills.resolveShare = () => ({
      ok: true, done: true, resumeUnitUid: unit.uid,
      resumePhase: 4, resumeEnemyUid: unit.uid,
    });
    const shareFlow = window.BattleShareFlow({
      active: battle => battle?.allies[0],
      enterEndPhase: () => true,
      advanceToInput: async () => { shareResumes += 1000; },
      draw: () => [],
      waitEffects: () => new Promise(resolve => { releaseShare = resolve; }),
      isCurrentState: state => window.state === state,
      manualFlow: {
        resumeInterruptedActions: async () => { shareResumes += 1; return true; },
        resumeAfterManualResponse: async () => { shareResumes += 100; },
      },
      combat: { checkEnd: () => { shareResumes += 10; } },
      continuePreparedTurn: () => {},
      finishTurn: () => true,
      runEnemyPlayPhase: async () => true,
      record: () => {},
      canDiscardCard: () => true,
      discardCards: () => {},
      completeDiscardPhase: () => true,
    });
    const shareTask = shareFlow.resolveKaiichiShare(actionState, null);
    while (!releaseShare) await Promise.resolve();
    window.BattleActionGuard.reset();
    releaseShare();
    await shareTask;
    window.HoshinoSkills.resolveShare = originalResolveShare;
    window.state = originalState;
    return { manualResumes, shareResumes };
  });
  expect(result).toEqual({ manualResumes: 0, shareResumes: 0 });
});

test("runtime boundary prevents a queued character unlock from committing", async ({ page }) => {
  await openOnlineGame(page);
  const result = await page.evaluate(async () => {
    await window.GameBundles.load("hall");
    const actionState = window.state;
    const character = actionState.chars.find(item => item.id === "manny");
    const before = { locked: character.locked, essence: actionState.resources.essence };
    let renders = 0;
    let persists = 0;
    let release;
    const originalRender = window.render;
    const originalPersist = window.persist;
    const originalCall = window.ServerCore.call;
    window.render = () => { renders += 1; };
    window.persist = async () => { persists += 1; return true; };
    window.ServerCore.call = () => new Promise(resolve => {
      release = () => resolve({ ok: true, changed: true });
    });
    const pending = window.AppActionGuard.run(
      "stale unlock",
      ({ state, isCurrent }) => window.unlockChar("manny", state, isCurrent),
      { captureRun: false },
    );
    while (!release) await Promise.resolve();
    window.AppRuntimeErrors.capture(new Error("unlock boundary"), "error");
    release();
    await pending;
    window.render = originalRender;
    window.persist = originalPersist;
    window.ServerCore.call = originalCall;
    return {
      before,
      after: { locked: character.locked, essence: actionState.resources.essence },
      renders,
      persists,
    };
  });
  expect(result).toEqual({
    before: { locked: true, essence: 0 },
    after: { locked: true, essence: 0 },
    renders: 0,
    persists: 0,
  });
});

test("runtime boundary invalidates a late mission start", async ({ page }) => {
  await openOnlineGame(page);
  const result = await page.evaluate(async () => {
    await Promise.all([
      window.GameBundles.load("hall"),
      window.GameBundles.load("dungeon"),
    ]);
    window.render = () => {};
    window.persist = async () => true;
    window.GameBundles.isReady = () => true;
    window.DungeonRewards.pendingCount = () => 0;
    let resolveFirst;
    let calls = 0;
    window.ServerCore.call = async () => {
      calls += 1;
      if (calls === 1) {
        return new Promise(resolve => { resolveFirst = resolve; });
      }
      return { ok: true, result: {} };
    };
    let starts = 0;
    window.DungeonSystem.start = actionState => {
      starts += 1;
      actionState.explore = { marker: starts };
    };
    const runMission = () => window.AppActionGuard.run(
      "出征失败",
      ({ isCurrent }) => window.startMission("machine_factory", "normal", isCurrent),
      { key: "runtime-mission", captureRun: false },
    );
    const first = runMission();
    while (!resolveFirst) await Promise.resolve();
    window.AppRuntimeErrors.capture(new Error("mission boundary"), "error");
    window.AppRuntimeErrors.retry();
    await runMission();
    const afterRetry = { calls, starts, marker: window.state.explore?.marker };
    resolveFirst({ ok: true, result: {} });
    await first;
    return {
      afterRetry,
      afterLateResult: { calls, starts, marker: window.state.explore?.marker },
    };
  });
  expect(result).toEqual({
    afterRetry: { calls: 2, starts: 1, marker: 1 },
    afterLateResult: { calls: 2, starts: 1, marker: 1 },
  });
});
