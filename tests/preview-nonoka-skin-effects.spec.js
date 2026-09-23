const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

test("Nonoka Idol Rising Star renders skill and victory effects", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.state.testAllies = ["nonoka", "lokar"];
    window.state.testEnemies = [0];
    window.SkinSystem.testEquip(window.state, "nonoka", "nonoka_idol_rising_star");
    window.state.hallModal = "testBattle";
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await expect(page.locator(".ally-unit .skin-effect-nonoka-idol")).toHaveCount(1);
  expect(await page.locator(".ally-unit .skin-effect-nonoka-idol > img")
    .evaluate(image => getComputedStyle(image).animationName)).toBe("none");
  expect(await page.evaluate(() => {
    const actor = window.state.battle.allies.find(unit => unit.ref === "nonoka");
    window.NonokaIdolSkinFX.entry(window.state, actor);
    return document.querySelectorAll(".nonoka-idol-entry-fx").length > 0;
  })).toBe(true);
  await page.evaluate(() => {
    const actor = window.state.battle.allies.find(unit => unit.ref === "nonoka");
    document.querySelectorAll(".nonoka-idol-entry-fx").forEach(node => node.remove());
    window.state.battle.test = false;
    window.state.ownedSkins.nonoka_idol_rising_star = true;
    window.state.equippedSkins.nonoka = "nonoka_default";
    actor.skinDynamicEffect = "nonoka-idol";
    window.render();
  });
  await expect(page.locator(".ally-unit .skin-effect-nonoka-idol")).toHaveCount(0);
  expect(await page.evaluate(() => {
    const actor = window.state.battle.allies.find(unit => unit.ref === "nonoka");
    return window.NonokaIdolSkinFX.active(actor);
  })).toBe(false);
  await page.evaluate(() => {
    const actor = window.state.battle.allies.find(unit => unit.ref === "nonoka");
    window.state.equippedSkins.nonoka = "nonoka_idol_rising_star";
    actor.skinDynamicEffect = null;
    window.render();
  });
  await expect(page.locator(".ally-unit .skin-effect-nonoka-idol")).toHaveCount(1);
  await expect(page.locator(".nonoka-idol-entry-fx")).toHaveCount(1);

  await page.evaluate(() => {
    const actor = window.state.battle.allies.find(unit => unit.ref === "nonoka");
    const target = window.state.battle.allies.find(unit => unit.ref === "lokar");
    window.state.battle.activeUid = actor.uid;
    window.render();
    actor.newMoonActive = true; actor.newMoonSuits = [];
    window.NonokaLokiSkills.afterCardPlayed(window.state, actor, target, { name: "舞台红桃", type: "tactic", suit: "♥" }, {
      draw() {},
    });
  });
  await expect(page.locator(".nonoka-idol-note-fx.suit-heart")).toHaveCount(2);
  const noteReadability = await page.locator(".nonoka-idol-note-fx.suit-heart").first().evaluate(element => {
    const note = getComputedStyle(element.querySelector("i"));
    const halo = getComputedStyle(element, "::before");
    return {
      noteColor: note.color,
      noteStroke: note.webkitTextStrokeWidth,
      noteShadow: note.textShadow,
      haloContent: halo.content,
      haloBackground: halo.backgroundImage,
    };
  });
  expect(noteReadability.noteColor).toBe("rgb(255, 131, 200)");
  expect(noteReadability.noteStroke).not.toBe("0px");
  expect(noteReadability.noteShadow).not.toBe("none");
  expect(noteReadability.haloContent).not.toBe("none");
  expect(noteReadability.haloBackground).not.toBe("none");
  const notePlacement = await page.evaluate(() => {
    const actor = window.state.battle.allies.find(unit => unit.ref === "nonoka");
    const action = window.BattleEffectAnchors.measure(actor, "action");
    const battlefield = window.BattleEffectAnchors.measure(actor, "battlefield");
    const note = document.querySelector(".nonoka-idol-note-fx");
    return {
      note: { left: Number.parseFloat(note.style.left), top: Number.parseFloat(note.style.top) },
      action: { left: action.rect.left, top: action.rect.top },
      battlefield: { left: battlefield.rect.left, top: battlefield.rect.top },
    };
  });

  await page.evaluate(() => {
    const actor = window.state.battle.allies.find(unit => unit.ref === "nonoka");
    const target = window.state.battle.allies.find(unit => unit.ref === "lokar");
    actor.usedMimic = false;
    window.NonokaLokiSkills.handleSpecialCard(window.state, actor, target, { mimicVoice: true }, {});
  });
  await expect(page.locator(".nonoka-idol-mimic-fx img")).toHaveCount(2);
  const mimicPlacement = await page.evaluate(() => {
    const actor = window.state.battle.allies.find(unit => unit.ref === "nonoka");
    const action = window.BattleEffectAnchors.measure(actor, "action");
    const mimic = document.querySelector(".nonoka-idol-mimic-fx");
    return {
      mimic: { left: Number.parseFloat(mimic.style.left), top: Number.parseFloat(mimic.style.top) },
      action: { left: action.rect.left, top: action.rect.top },
    };
  });

  await page.evaluate(() => {
    const actor = window.state.battle.allies.find(unit => unit.ref === "nonoka");
    const target = window.state.battle.allies.find(unit => unit.ref === "lokar");
    const heart = { name: "舞台之心", type: "tactic", suit: "♥" };
    actor.usedIdolKiss = false; actor.hand = [heart];
    window.NonokaLokiSkills.handleSpecialCard(window.state, actor, target, { idolKiss: true, _costCard: heart }, {
      statOf: () => 2, pushFloat() {}, damage() {}, draw() {},
    });
  });
  await expect(page.locator(".nonoka-idol-kiss-fx i")).toHaveCount(7);
  await expect(page.locator(".nonoka-idol-kiss-burst")).toHaveCount(1);
  const kissPlacement = await page.evaluate(() => {
    const actor = window.state.battle.allies.find(unit => unit.ref === "nonoka");
    const target = window.state.battle.allies.find(unit => unit.ref === "lokar");
    const action = window.BattleEffectAnchors.measure(actor, "action");
    const targetBattlefield = window.BattleEffectAnchors.measure(target, "battlefield");
    const kiss = document.querySelector(".nonoka-idol-kiss-fx");
    const burst = document.querySelector(".nonoka-idol-kiss-burst");
    const position = element => ({ left: Number.parseFloat(element.style.left), top: Number.parseFloat(element.style.top) });
    return {
      kiss: position(kiss), burst: position(burst),
      action: { x: action.center.x, y: action.center.y },
      target: { x: targetBattlefield.center.x, y: targetBattlefield.center.y },
    };
  });
  expect(notePlacement.note.left).toBeCloseTo(notePlacement.action.left, 1);
  expect(notePlacement.note.top).toBeCloseTo(notePlacement.action.top, 1);
  expect(notePlacement.note.left).not.toBeCloseTo(notePlacement.battlefield.left, 1);
  expect(mimicPlacement.mimic.left).toBeCloseTo(mimicPlacement.action.left, 1);
  expect(mimicPlacement.mimic.top).toBeCloseTo(mimicPlacement.action.top, 1);
  expect(kissPlacement.kiss.left).toBeCloseTo(kissPlacement.action.x, 1);
  expect(kissPlacement.kiss.top).toBeCloseTo(kissPlacement.action.y, 1);
  expect(kissPlacement.burst.left).toBeCloseTo(kissPlacement.target.x, 1);
  expect(kissPlacement.burst.top).toBeCloseTo(kissPlacement.target.y, 1);

  await page.evaluate(() => {
    window.state.battle.victoryScreen = true;
    window.state.battle.locked = true;
    window.render();
  });
  await expect(page.locator(".victory-screen.idol-victory")).toBeVisible();
  await expect(page.locator(".idol-victory-show .idol-victory-art img")).toBeVisible();
  const victorySkinPositions = await page.locator(
    ".victory-screen .skin-effect-nonoka-idol"
  ).evaluateAll(elements => elements.map(element => getComputedStyle(element).position));
  expect(victorySkinPositions.length).toBeGreaterThan(0);
  expect(victorySkinPositions).not.toContain("static");
  const overflow = await page.locator(".victory-screen").evaluate(element => ({
    x: element.scrollWidth - element.clientWidth,
    y: element.scrollHeight - element.clientHeight,
  }));
  expect(overflow.x).toBeLessThanOrEqual(1);
  expect(overflow.y).toBeLessThanOrEqual(1);
  expect(relevantErrors(errors)).toEqual([]);
});

test("equipped Nonoka and Manny skins share one ranked victory show and soundtrack", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.state.testAllies = ["nonoka", "manny"];
    window.state.testEnemies = [0];
    window.SkinSystem.testEquip(window.state, "nonoka", "nonoka_idol_rising_star");
    window.SkinSystem.testEquip(window.state, "manny", "manny_gun_succubus");
    window.state.hallModal = "testBattle";
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();

  await page.evaluate(() => {
    const battle = window.state.battle;
    const nonoka = battle.allies.find(unit => unit.ref === "nonoka");
    const manny = battle.allies.find(unit => unit.ref === "manny");
    battle.performance[nonoka.uid].damage = 0;
    battle.performance[manny.uid].damage = 20;
    window.__victoryTones = [];
    window.BattleAudio.tone = (...args) => window.__victoryTones.push(args);
    battle.victoryScreen = true;
    battle.locked = true;
    window.render();
  });
  await expect(page.locator(".victory-screen.manny-gun-victory")).toBeVisible();
  await expect(page.locator(".manny-gun-victory-show")).toHaveCount(1);
  await expect(page.locator(".idol-victory-show")).toHaveCount(0);
  expect(await page.evaluate(() => window.__victoryTones.length)).toBe(3);

  await page.evaluate(() => {
    const battle = window.state.battle;
    const nonoka = battle.allies.find(unit => unit.ref === "nonoka");
    const manny = battle.allies.find(unit => unit.ref === "manny");
    battle.performance[nonoka.uid].damage = 40;
    battle.performance[manny.uid].damage = 0;
    delete battle._idolVictoryShown;
    window.__victoryTones = [];
    window.render();
  });
  await expect(page.locator(".victory-screen.idol-victory")).toBeVisible();
  await expect(page.locator(".idol-victory-show")).toHaveCount(1);
  await expect(page.locator(".manny-gun-victory-show")).toHaveCount(0);
  expect(await page.evaluate(() => window.__victoryTones.length)).toBe(2);
  expect(relevantErrors(errors)).toEqual([]);
});
