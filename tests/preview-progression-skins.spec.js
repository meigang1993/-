const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame, expectImagesLoaded,
  openTestBattle,
} = require("./helpers/preview-game");

test("Bertis special art unlocks and equips automatically at level 10", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-view='livingRoom']").click();
  await page.evaluate(() => {
    const bertis = window.state.chars.find(character => character.id === "bertis");
    bertis.locked = false;
    bertis.level = 9;
    window.render();
  });

  await page.locator('[data-active-info="bertis"]').click();
  await page.locator('[data-info-tab="skins"]').click();
  const skinOption = page.locator('[data-equip-skin="bertis_level_10_special"]');
  await expect(skinOption).toBeDisabled();
  await expect(skinOption).toContainText("Lv.10解锁");
  await expect(skinOption.locator("img")).toHaveCount(0);
  await page.locator('[data-info-tab="specialArt"]').click();
  await expect(page.locator(".special-art-lock")).toContainText("Lv.10");
  await expect(page.locator(".special-art-portrait")).toHaveCount(0);

  await page.evaluate(() => {
    window.state.chars.find(character => character.id === "bertis").level = 10;
    window.render();
  });
  const portrait = page.locator(".special-art-portrait");
  await expect(portrait).toHaveAttribute("data-art-src", /bertis-level-10-special/);
  await expectImagesLoaded(portrait.locator("img"));
  const box = await portrait.boundingBox();
  expect(Math.abs(box.width - box.height)).toBeLessThanOrEqual(2);
  await portrait.click();
  await expect(page.locator(".art-zoom")).toBeVisible();
  await expectImagesLoaded(page.locator(".art-zoom img"));
  await page.keyboard.press("Escape");
  await page.locator('[data-info-tab="skins"]').click();
  await expect(skinOption).toBeEnabled();
  await expect(skinOption).toContainText("装备");
  await expectImagesLoaded(skinOption.locator("img"));
  await skinOption.click();
  await expect.poll(() => page.evaluate(() =>
    window.state.equippedSkins.bertis)).toBe("bertis_level_10_special");
  await expect(page.locator(".info-art [data-art-src]"))
    .toHaveAttribute("data-art-src", /bertis-level-10-special/);
  expect(relevantErrors(errors)).toEqual([]);
});

test("Nonoka special art unlocks and equips automatically at level 10", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-view='livingRoom']").click();
  await page.evaluate(() => {
    const nonoka = window.state.chars.find(character => character.id === "nonoka");
    nonoka.locked = false;
    nonoka.level = 9;
    window.render();
  });

  await page.locator('[data-active-info="nonoka"]').click();
  await page.locator('[data-info-tab="skins"]').click();
  const skinOption = page.locator('[data-equip-skin="nonoka_level_10_special"]');
  await expect(skinOption).toBeDisabled();
  await expect(skinOption).toContainText("Lv.10解锁");
  await page.locator('[data-info-tab="specialArt"]').click();
  await expect(page.locator(".special-art-lock")).toContainText("Lv.10");

  await page.evaluate(() => {
    window.state.chars.find(character => character.id === "nonoka").level = 10;
    window.render();
  });
  const portrait = page.locator(".special-art-portrait");
  await expect(portrait).toHaveAttribute("data-art-src", /nonoka-level-10-special/);
  await expectImagesLoaded(portrait.locator("img"));
  await portrait.click();
  await expect(page.locator(".art-zoom")).toBeVisible();
  await expectImagesLoaded(page.locator(".art-zoom img"));
  await page.keyboard.press("Escape");
  await page.locator('[data-info-tab="skins"]').click();
  await expect(skinOption).toBeEnabled();
  await skinOption.click();
  await expect.poll(() => page.evaluate(() =>
    window.state.equippedSkins.nonoka)).toBe("nonoka_level_10_special");
  await expect(page.locator(".info-art [data-art-src]"))
    .toHaveAttribute("data-art-src", /nonoka-level-10-special/);
  expect(relevantErrors(errors)).toEqual([]);
});

test("additional special art unlocks and equips automatically at level 10", async ({ page }) => {
  const errors = collectErrors(page);
  const cases = [
    ["lokar", "lokar_level_10_special", "lokar-level-10-special"],
    ["besta_doll", "besta_doll_level_10_special", "besta-doll-level-10-special"],
    ["manny", "manny_level_10_special", "manny-level-10-special"],
    ["flora", "flora_level_10_special", "flora-level-10-special"],
    ["wendy", "wendy_level_10_special", "wendy-level-10-special"],
  ];
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-view='livingRoom']").click();
  await page.evaluate(ids => {
    ids.forEach(id => {
      const character = window.state.chars.find(item => item.id === id);
      character.locked = false;
      character.level = 9;
    });
    window.render();
  }, cases.map(([id]) => id));

  for (const [charId, skinId, artName] of cases) {
    await page.locator(`[data-active-info="${charId}"]`).click();
    await page.locator('[data-info-tab="skins"]').click();
    const skinOption = page.locator(`[data-equip-skin="${skinId}"]`);
    await expect(skinOption).toBeDisabled();
    await expect(skinOption).toContainText("Lv.10解锁");
    await expect(skinOption.locator("img")).toHaveCount(0);
    await page.locator('[data-info-tab="specialArt"]').click();
    await expect(page.locator(".special-art-lock")).toContainText("Lv.10");

    await page.evaluate(id => {
      window.state.chars.find(character => character.id === id).level = 10;
      window.render();
    }, charId);
    const portrait = page.locator(".special-art-portrait");
    await expect(portrait).toHaveAttribute("data-art-src", new RegExp(artName));
    await expectImagesLoaded(portrait.locator("img"));
    await page.locator('[data-info-tab="skins"]').click();
    await expect(skinOption).toBeEnabled();
    await skinOption.click();
    await expect.poll(() => page.evaluate(id =>
      window.state.equippedSkins[id], charId)).toBe(skinId);
    await expect(page.locator(".info-art [data-art-src]"))
      .toHaveAttribute("data-art-src", new RegExp(artName));
    await page.locator(".info-close").click();
  }
  expect(relevantErrors(errors)).toEqual([]);
});

test("test battle lets Bertis trial special art before level 10", async ({ page }) => {
  test.setTimeout(45000);
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await openTestBattle(page);
  await page.evaluate(() => {
    const bertis = window.state.chars.find(character => character.id === "bertis");
    bertis.locked = false;
    bertis.level = 0;
    window.state.testAllies = ["bertis"];
    window.state.testEnemies = [0];
    window.state.testSkins = {};
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.render();
  });

  const trial = page.locator('[data-test-skin="bertis_level_10_special"]');
  await expect(trial).toBeEnabled();
  await expect(trial).toContainText("Lv.10试用");
  await trial.click();
  await expect.poll(() => page.evaluate(() =>
    window.state.testSkins.bertis || null)).toBe("bertis_level_10_special");

  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await expect(page.locator(".ally-unit .unit-art"))
    .toHaveAttribute("data-art-src", /bertis-level-10-special/);
  await page.evaluate(() => {
    const bertis = window.state.battle.allies.find(unit => unit.ref === "bertis");
    window.state.infoUnit = bertis.uid;
    window.state.infoTab = "skins";
    window.render();
  });
  const trialSkin = page.locator('[data-battle-equip-skin="bertis_level_10_special"]');
  await expect(trialSkin).toContainText("试用中");
  await expectImagesLoaded(trialSkin.locator("img"));
  await expect.poll(() => page.evaluate(() =>
    window.state.testSkins.bertis || null)).toBe("bertis_level_10_special");
  // 试用只写入 testSkins，正式外观与所有权保持不变。
  expect(await page.evaluate(() => window.state.equippedSkins.bertis))
    .toBe("bertis_default");
  expect(await page.evaluate(() =>
    !!window.state.ownedSkins.bertis_level_10_special)).toBe(false);
  await expect(page.locator(".ally-unit .unit-art"))
    .toHaveAttribute("data-art-src", /bertis-level-10-special/);
  expect(relevantErrors(errors)).toEqual([]);
});
