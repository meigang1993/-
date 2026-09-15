const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

test("Bertis Arrogant Queen renders anchored skill and victory effects", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.state.testAllies = ["bertis", "gerlot", "lokar"];
    window.state.testEnemies = [0];
    window.SkinSystem.testEquip(window.state, "bertis", "bertis_arrogant_queen");
    window.state.hallModal = "testBattle";
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await expect(page.locator(".ally-unit .skin-effect-bertis-queen")).toHaveCount(1);
  expect(await page.locator(".ally-unit .skin-effect-bertis-queen > img")
    .evaluate(image => getComputedStyle(image).animationName)).toBe("none");

  const placement = await page.evaluate(() => {
    const bertis = window.state.battle.allies.find(unit => unit.ref === "bertis");
    const gerlot = window.state.battle.allies.find(unit => unit.ref === "gerlot");
    const lokar = window.state.battle.allies.find(unit => unit.ref === "lokar");
    const enemy = window.state.battle.enemies[0];
    window.state.battle.activeUid = bertis.uid;
    window.render();
    const action = window.BattleEffectAnchors.measure(bertis, "action");
    const target = window.BattleEffectAnchors.measure(gerlot, "battlefield");
    const draws = {}, damages = [];
    const deps = { draw(unit, count) { draws[unit.ref] = (draws[unit.ref] || 0) + count; } };
    const ctx = { damage(state, unit, amount) { damages.push({ ref: unit.ref, amount }); } };
    bertis.hp = bertis.maxHp;
    bertis.bertisArrogant = false;
    delete bertis.bertisBaseStats;
    window.BertisGerlotSkills.refreshArrogance(window.state);
    window.BertisGerlotSkills.handleSpecialCard(window.state, bertis, lokar, { bertisWhip: true }, deps, ctx);
    bertis.usedBertisWhip = false;
    window.BertisGerlotSkills.handleSpecialCard(window.state, bertis, gerlot, { bertisWhip: true }, deps, ctx);
    window.BertisGerlotSkills.endTurn(window.state, bertis);
    enemy.hp = 0;
    window.BertisGerlotSkills.afterAnyDeath(window.state);
    window.BertisGerlotSkills.handleSpecialCard(window.state, gerlot, null, { bertisTakeFood: true }, deps, ctx);
    window.BertisGerlotSkills.afterDamage(window.state, enemy, bertis, {}, 1, { damage() {} });
    const arrogance = [...document.querySelectorAll(".bertis-queen-arrogance")]
      .find(node => Math.abs(Number.parseFloat(node.style.left) - action.rect.left) < 1);
    const hit = document.querySelector(".bertis-queen-whip-hit.doubled");
    const pos = node => ({ left: Number.parseFloat(node.style.left), top: Number.parseFloat(node.style.top) });
    return {
      hasAngry: !!document.querySelector(".bertis-queen-angry-fx"),
      arrogance: pos(arrogance), hit: pos(hit),
      action: { left: action.rect.left, top: action.rect.top },
      target: { left: target.rect.left, top: target.rect.top },
      draws, damages, food: bertis.food, arrogant: bertis.bertisArrogant,
      foodFlightCards: document.querySelectorAll(".bertis-queen-food-flight i").length,
      effects: {
        arrogant: document.querySelectorAll(".bertis-queen-arrogant").length,
        whipLine: document.querySelectorAll(".bertis-queen-whip-line:not(.doubled)").length,
        doubledLine: document.querySelectorAll(".bertis-queen-whip-line.doubled").length,
        cardsTwo: document.querySelectorAll(".bertis-queen-card-flight.cards-2 i").length,
        doubledHit: document.querySelectorAll(".bertis-queen-whip-hit.doubled").length,
        cardsFour: document.querySelectorAll(".bertis-queen-card-flight.cards-4 i").length,
        growthOne: document.querySelectorAll(".bertis-queen-growth.growth-one").length,
        growthThree: document.querySelectorAll(".bertis-queen-growth.growth-three i").length,
      },
      entryShown: bertis._bertisQueenEntryShown,
    };
  });
  expect(placement.entryShown).toBe(true);
  expect(placement.arrogant).toBe(true);
  expect(placement.damages).toHaveLength(2);
  expect(placement.damages[1].amount).toBe(placement.damages[0].amount * 2);
  expect(placement.draws.bertis).toBe(6);
  expect(placement.draws.gerlot).toBe(2);
  expect(placement.food).toBe(3);
  expect(placement.foodFlightCards).toBe(2);
  expect(placement.effects).toEqual({
    arrogant: 2,
    whipLine: 1,
    doubledLine: 1,
    cardsTwo: 2,
    doubledHit: 1,
    cardsFour: 4,
    growthOne: 2,
    growthThree: 6,
  });
  expect(placement.hasAngry).toBe(true);
  expect(placement.arrogance.left).toBeCloseTo(placement.action.left, 1);
  expect(placement.arrogance.top).toBeCloseTo(placement.action.top, 1);
  expect(placement.hit.left).toBeCloseTo(placement.target.left, 1);
  expect(placement.hit.top).toBeCloseTo(placement.target.top, 1);

  const pendingDamageState = await page.evaluate(() => {
    const battle = window.state.battle;
    const bertis = window.state.battle.allies.find(unit => unit.ref === "bertis");
    battle.enemies.forEach(enemy => {
      if (enemy.hp <= 0) enemy.hp = enemy.visualHp = Math.max(1, enemy.maxHp || 1);
    });
    battle.victoryScreen = false;
    battle.activeUid = bertis.uid;
    battle.thinkingUid = null;
    battle.locked = true;
    bertis.hp = bertis.visualHp = bertis.maxHp - 1;
    bertis.visualHp = bertis.maxHp;
    window.BertisGerlotSkills.refreshArrogance(window.state);
    window.render();
    return {
      uid: bertis.uid,
      normalArt: window.SkinSystem.byId("bertis_arrogant_queen").art,
      damagedArt: window.SkinSystem.byId("bertis_arrogant_queen").damagedArt,
    };
  });
  await expect(page.locator(`[data-target="${pendingDamageState.uid}"] .unit-art`))
    .toHaveAttribute("data-art-src", pendingDamageState.normalArt);
  await expect(page.locator(`[data-target="${pendingDamageState.uid}"] .unit-art`))
    .not.toHaveClass(/skin-state-art/);
  await expect(page.locator(".bertis-queen-arrogant")).toHaveCount(2);
  await page.evaluate(() => {
    const bertis = window.state.battle.allies.find(unit => unit.ref === "bertis");
    bertis.visualHp = bertis.hp;
    window.render();
  });
  await expect(page.locator(`[data-target="${pendingDamageState.uid}"] .unit-art`))
    .toHaveAttribute("data-art-src", pendingDamageState.damagedArt);
  await expect(page.locator(`[data-target="${pendingDamageState.uid}"] .unit-art`))
    .toHaveClass(/skin-state-art/);
  const bertisStateArts = page.locator(
    `[data-target="${pendingDamageState.uid}"] .skin-state-art, `
    + `[data-active-info="${pendingDamageState.uid}"] .skin-state-art`
  );
  await expect(bertisStateArts).toHaveCount(2);
  await expect.poll(() => bertisStateArts.evaluateAll(elements => elements.length === 2
    && elements.every(element => {
    const image = element.querySelector("img");
    if (!image?.complete || !image.naturalWidth) return false;
    return image.offsetWidth === element.clientWidth
      && image.offsetHeight === element.clientHeight;
  }))).toBe(true);
  const pendingHealState = await page.evaluate(() => {
    window.BattleEffects.restart(window.state);
    const battle = window.state.battle;
    const bertis = window.state.battle.allies.find(unit => unit.ref === "bertis");
    const healer = battle.allies.find(unit => unit.ref === "gerlot");
    battle.animQueue = []; bertis.hp = bertis.maxHp - 1; bertis.bertisArrogant = false;
    delete bertis.visualHp; delete bertis._bertisQueenPendingArrogance;
    document.querySelectorAll(".bertis-queen-arrogance.enabled").forEach(node => node.remove());
    window.render();
    window.HoshinoKaiichiSkills.resolveBloodHeal(window.state,
      { unitUid: bertis.uid, healerUid: healer.uid, amount: bertis.maxHp },
      { damage: window.BattleSystem.damage, draw: () => [], pushFloat: window.BattleSystem.pushFloat });
    return {
      hp: bertis.hp, visualHp: bertis.visualHp, pending: bertis._bertisQueenPendingArrogance,
      enabledFx: document.querySelectorAll(".bertis-queen-arrogance.enabled").length,
      normalArt: window.SkinSystem.byId("bertis_arrogant_queen").art,
    };
  });
  expect(pendingHealState).toMatchObject({
    hp: pendingHealState.visualHp + 1, pending: true, enabledFx: 0,
  });
  await expect(page.locator(`[data-target="${pendingDamageState.uid}"] .unit-art`))
    .toHaveAttribute("data-art-src", pendingDamageState.damagedArt);
  await page.evaluate(() => window.BattleEffects.drain(window.state, window.render));
  await expect(page.locator(`[data-target="${pendingDamageState.uid}"] .unit-art`))
    .toHaveAttribute("data-art-src", pendingHealState.normalArt);
  const defaultArt = await page.evaluate(() => {
    const bertis = window.state.battle.allies.find(unit => unit.ref === "bertis");
    window.SkinSystem.testEquip(window.state, "bertis", "bertis_default");
    bertis.hp = bertis.visualHp = bertis.maxHp - 1;
    window.BertisGerlotSkills.refreshArrogance(window.state);
    window.render();
    return window.SkinSystem.byId("bertis_default").art;
  });
  await expect(page.locator(`[data-target="${pendingDamageState.uid}"] .unit-art`))
    .toHaveAttribute("data-art-src", defaultArt);
  await page.evaluate(() => {
    window.SkinSystem.testEquip(window.state, "bertis", "bertis_arrogant_queen");
    window.render();
  });

  await page.evaluate(() => {
    window.state.battle.victoryScreen = true;
    window.state.battle.locked = true;
    window.render();
  });
  await expect(page.locator(".victory-screen.bertis-queen-victory")).toBeVisible();
  await expect(page.locator(".bertis-queen-victory-art img")).toBeVisible();
  await expect(page.locator(".bertis-victory-roses i")).toHaveCount(5);
  const victorySkinPositions = await page.locator(
    ".victory-screen .skin-effect-bertis-queen"
  ).evaluateAll(elements => elements.map(element => getComputedStyle(element).position));
  expect(victorySkinPositions.length).toBeGreaterThan(0);
  expect(victorySkinPositions).not.toContain("static");
  expect(relevantErrors(errors)).toEqual([]);
});
