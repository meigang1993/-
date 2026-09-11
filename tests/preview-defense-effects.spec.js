const { test, expect } = require("@playwright/test");
const {
  openGame, startFreshGame,
  openTestBattle,
} = require("./helpers/preview-game");

test("mechanical defense keeps elemental metadata without duplicating hit effects", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await openTestBattle(page);
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();

  const result = await page.evaluate(async () => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    const target = battle.enemies[0];
    window.BattleEffects.cancel(window.state);
    window.BattleFX.cancel();
    Object.assign(target, {
      ai: "mechanical_bull_king",
      hp: 30,
      maxHp: 30,
      block: 0,
      defenseSystem: 5,
      annihilationMode: false,
      annihilationBgm: "./assets/sounds/mechanical-bull-king-annihilation.mp3",
      statuses: [],
    });
    delete target._annihilationPresented;
    const strike = amount => {
      battle.animQueue = [];
      battle.floats = [];
      window.BattleSystem.damage(window.state, target, amount, "雷杀", actor, {
        name: "雷杀",
        type: "slash",
        ignoreResponse: true,
        skipDamageModify: true,
      });
      return battle.floats.map(float => ({
        kind: float.kind,
        damageTypes: float.damageTypes || [],
        effectCritical: float.effectCritical,
        hitFxId: float.hitFxId,
      }));
    };
    const full = strike(3);
    target.hp = 30;
    target.defenseSystem = 2;
    const partial = strike(5);
    const beforeBreakPresentation = {
      bgm: battle.bgmOverride || null,
      status: target.statuses.includes("歼灭"),
    };
    const defenseBreak = battle.animQueue.find(event => event.kind === "defense-break");
    window.BattleEffectHandlers.applyVisual(window.state, defenseBreak, () => window.render());
    const afterBreakPresentation = {
      bgm: battle.bgmOverride || null,
      status: target.statuses.includes("歼灭"),
    };
    return { full, partial, beforeBreakPresentation, afterBreakPresentation };
  });

  expect(result.full).toEqual([
    expect.objectContaining({ kind: "defense", damageTypes: ["thunder"] }),
  ]);
  expect(result.partial).toHaveLength(2);
  expect(result.partial.map(float => float.kind)).toEqual(["defense-break", "damage"]);
  expect(result.partial.map(float => float.damageTypes)).toEqual([[], ["thunder"]]);
  expect(new Set(result.partial.map(float => float.hitFxId)).size).toBe(1);
  expect(result.partial[0].effectCritical).toBeUndefined();
  expect(result.partial[1].effectCritical).toBe(true);
  expect(result.beforeBreakPresentation).toEqual({ bgm: null, status: false });
  expect(result.afterBreakPresentation).toEqual({
    bgm: "./assets/sounds/mechanical-bull-king-annihilation.mp3",
    status: true,
  });

  const multiHit = await page.evaluate(async () => {
    const battle = window.state.battle;
    const actor = battle.allies[0];
    const target = battle.enemies[0];
    window.BattleEffects.cancel(window.state);
    window.BattleFX.cancel();
    Object.assign(target, {
      ai: "test_dummy",
      hp: 30,
      maxHp: 30,
      block: 1,
      defenseSystem: 0,
      annihilationMode: false,
      statuses: [],
      hand: [],
    });
    battle.animQueue = [];
    battle.floats = [];
    const card = {
      name: "三段结算测试杀",
      type: "slash",
      fixedRepeats: 3,
      gatlingRepeats: 3,
      ignoreResponse: true,
      skipDamageModify: true,
      _playedFlightDone: true,
      _playedTargetUid: target.uid,
    };
    window.BattleSystem.damage(window.state, target, 3, card.name, actor, card);
    window.BattleSystem.damage(window.state, target, 3, card.name, actor, card);
    window.BattleSystem.damage(window.state, target, 3, card.name, actor, card);
    const queue = battle.animQueue.map(event => ({
      type: event.type,
      kind: event.kind,
      targetUid: event.targetUid,
      enemyLine: event.enemyLine,
      extraSlashReplay: event.extraSlashReplay,
      show: event.show,
      slashText: event.slashText,
      damageTypes: event.damageTypes || [],
    }));
    const starts = [];
    const queuedDelays = [];
    let slashTextCount = 0;
    let flyingCardCount = 0;
    const observer = new MutationObserver(records => {
      records.forEach(record => {
        [...record.addedNodes].forEach(node => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          if (node.matches?.(".slash-text")) slashTextCount += 1;
          if (node.matches?.(".flying-card")) flyingCardCount += 1;
        });
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const originalPlay = window.BattleDamageFX.play;
    const originalQueueSlashHit = window.BattleFX.queueSlashHit;
    window.BattleDamageFX.play = event => {
      starts.push(performance.now());
      return originalPlay(event);
    };
    window.BattleFX.queueSlashHit = (state, event, delay) => {
      queuedDelays.push(delay);
      return originalQueueSlashHit(state, event, delay);
    };
    try {
      await window.BattleEffects.drain(window.state, () => window.render());
    } finally {
      window.BattleDamageFX.play = originalPlay;
      window.BattleFX.queueSlashHit = originalQueueSlashHit;
      observer.disconnect();
    }
    window.BattleFX.cancel();
    return { queue, starts, queuedDelays, slashTextCount, flyingCardCount };
  });
  const extraSlash = multiHit.queue.filter(event =>
    event.type === "virtualPlay" && event.extraSlashReplay);
  expect(extraSlash).toHaveLength(2);
  expect(extraSlash.every(event =>
    event.targetUid && event.enemyLine === false
      && event.show === false && event.slashText === true))
    .toBe(true);
  expect(multiHit.queue.filter(event => event.type === "float")
    .map(event => event.damageTypes))
    .toEqual([[], ["physical"], ["physical"], ["physical"]]);
  expect(multiHit.slashTextCount).toBe(2);
  expect(multiHit.flyingCardCount).toBe(2);
  expect(multiHit.queuedDelays).toEqual([]);
  expect(multiHit.starts).toHaveLength(3);
  expect(multiHit.starts[1]).toBeGreaterThan(multiHit.starts[0]);
  expect(multiHit.starts[2]).toBeGreaterThan(multiHit.starts[1]);
});
