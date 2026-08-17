const { test, expect } = require("@playwright/test");
const {
  startRegressionBattle, prepareAoeLineCapture, capturedAoeLineCount,
} = require("./helpers/preview-game");

test("enemy group conversions show a line to every living ally", async ({ page }) => {
  await startRegressionBattle(page);
  const targetCount = await page.evaluate(() => {
    const battle = window.state.battle, actor = battle.enemies[0];
    if (battle.allies.length < 2) {
      battle.allies.push({ ...battle.allies[0], uid: "enemy-aoe-target-2", hand: [], hp: 10, maxHp: 10 });
    }
    actor.ai = "demon_beast_unit";
    window.render();
    const event = {
      uid: actor.uid,
      side: actor.side,
      targetUid: battle.allies[0].uid,
      card: { name: "杀（普攻）", suit: "♠", type: "slash", power: 1 },
      slashText: true,
    };
    window.__enemyGroupLinesReady = new Promise(resolve => {
      window.__resolveEnemyGroupLinesReady = resolve;
    });
    const effectUtils = {
      ...window.BattleEffectUtils,
      setLines(...args) {
        window.BattleEffectUtils.setLines(...args);
        window.__enemyGroupShownLineCount = document.querySelectorAll(".target-line.aoe-line.show").length;
        window.__resolveEnemyGroupLinesReady();
      },
    };
    window.__enemyGroupLinePlay = window.BattleEffectCards(effectUtils)
      .enemyPlay(window.state, event, () => {}, () => {}, () => true);
    return battle.allies.filter(unit => unit.hp > 0).length;
  });
  await page.evaluate(() => window.__enemyGroupLinesReady);
  const shownLineCount = await page.evaluate(() => window.__enemyGroupShownLineCount);
  expect(shownLineCount).toBe(targetCount);
  await page.evaluate(() => window.__enemyGroupLinePlay);
  await expect(page.locator(".target-line.aoe-line")).toHaveCount(0);
});

test("Infinite Dark Blade shows its virtual sweep and all target lines", async ({ page }) => {
  await startRegressionBattle(page);
  await prepareAoeLineCapture(page, "__edisDarkLineCapture");
  const targetCount = await page.evaluate(() => {
    const battle = window.state.battle;
    if (battle.allies.length < 2) {
      battle.allies.push({
        ...battle.allies[0],
        uid: "edis-dark-target-2",
        hand: [],
        hp: 10,
        maxHp: 10,
      });
    }
    const edis = battle.enemies[0];
    edis.ai = "pursuer_edis";
    edis.name = "内英组杀手伊迪斯";
    battle.animQueue = [];
    window.render();
    document.querySelector(".ally-row [data-target]")?.remove();
    window.EdisSkills.beforeHeal(
      window.state,
      battle.allies[0],
      3,
      battle.allies[0],
      { name: "生命之泉", type: "tactic", teamHealPct: .3 },
      () => ({ dodged: false }),
    );
    const event = battle.animQueue.find(item =>
      item.type === "virtualPlay" && item.card?.name === "机枪扫杀");
    window.__edisDarkEvent = {
      show: event?.show,
      virtual: event?.card?.virtual,
      targetCount: event?.targetUids?.length || 0,
    };
    window.__edisDarkDrain = window.BattleEffects.drain(window.state, window.render);
    return battle.allies.filter(unit => unit.hp > 0).length;
  });
  expect(await capturedAoeLineCount(page, "__edisDarkLineCapture")).toBe(targetCount);
  await page.evaluate(() => window.__edisDarkDrain);
  expect(await page.evaluate(() => window.__edisDarkEvent)).toEqual({
    show: true,
    virtual: true,
    targetCount,
  });
  const trail = page.locator(".card-trail").filter({ hasText: "机枪扫杀" });
  await expect(trail).toHaveCount(1);
  await expect(trail.locator(".trail-kind")).toHaveText("虚拟");
  await expect(page.locator(".target-line.aoe-line")).toHaveCount(0);
});

test("annihilation Gatling shows its virtual sweep and all target lines", async ({ page }) => {
  await startRegressionBattle(page);
  await prepareAoeLineCapture(page, "__annihilationLineCapture");
  const targetCount = await page.evaluate(() => {
    const battle = window.state.battle;
    if (battle.allies.length < 2) {
      battle.allies.push({
        ...battle.allies[0],
        uid: "annihilation-target-2",
        hand: [],
        hp: 10,
        maxHp: 10,
      });
    }
    const bull = battle.enemies[0];
    bull.ai = "mechanical_bull_king";
    bull.name = "机械牛头王";
    bull.annihilationMode = true;
    battle.animQueue = [];
    window.render();
    window.EnemySkills.prepare(
      window.state,
      bull,
      () => ({ dodged: false }),
      () => 19,
    );
    const event = battle.animQueue.find(item =>
      item.type === "virtualPlay" && item.card?.name === "机枪扫杀");
    window.__annihilationEvent = {
      show: event?.show,
      virtual: event?.card?.virtual,
      targetCount: event?.targetUids?.length || 0,
    };
    window.__annihilationDrain = window.BattleEffects.drain(
      window.state, window.render);
    return battle.allies.filter(unit => unit.hp > 0).length;
  });
  expect(await capturedAoeLineCount(page, "__annihilationLineCapture"))
    .toBe(targetCount);
  await page.evaluate(() => window.__annihilationDrain);
  expect(await page.evaluate(() => window.__annihilationEvent)).toEqual({
    show: true,
    virtual: true,
    targetCount,
  });
  const trail = page.locator(".card-trail").filter({ hasText: "机枪扫杀" });
  await expect(trail).toHaveCount(1);
  await expect(trail.locator(".trail-kind")).toHaveText("虚拟");
  await expect(page.locator(".target-line.aoe-line")).toHaveCount(0);
});
