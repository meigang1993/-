const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame, startRegressionBattle,
} = require("./helpers/preview-game");

test("runtime recovery invalidates enemy thinking before it can act", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const battle = window.state.battle;
    const enemy = battle.enemies[0];
    battle.activeUid = enemy.uid;
    battle.phase = 4;
    battle.locked = false;
    let releaseWait;
    let autoEnemyCalls = 0;
    const runner = window.BattleEnemyTurn({
      wait: () => new Promise(resolve => { releaseWait = resolve; }),
      autoEnemy: async () => { autoEnemyCalls += 1; },
    });
    const pending = runner.runEnemyPlayPhase(window.state, enemy, () => {}, true);
    while (!releaseWait) await Promise.resolve();
    window.AppRuntimeErrors.capture(new Error("enemy thinking boundary"), "error");
    releaseWait();
    const completed = await pending;
    const snapshot = {
      autoEnemyCalls,
      completed,
      thinkingUid: battle.thinkingUid,
      dialogOpen: !!document.getElementById("runtime-error-boundary"),
    };
    window.AppRuntimeErrors.retry();
    return snapshot;
  });
  expect(result).toEqual({
    autoEnemyCalls: 0,
    completed: false,
    thinkingUid: null,
    dialogOpen: true,
  });
});

test("runtime recovery preserves New Moon pending draws until they become selectable", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const battle = window.state.battle;
    const owner = battle.allies[1];
    owner.hand = [
      { name: "新月待摸A", type: "tactic", suit: "♥", _pendingDraw: true },
      { name: "新月待摸B", type: "tactic", suit: "♠", _pendingDraw: true },
    ];
    battle.activeUid = owner.uid;
    battle.phase = 6;
    battle.locked = false;
    battle.newMoonShare = { unitUid: owner.uid, count: 2, indexes: [] };
    battle.animQueue = [{
      type: "gainCards", uid: owner.uid, side: owner.side,
      cards: owner.hand, count: owner.hand.length,
    }];
    window.AppRuntimeErrors.capture(new Error("new moon boundary"), "error");
    const queuedDuringError = battle.animQueue.length;
    window.AppRuntimeErrors.retry();
    await window.BattleEffects.whenIdle();
    window.render();
    return {
      queuedDuringError,
      pendingCards: owner.hand.filter(card => card._pendingDraw).length,
      renderedCards: document.querySelectorAll(".active-hand [data-card-index]").length,
      firstSelectable: window.NonokaNewMoonSkills.toggleCard(window.state, 0),
      promptStillOpen: !!battle.newMoonShare,
    };
  });
  expect(result).toEqual({
    queuedDuringError: 1,
    pendingCards: 0,
    renderedCards: 2,
    firstSelectable: true,
    promptStillOpen: true,
  });
});

test("runtime recovery restarts an in-flight prompt effect without concurrent drains", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const battle = window.state.battle;
    const owner = battle.allies[1];
    const card = { name: "中断恢复牌", type: "tactic", suit: "♥", _pendingDraw: true };
    owner.hand = [card];
    battle.activeUid = owner.uid;
    battle.phase = 6;
    battle.locked = false;
    battle.newMoonShare = { unitUid: owner.uid, count: 1, indexes: [] };
    battle.animQueue = [{
      type: "gainCards", uid: owner.uid, side: owner.side,
      cards: [card], count: 1,
    }];
    const original = window.BattleEffectHandlers.gainCards;
    let releaseFirst;
    let signalFirst;
    const firstStarted = new Promise(resolve => { signalFirst = resolve; });
    let calls = 0;
    window.BattleEffectHandlers.gainCards = async (event, renderStep, active) => {
      calls += 1;
      if (calls === 1) {
        signalFirst();
        await new Promise(resolve => { releaseFirst = resolve; });
        if (!active()) return;
      }
      event.cards.forEach(item => { delete item._pendingDraw; });
      renderStep();
    };
    try {
      const oldDrain = window.BattleEffects.drain(window.state, () => {});
      await firstStarted;
      window.AppRuntimeErrors.capture(new Error("active prompt effect boundary"), "error");
      const queuedAfterRecovery = battle.animQueue.length;
      releaseFirst();
      await oldDrain;
      window.AppRuntimeErrors.retry();
      await window.BattleEffects.whenIdle();
      return {
        calls,
        queuedAfterRecovery,
        queueLength: battle.animQueue.length,
        pending: !!card._pendingDraw,
      };
    } finally {
      window.BattleEffectHandlers.gainCards = original;
    }
  });
  expect(result).toEqual({
    calls: 2,
    queuedAfterRecovery: 1,
    queueLength: 0,
    pending: false,
  });
});

test("runtime recovery resumes an in-flight Headshot judgement exactly once", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(async () => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    const target = battle.enemies[0];
    actor.ref = "gerlot";
    actor.deck = [{ name: "爆头判定牌", type: "tactic", suit: "♥" }];
    actor.discard = [];
    const card = { name: "杀（普攻）", type: "slash", suit: "♦" };
    let resumes = 0;
    window.BertisGerlotSkills.queueHeadshot(
      window.state, actor, target, 1, actor, card, () => { resumes += 1; },
    );
    const original = window.BattleEffectHandlers.judgement;
    let releaseFirst;
    let signalFirst;
    const firstStarted = new Promise(resolve => { signalFirst = resolve; });
    let calls = 0;
    window.BattleEffectHandlers.judgement = async (_state, event, _render, active) => {
      calls += 1;
      if (calls === 1) {
        signalFirst();
        await new Promise(resolve => { releaseFirst = resolve; });
      }
      if (active()) event.commit?.();
    };
    try {
      const oldDrain = window.BattleEffects.drain(window.state, () => {});
      await firstStarted;
      window.AppRuntimeErrors.capture(new Error("headshot boundary"), "error");
      const queuedAfterRecovery = battle.animQueue.length;
      releaseFirst();
      await oldDrain;
      window.AppRuntimeErrors.retry();
      await window.BattleEffects.whenIdle();
      return {
        calls,
        locked: battle.locked,
        queuedAfterRecovery,
        queueLength: battle.animQueue.length,
        resumes,
      };
    } finally {
      window.BattleEffectHandlers.judgement = original;
    }
  });
  expect(result).toEqual({
    calls: 2,
    locked: false,
    queuedAfterRecovery: 1,
    queueLength: 0,
    resumes: 1,
  });
});
