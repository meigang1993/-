const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

test("Manny Gun Succubus renders weapon skeleton, portal, spike, and victory effects", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.state.testAllies = ["manny", "lokar"];
    window.state.testEnemies = [0, 1];
    window.SkinSystem.testEquip(window.state, "manny", "manny_gun_succubus");
    window.state.hallModal = "testBattle";
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await expect(page.locator(".ally-unit .skin-effect-manny-gun")).toHaveCount(1);
  expect(await page.locator(".ally-unit .skin-effect-manny-gun").evaluate(node => {
    const style = getComputedStyle(node, "::before");
    return { content: style.content, backgroundImage: style.backgroundImage };
  })).toEqual({ content: "none", backgroundImage: "none" });
  expect(await page.locator(".ally-unit .skin-effect-manny-gun > img")
    .evaluate(image => getComputedStyle(image).animationName)).toContain("mannyGunIdle");
  await page.evaluate(() => {
    const actor = window.state.battle.allies.find(unit => unit.ref === "manny");
    const originalTarget = window.state.battle.allies.find(unit => unit.ref === "lokar");
    const targets = window.state.battle.enemies;
    window.state.battle.activeUid = actor.uid;
    window.render();
    window.MannyGunSkinFX.armory(window.state, actor, "barrett");
    window.MannyGunSkinFX.barrettJudge(window.state, actor);
    window.MannyGunSkinFX.weaponAttack(window.state, actor, targets[0], "ak47");
    window.MannyGunSkinFX.ak47Burst(window.state, actor, targets[0]);
    window.MannyGunSkinFX.weaponAttack(window.state, actor, targets[0], "barrett");
    window.MannyGunSkinFX.weaponAttack(window.state, actor, targets[0], "cannon");
    window.MannyGunSkinFX.weaponAttack(window.state, actor, targets[0], "flamer");
    window.MannyGunSkinFX.dimensionTransfer(window.state, actor, originalTarget, targets[0]);
    window.MannyGunSkinFX.spikeMark(window.state, actor, targets[0]);
    window.MannyGunSkinFX.spikeBurst(window.state, actor, targets[0], targets);
  });
  const effectCounts = await page.evaluate(() => Object.fromEntries([
    ".manny-gun-armory.weapon-barrett", ".manny-gun-judge",
    ".manny-ak47-shot", ".manny-ak47-burst",
    ".manny-barrett-shot", ".manny-barrett-hit", ".manny-barrett-rifle",
    ".manny-cannon-shot", ".manny-cannon-hit",
    ".manny-flame-line", ".manny-flame-hit",
    ".manny-portal", ".manny-spike-attach", ".manny-spike-burst", ".manny-spike-ray",
  ].map(selector => [selector, document.querySelectorAll(selector).length])));
  expect(effectCounts).toEqual({
    ".manny-gun-armory.weapon-barrett": 2,
    ".manny-gun-judge": 2,
    ".manny-ak47-shot": 1,
    ".manny-ak47-burst": 5,
    ".manny-barrett-shot": 1,
    ".manny-barrett-hit": 1,
    ".manny-barrett-rifle": 2,
    ".manny-cannon-shot": 1,
    ".manny-cannon-hit": 1,
    ".manny-flame-line": 2,
    ".manny-flame-hit": 2,
    ".manny-portal": 2,
    ".manny-spike-attach": 1,
    ".manny-spike-burst": 1,
    ".manny-spike-ray": 1,
  });
  const armorySpread = await page.locator(".manny-gun-armory").first().locator("b i").evaluateAll(elements => {
    elements.forEach(element => element.getAnimations().forEach(animation => {
      animation.currentTime = 700;
      animation.pause();
    }));
    const transforms = elements.map(element => getComputedStyle(element).transform);
    const centers = elements.map(element => {
      const rect = element.getBoundingClientRect();
      return rect.top + (rect.height / 2);
    });
    return {
      count: elements.length,
      transforms,
      verticalSpread: Math.max(...centers) - Math.min(...centers),
    };
  });
  expect(armorySpread.count).toBe(7);
  expect(armorySpread.transforms).not.toContain("none");
  expect(new Set(armorySpread.transforms).size).toBe(7);
  expect(armorySpread.verticalSpread).toBeGreaterThan(20);
  const mannyPlacement = await page.evaluate(() => {
    const actor = window.state.battle.allies.find(unit => unit.ref === "manny");
    const action = window.BattleEffectAnchors.measure(actor, "action");
    const effect = document.querySelector(".manny-gun-armory");
    return {
      effect: { left: Number.parseFloat(effect.style.left), top: Number.parseFloat(effect.style.top) },
      action: { left: action.rect.left, top: action.rect.top },
    };
  });
  expect(mannyPlacement.effect.left).toBeCloseTo(mannyPlacement.action.left, 1);
  expect(mannyPlacement.effect.top).toBeCloseTo(mannyPlacement.action.top, 1);
  const weaponForms = await page.evaluate(() => {
    document.querySelectorAll(".manny-gun-armory").forEach(node => node.remove());
    const actor = window.state.battle.allies.find(unit => unit.ref === "manny");
    const weapons = ["ak47", "barrett", "cannon", "flamer"];
    weapons.forEach(weapon => window.MannyGunSkinFX.armory(window.state, actor, weapon));
    return Object.fromEntries(weapons.map(weapon => {
      const element = document.querySelector(`.manny-gun-armory.weapon-${weapon}`);
      const style = getComputedStyle(element, "::after");
      const detail = getComputedStyle(element, "::before");
      return [weapon, {
        width: style.width,
        height: style.height,
        background: style.backgroundImage,
        clipPath: style.clipPath,
        detail: `${detail.width}|${detail.height}|${detail.backgroundImage}|${detail.borderRadius}`,
      }];
    }));
  });
  expect(new Set(Object.values(weaponForms).map(form => JSON.stringify(form))).size).toBe(4);
  const portalPlacement = await page.evaluate(() => {
    const actor = window.state.battle.allies.find(unit => unit.ref === "manny");
    const originalTarget = window.state.battle.allies.find(unit => unit.ref === "lokar");
    const redirectedTarget = window.state.battle.enemies[0];
    const actorAction = window.BattleEffectAnchors.measure(actor, "action");
    const source = window.BattleEffectAnchors.measure(originalTarget, "battlefield");
    const target = window.BattleEffectAnchors.measure(redirectedTarget, "battlefield");
    const sourcePortal = document.querySelector(".manny-portal.source");
    const targetPortal = document.querySelector(".manny-portal.target");
    const shot = document.querySelector(".manny-portal-shot");
    const position = element => ({ left: Number.parseFloat(element.style.left), top: Number.parseFloat(element.style.top) });
    return {
      sourcePortal: position(sourcePortal), targetPortal: position(targetPortal), shot: position(shot),
      source: { left: source.rect.left, top: source.rect.top, x: source.center.x, y: source.center.y },
      target: { left: target.rect.left, top: target.rect.top },
      actorAction: { left: actorAction.rect.left, top: actorAction.rect.top },
    };
  });
  expect(portalPlacement.sourcePortal.left).toBeCloseTo(portalPlacement.source.left, 1);
  expect(portalPlacement.sourcePortal.top).toBeCloseTo(portalPlacement.source.top, 1);
  expect(portalPlacement.sourcePortal.left).not.toBeCloseTo(portalPlacement.actorAction.left, 1);
  expect(portalPlacement.targetPortal.left).toBeCloseTo(portalPlacement.target.left, 1);
  expect(portalPlacement.targetPortal.top).toBeCloseTo(portalPlacement.target.top, 1);
  expect(portalPlacement.shot.left).toBeCloseTo(portalPlacement.source.x, 1);
  expect(portalPlacement.shot.top).toBeCloseTo(portalPlacement.source.y, 1);

  await page.evaluate(() => {
    window.state.battle.victoryScreen = true;
    window.state.battle.locked = true;
    window.render();
  });
  await expect(page.locator(".victory-screen.manny-gun-victory")).toBeVisible();
  await expect(page.locator(".manny-gun-victory-art img")).toBeVisible();
  await expect(page.locator(".manny-victory-arsenal i")).toHaveCount(7);
  const victorySkinPositions = await page.locator(
    ".victory-screen .skin-effect-manny-gun"
  ).evaluateAll(elements => elements.map(element => getComputedStyle(element).position));
  expect(victorySkinPositions.length).toBeGreaterThan(0);
  expect(victorySkinPositions).not.toContain("static");
  const victorySpread = await page.locator(".manny-victory-arsenal i").evaluateAll(elements => {
    elements.forEach(element => element.getAnimations().forEach(animation => {
      animation.currentTime = 1200;
      animation.pause();
    }));
    const transforms = elements.map(element => getComputedStyle(element).transform);
    const centers = elements.map(element => {
      const rect = element.getBoundingClientRect();
      return rect.top + (rect.height / 2);
    });
    return {
      transforms,
      verticalSpread: Math.max(...centers) - Math.min(...centers),
    };
  });
  expect(victorySpread.transforms).not.toContain("none");
  expect(new Set(victorySpread.transforms).size).toBe(7);
  expect(victorySpread.verticalSpread).toBeGreaterThan(40);
  expect(relevantErrors(errors)).toEqual([]);
});
