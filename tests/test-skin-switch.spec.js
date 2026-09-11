const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
  openTestBattle,
} = require("./helpers/preview-game");

test("battle skin switch does not corrupt unit artwork", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await openTestBattle(page);
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
  await page.evaluate(() => {
    const angelicaUnit = window.state.battle.allies.find(u => u.ref === "angelica");
    delete angelicaUnit._angelicaBerserkerEntryShown;
    window.render();
  });
  expect(await page.locator(".angelica-berserker-entry").count()).toBe(0);
  expect(await page.locator(".angelica-berserker-entering").count()).toBe(0);

  for (const skinId of ["angelica_level_10_special", "angelica_default", "angelica_berserker"]) {
    await page.locator(`[data-battle-equip-skin="${skinId}"]`).click();
    await page.waitForTimeout(150);
    const transition = await page.evaluate(() => ({
      fx: document.querySelectorAll(".angelica-berserker-fx,.angelica-berserker-line").length,
      entering: document.querySelectorAll(".angelica-berserker-entering").length,
      images: [...document.querySelectorAll(".unit-art img")].every(img =>
        img.complete && img.naturalWidth > 0),
    }));
    expect(transition).toEqual({ fx: 0, entering: 0, images: true });
    await page.waitForTimeout(1250);
  }

  expect(relevantErrors(errors)).toEqual([]);
});

test("switching Besta Doll skin keeps Angelica berserker artwork stable", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.state.testAllies = ["besta_doll", "angelica"];
    window.state.testEnemies = [0];
    window.state.ownedSkins.angelica_berserker = true;
    window.state.testSkins = {
      angelica: "angelica_berserker",
      besta_doll: "besta_doll_default",
    };
    window.state.hallModal = "testBattle";
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.evaluate(() => {
    const battle = window.state.battle;
    battle.animQueue = [];
    battle.locked = false;
    battle.phase = 4;
    battle.activeUid = battle.allies.find(unit => unit.ref === "besta_doll").uid;
    window.BattleEffects.recover(window.state);
    window.render();
  });
  await expect.poll(() => page.evaluate(() =>
    [...document.querySelectorAll(".unit-art img")].every(img => img.complete && img.naturalWidth > 0)
  )).toBe(true);

  await page.evaluate(() => {
    const besta = window.state.battle.allies.find(unit => unit.ref === "besta_doll");
    window.state.infoUnit = besta.uid;
    window.state.infoTab = "skins";
    window.render();
  });
  await expect(page.locator('[data-battle-equip-skin="besta_doll_energy_queen"]')).toBeVisible();

  await page.evaluate(() => {
    const angelica = window.state.battle.allies.find(unit => unit.ref === "angelica");
    const images = [
      document.querySelector(`[data-target="${angelica.uid}"] .unit-art img`),
      document.querySelector(`[data-active-info="${angelica.uid}"] .portrait img`),
    ].filter(Boolean);
    images.forEach((image, index) => { image.__stabilityId = `angelica-${index}`; });
    window.__angelicaSamples = [];
    window.__sampleAngelica = () => {
      const unit = window.state.battle.allies.find(item => item.ref === "angelica");
      const sample = selector => {
        const image = document.querySelector(selector);
        const style = image ? getComputedStyle(image) : null;
        return {
          src: image?.getAttribute("src") || "",
          complete: image?.complete || false,
          width: image?.naturalWidth || 0,
          id: image?.__stabilityId || "",
          opacity: style?.opacity || "",
          filter: style?.filter || "",
          transform: style?.transform || "",
        };
      };
      window.__angelicaSamples.push({
        battlefield: sample(`[data-target="${unit.uid}"] .unit-art img`),
        active: sample(`[data-active-info="${unit.uid}"] .portrait img`),
        entryFx: document.querySelectorAll(".angelica-berserker-entry").length,
        entering: document.querySelectorAll(".angelica-berserker-entering").length,
      });
    };
    window.__sampleAngelica();
  });

  await page.locator('[data-battle-equip-skin="besta_doll_energy_queen"]').click();
  for (const delay of [0, 50, 100, 150, 300, 600, 1000, 1400]) {
    if (delay) await page.waitForTimeout(delay);
    await page.evaluate(() => window.__sampleAngelica());
  }
  const samples = await page.evaluate(() => window.__angelicaSamples);
  console.log("ANGELICA DURING BESTA SWITCH:", JSON.stringify(samples, null, 2));

  const expectedSrc = samples[0].battlefield.src;
  samples.forEach(sample => {
    expect(sample.battlefield.src).toBe(expectedSrc);
    expect(sample.battlefield.id).toBe("angelica-0");
    expect(sample.battlefield.complete).toBe(true);
    expect(sample.battlefield.width).toBeGreaterThan(0);
    expect(sample.battlefield.opacity).toBe("1");
    expect(sample.battlefield.filter).toBe("none");
    expect(sample.entryFx).toBe(0);
    expect(sample.entering).toBe(0);
  });
  expect(relevantErrors(errors)).toEqual([]);
});
