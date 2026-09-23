const { test, expect } = require("@playwright/test");
const {
  openGame, startFreshGame, startRegressionBattle,
  openTestBattle,
} = require("./helpers/preview-game");

async function startBattleWithAcquiredCard(page) {
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.state.deck.push(window.CardUtils.cloneEntity(
      "魔弹特攻", { suit: "♣", qaAcquired: true }));
  });
  await openTestBattle(page);
  await page.evaluate(() => {
    window.state.testEnemies = [0, 1];
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.BattleLines.intro = () => 0;
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.evaluate(() => {
    const battle = window.state.battle;
    battle.animQueue = [];
    battle.locked = false;
    battle.phase = 4;
    battle.allies.concat(battle.enemies).forEach(unit =>
      unit.hand.forEach(card => { delete card._pendingDraw; }));
    window.render();
  });
}

test("acquired cards and enemy shared piles keep battle totals synchronized", async ({ page }) => {
  await startBattleWithAcquiredCard(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle;
    const countAcquired = units => {
      const piles = [...new Set(units.map(unit => unit.pileStats))];
      return piles.flatMap(pile => [...pile.deck, ...pile.discard, ...pile.consumed])
        .concat(units.flatMap(unit => unit.hand))
        .filter(card => card.qaAcquired).length;
    };
    const snapshot = units => window.BattlePileStats.side(units);
    const initial = {
      ally: snapshot(battle.allies),
      enemy: snapshot(battle.enemies),
      allyAcquired: countAcquired(battle.allies),
      enemyAcquired: countAcquired(battle.enemies),
      allyShared: battle.allies.every(unit =>
        unit.pileStats === battle.allies[0].pileStats),
      enemyShared: battle.enemies.every(unit =>
        unit.pileStats === battle.enemies[0].pileStats),
      sidesSeparate: battle.allies[0].pileStats !== battle.enemies[0].pileStats,
    };
    window.BattleSystem.draw(battle.allies[0], 1, battle);
    window.BattleSystem.draw(battle.enemies[1], 1, battle);
    battle.animQueue = [];
    battle.allies.concat(battle.enemies).forEach(unit =>
      unit.hand.forEach(card => { delete card._pendingDraw; }));
    const afterDraw = {
      ally: snapshot(battle.allies),
      enemy: snapshot(battle.enemies),
      enemyDeckSynced: battle.enemies[0].deck === battle.enemies[1].deck,
    };
    const enemyPile = battle.enemies[0].pileStats;
    const recyclable = [...enemyPile.deck, ...enemyPile.discard];
    enemyPile.deck.splice(0);
    enemyPile.discard.splice(0, enemyPile.discard.length, ...recyclable);
    const beforeShuffle = snapshot(battle.enemies);
    const shuffleCount = enemyPile.shuffleCount;
    window.BattlePileStats.reshuffle(battle.enemies[1], cards => cards);
    const afterShuffle = snapshot(battle.enemies);
    window.render();
    return {
      expectedTotal: window.state.deck.length,
      initial,
      afterDraw,
      beforeShuffle,
      afterShuffle,
      shuffleAdvanced: enemyPile.shuffleCount === shuffleCount + 1,
      allyUi: document.querySelector(".pile-stats.ally").textContent,
      enemyUi: document.querySelector(".pile-stats.enemy").textContent,
    };
  });
  expect(result.initial).toMatchObject({
    allyAcquired: 1, enemyAcquired: 1,
    allyShared: true, enemyShared: true, sidesSeparate: true,
  });
  expect(result.initial.ally.total).toBe(result.expectedTotal);
  expect(result.initial.enemy.total).toBe(result.expectedTotal);
  expect(result.afterDraw.ally.total).toBe(result.expectedTotal);
  expect(result.afterDraw.enemy.total).toBe(result.expectedTotal);
  expect(result.afterDraw.enemyDeckSynced).toBe(true);
  expect(result.afterDraw.ally.hand).toBe(result.initial.ally.hand + 1);
  expect(result.afterDraw.enemy.hand).toBe(result.initial.enemy.hand + 1);
  expect(result.afterShuffle.total).toBe(result.beforeShuffle.total);
  expect(result.afterShuffle.discard).toBe(0);
  expect(result.shuffleAdvanced).toBe(true);
  expect(result.allyUi).toContain(`总数 ${result.expectedTotal}`);
  expect(result.enemyUi).toContain(`总数 ${result.expectedTotal}`);
});

test("stolen cards move side totals and return to the enemy discard pile", async ({ page }) => {
  await startRegressionBattle(page);
  const result = await page.evaluate(() => {
    const battle = window.state.battle;
    const ally = battle.allies[0], enemy = battle.enemies[0];
    const snapshot = units => window.BattlePileStats.side(units);
    const before = { ally: snapshot(battle.allies), enemy: snapshot(battle.enemies) };
    const card = enemy.hand.find(item => !item._pendingDraw) || enemy.deck.pop();
    const handIndex = enemy.hand.indexOf(card);
    if (handIndex >= 0) enemy.hand.splice(handIndex, 1);
    card.stolenFromUid = enemy.uid;
    ally.hand.push(card);
    window.render();
    const held = {
      ally: snapshot(battle.allies),
      enemy: snapshot(battle.enemies),
      allyUi: document.querySelector(".pile-stats.ally").textContent,
      enemyUi: document.querySelector(".pile-stats.enemy").textContent,
    };
    ally.hand.splice(ally.hand.indexOf(card), 1);
    window.BattleCards.put(battle, ally, card, "discard", {
      skipAnim: true, skipAfterHandLost: true,
    });
    window.render();
    return {
      before,
      held,
      returned: {
        ally: snapshot(battle.allies),
        enemy: snapshot(battle.enemies),
        inEnemyDiscard: enemy.pileStats.discard.includes(card),
        allyUi: document.querySelector(".pile-stats.ally").textContent,
        enemyUi: document.querySelector(".pile-stats.enemy").textContent,
      },
    };
  });
  expect(result.held.ally.total).toBe(result.before.ally.total + 1);
  expect(result.held.enemy.total).toBe(result.before.enemy.total - 1);
  expect(result.held.allyUi).toContain(`总数 ${result.held.ally.total}`);
  expect(result.held.enemyUi).toContain(`总数 ${result.held.enemy.total}`);
  expect(result.returned.ally.total).toBe(result.before.ally.total);
  expect(result.returned.enemy.total).toBe(result.before.enemy.total);
  expect(result.returned.inEnemyDiscard).toBe(true);
  expect(result.returned.allyUi).toContain(`总数 ${result.before.ally.total}`);
  expect(result.returned.enemyUi).toContain(`总数 ${result.before.enemy.total}`);
});
