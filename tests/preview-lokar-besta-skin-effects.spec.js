const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

test("Lokar and Besta Doll skins render exclusive skill effects", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.state.testAllies = ["lokar", "besta_doll"];
    window.state.testEnemies = [0];
    window.SkinSystem.testEquip(window.state, "lokar", "lokar_motherbound");
    window.SkinSystem.testEquip(window.state, "besta_doll", "besta_doll_energy_queen");
    window.state.hallModal = "testBattle";
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.evaluate(() => {
    window.state.battle.animQueue = [];
    window.BattleEffects.recover(window.state);
    window.render();
  });
  await expect(page.locator(".ally-unit .skin-effect-lokar-motherbound")).toHaveCount(1);
  await expect(page.locator(".ally-unit .skin-effect-besta-mecha")).toHaveCount(1);
  const anchorState = await page.evaluate(() => {
    const actor = window.BattleSystem.active(window.state.battle);
    const action = window.BattleEffectAnchors.action(actor);
    const battlefield = window.BattleEffectAnchors.battlefield(actor);
    const preferred = window.BattleEffectAnchors.measure(actor, "action-first");
    return {
      actorUid: actor?.uid,
      actionUid: action?.closest("[data-active-info]")?.dataset.activeInfo,
      battlefieldUid: battlefield?.closest("[data-target]")?.dataset.target,
      preferredIsAction: preferred?.element === action,
      hasBox: preferred?.rect.width > 0 && preferred?.rect.height > 0,
    };
  });
  expect(anchorState).toEqual({
    actorUid: anchorState.actorUid,
    actionUid: anchorState.actorUid,
    battlefieldUid: anchorState.actorUid,
    preferredIsAction: true,
    hasBox: true,
  });

  const effectSnapshot = await page.evaluate(() => {
    const lokar = window.state.battle.allies.find(unit => unit.ref === "lokar");
    const besta = window.state.battle.allies.find(unit => unit.ref === "besta_doll");
    const enemy = window.state.battle.enemies[0];
    window.state.battle.activeUid = lokar.uid;
    window.render();
    const lokarAction = window.BattleEffectAnchors.measure(lokar, "action");
    const lokarBattle = window.BattleEffectAnchors.measure(lokar, "battlefield");
    window.CharacterSkinFX.battleCourageStart(window.state, lokar);
    window.CharacterSkinFX.battleCourageResult(window.state, lokar, true);
    window.CharacterSkinFX.bloodPact(window.state, lokar, 4);
    window.CharacterSkinFX.attackTrail(window.state, lokar, enemy);
    window.CharacterSkinFX.windSlashStart(window.state, lokar, 3);
    window.CharacterSkinFX.windSlashHit(window.state, lokar, enemy, 1);
    window.state.battle.activeUid = besta.uid;
    window.render();
    const bestaAction = window.BattleEffectAnchors.measure(besta, "action");
    window.CharacterSkinFX.soulBlade(window.state, besta, enemy);
    window.CharacterSkinFX.soulScythe(window.state, besta, [enemy], 2);
    window.CharacterSkinFX.extractEssence(window.state, besta, lokar, 2);
    window.render();
    const lokarEffect = document.querySelector(".skinfx-courage");
    const bestaEffect = document.querySelector(".skinfx-soul-core");
    const selectors = [
      ".skinfx-courage", ".skinfx-courage-restored", ".skinfx-blood-pact",
      ".skinfx-pact-trail", ".skinfx-wind-start", ".skinfx-wind-card",
      ".skinfx-soul-card", ".skinfx-scythe", ".skinfx-extract-line",
    ];
    return {
      missing: selectors.filter(selector => !document.querySelector(selector)),
      mirroredSelfEffects: {
        courage: document.querySelectorAll(".skinfx-courage").length,
        soulCore: document.querySelectorAll(".skinfx-soul-core").length,
      },
      mirroredProperties: {
        pactPower: [...document.querySelectorAll(".skinfx-blood-pact")]
          .map(node => node.style.getPropertyValue("--pact-power")),
        chainDepth: [...document.querySelectorAll(".skinfx-scythe")]
          .map(node => node.style.getPropertyValue("--chain-depth")),
        extractPower: [...document.querySelectorAll(".skinfx-extract-core")]
          .map(node => node.style.getPropertyValue("--extract-power")),
      },
      lokarEffect: {
        left: Number.parseFloat(lokarEffect.style.left),
        top: Number.parseFloat(lokarEffect.style.top),
      },
      lokarAction: { left: lokarAction.rect.left, top: lokarAction.rect.top },
      lokarBattle: { left: lokarBattle.rect.left, top: lokarBattle.rect.top },
      bestaEffect: {
        left: Number.parseFloat(bestaEffect.style.left),
        top: Number.parseFloat(bestaEffect.style.top),
      },
      bestaAction: { left: bestaAction.rect.left, top: bestaAction.rect.top },
    };
  });
  expect(effectSnapshot.missing).toEqual([]);
  expect(effectSnapshot.mirroredSelfEffects).toEqual({ courage: 2, soulCore: 2 });
  expect(effectSnapshot.mirroredProperties).toEqual({
    pactPower: ["4", "4"],
    chainDepth: ["2", "2"],
    extractPower: ["2", "2"],
  });
  expect(effectSnapshot.lokarEffect.left).toBeCloseTo(effectSnapshot.lokarAction.left, 1);
  expect(effectSnapshot.lokarEffect.top).toBeCloseTo(effectSnapshot.lokarAction.top, 1);
  expect(effectSnapshot.lokarEffect.left).not.toBeCloseTo(effectSnapshot.lokarBattle.left, 1);
  expect(effectSnapshot.bestaEffect.left).toBeCloseTo(effectSnapshot.bestaAction.left, 1);
  expect(effectSnapshot.bestaEffect.top).toBeCloseTo(effectSnapshot.bestaAction.top, 1);
  await expect(page.locator(".skin-blood-pact-active")).toHaveCount(1);
  await expect(page.locator(".skin-extract-active")).toHaveCount(2);

  const extractArt = await page.evaluate(() => {
    const battle = window.state.battle;
    const besta = battle.allies.find(unit => unit.ref === "besta_doll");
    battle.activeUid = besta.uid;
    battle.thinkingUid = null;
    battle.locked = true;
    besta.hp = besta.visualHp = besta.maxHp;
    besta.extractMagicAttack = true;
    window.render();
    return window.SkinSystem.byId("besta_doll_energy_queen").damagedArt;
  });
  await expect(page.locator('[data-target="a1"] .unit-art'))
    .toHaveAttribute("data-art-src", extractArt);
  await expect(page.locator('[data-target="a1"] .unit-art')).toHaveClass(/skin-state-art/);
  const bestaStateArts = page.locator(
    '[data-target="a1"] .skin-state-art, [data-active-info="a1"] .skin-state-art'
  );
  await expect(bestaStateArts).toHaveCount(2);
  await expect.poll(() => bestaStateArts.evaluateAll(elements => elements.length === 2
    && elements.every(element => {
      const image = element.querySelector("img");
      if (!image?.complete || !image.naturalWidth) return false;
      return image.offsetWidth === element.clientWidth
        && image.offsetHeight === element.clientHeight;
    }))).toBe(true);
  const normalArt = await page.evaluate(() => {
    const besta = window.state.battle.allies.find(unit => unit.ref === "besta_doll");
    besta.hp = besta.visualHp = Math.floor(besta.maxHp / 3);
    besta.extractMagicAttack = false;
    window.render();
    return window.SkinSystem.byId("besta_doll_energy_queen").art;
  });
  await expect(page.locator('[data-target="a1"] .unit-art'))
    .toHaveAttribute("data-art-src", normalArt);

  await page.evaluate(() => {
    const lokar = window.state.battle.allies.find(unit => unit.ref === "lokar");
    const besta = window.state.battle.allies.find(unit => unit.ref === "besta_doll");
    window.CharacterSkinFX.endTurn(window.state, lokar);
    window.CharacterSkinFX.endTurn(window.state, besta);
    window.render();
  });
  await expect(page.locator(".skin-blood-pact-active")).toHaveCount(0);
  await expect(page.locator(".skin-extract-active")).toHaveCount(0);
  await page.evaluate(() => {
    window.state.battle.victoryScreen = true;
    window.state.battle.locked = true;
    window.render();
  });
  const victorySkinPositions = await page.locator(
    ".victory-stats .skin-effect-lokar-motherbound, .victory-stats .skin-effect-besta-mecha"
  ).evaluateAll(elements => elements.map(element => getComputedStyle(element).position));
  expect(victorySkinPositions.length).toBeGreaterThan(0);
  expect(victorySkinPositions).not.toContain("static");
  expect(relevantErrors(errors)).toEqual([]);
});

test("Default Besta Doll skin never activates Extract Essence state art", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.state.testAllies = ["besta_doll"];
    window.state.testEnemies = [0];
    window.SkinSystem.testEquip(window.state, "besta_doll", "besta_doll_default");
    window.state.hallModal = "testBattle";
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.evaluate(() => {
    window.state.battle.animQueue = [];
    window.BattleEffects.recover(window.state);
    window.render();
  });

  const defaultArt = await page.evaluate(() => {
    const besta = window.state.battle.allies.find(unit => unit.ref === "besta_doll");
    besta.hp = besta.visualHp = Math.floor(besta.maxHp / 2);
    besta.extractMagicAttack = true;
    window.render();
    return window.SkinSystem.byId("besta_doll_default").art;
  });

  await expect(page.locator('[data-target="a0"] .unit-art'))
    .toHaveAttribute("data-art-src", defaultArt);
  expect(relevantErrors(errors)).toEqual([]);
});
