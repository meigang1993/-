const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

test("battle skin switch does not corrupt unit artwork", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await page.locator("[data-test-ally='angelica']").click();
  await page.evaluate(() => {
    window.state.ownedSkins = window.state.ownedSkins || {};
    window.state.ownedSkins.angelica_berserker = true;
    window.state.ownedSkins.angelica_level_10_special = true;
    window.state.equippedSkins.angelica = "angelica_default";
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();

  await page.evaluate(() => {
    const battle = window.state.battle;
    battle.animQueue = [];
    battle.locked = false;
    battle.phase = 4;
    battle.activeUid = battle.allies[0].uid;
    window.render();
  });

  // Wait for images to be loaded
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".unit-art img")].every(img => img.complete && img.naturalWidth > 0)
  )).toBe(true);

  // Open skin panel for angelica
  const angelica = await page.evaluate(() => {
    const unit = window.state.battle.allies.find(u => u.ref === "angelica");
    window.state.infoUnit = unit.uid;
    window.state.infoTab = "skins";
    window.render();
    return unit.uid;
  });

  // Wait for skin panel
  await expect(page.locator('[data-battle-equip-skin="angelica_berserker"]')).toBeVisible();

  // Record the current angelica unit-art image node identity and src
  const before = await page.evaluate(() => {
    const angelicaUnit = window.state.battle.allies.find(u => u.ref === "angelica");
    const target = document.querySelector(`[data-target="${angelicaUnit.uid}"] .unit-art`);
    const img = target?.querySelector("img");
    const activePortrait = document.querySelector(`[data-active-info="${angelicaUnit.uid}"] .portrait`);
    const activeImg = activePortrait?.querySelector("img");
    return {
      battlefieldSrc: img?.getAttribute("src") || "",
      battlefieldClass: target?.className || "",
      battlefieldImgComplete: img?.complete,
      battlefieldImgNaturalWidth: img?.naturalWidth,
      activeSrc: activeImg?.getAttribute("src") || "",
      activeClass: activePortrait?.className || "",
      activeImgComplete: activeImg?.complete,
      activeImgNaturalWidth: activeImg?.naturalWidth,
    };
  });

  // Click the berserker skin
  await page.locator('[data-battle-equip-skin="angelica_berserker"]').click();

  // Wait for appearanceSaving to finish
  await expect.poll(() => page.evaluate(() => window.state.appearanceSaving === false)).toBe(true);

  // Give it a moment for images to load
  await page.waitForTimeout(500);

  // Check the state after skin switch
  const after = await page.evaluate(() => {
    const angelicaUnit = window.state.battle.allies.find(u => u.ref === "angelica");
    const target = document.querySelector(`[data-target="${angelicaUnit.uid}"] .unit-art`);
    const img = target?.querySelector("img");
    const activePortrait = document.querySelector(`[data-active-info="${angelicaUnit.uid}"] .portrait`);
    const activeImg = activePortrait?.querySelector("img");

    // Also check all other unit images and skin effects after the switch.
    const allUnitImgs = [...document.querySelectorAll(".unit-art img")];
    const allLoaded = allUnitImgs.every(i => i.complete && i.naturalWidth > 0);
    const entryFx = document.querySelectorAll(".angelica-berserker-entry");

    return {
      battlefieldSrc: img?.getAttribute("src") || "",
      battlefieldClass: target?.className || "",
      battlefieldImgComplete: img?.complete,
      battlefieldImgNaturalWidth: img?.naturalWidth,
      activeSrc: activeImg?.getAttribute("src") || "",
      activeClass: activePortrait?.className || "",
      activeImgComplete: activeImg?.complete,
      activeImgNaturalWidth: activeImg?.naturalWidth,
      allUnitImgsLoaded: allLoaded,
      totalUnitImgs: allUnitImgs.length,
      entryFxCount: entryFx.length,
    };
  });

  console.log("BEFORE:", JSON.stringify(before, null, 2));
  console.log("AFTER:", JSON.stringify(after, null, 2));

  // The skin should have changed
  expect(after.battlefieldSrc).not.toBe(before.battlefieldSrc);
  // The image should be loaded
  expect(after.battlefieldImgComplete).toBe(true);
  expect(after.battlefieldImgNaturalWidth).toBeGreaterThan(0);
  // All unit images should be loaded
  expect(after.allUnitImgsLoaded).toBe(true);
  expect(after.entryFxCount).toBe(0);

  expect(relevantErrors(errors)).toEqual([]);
});
