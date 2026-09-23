const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame, expectImagesLoaded,
} = require("./helpers/preview-game");

test("Flora default portrait uses the uploaded square artwork", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-view='livingRoom']").click();
  await page.evaluate(() => {
    const flora = window.state.chars.find(character => character.id === "flora");
    flora.locked = false;
    window.SkinSystem.ensure(window.state);
    window.render();
  });
  const cardImage = page.locator('[data-active-info="flora"] img');
  await expect(cardImage).toHaveAttribute("src", /flora-portrait\.71c5d516\.webp/);
  await expectImagesLoaded(cardImage);
  expect(await cardImage.evaluate(image => ({
    width: image.naturalWidth,
    height: image.naturalHeight,
  }))).toEqual({ width: 1024, height: 1024 });
  await page.locator('[data-active-info="flora"]').click();
  const detailImage = page.locator(".info-art img");
  await expect(detailImage).toHaveAttribute("src", /flora-portrait\.71c5d516\.webp/);
  await expectImagesLoaded(detailImage);
  expect(relevantErrors(errors)).toEqual([]);
});

test("representative living-room portraits and character panels remain usable", async ({ page }) => {
  test.setTimeout(45000);
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-view='livingRoom']").click();
  const characters = await page.evaluate(() => {
    window.state.chars.forEach(character => { character.locked = false; });
    window.SkinSystem.ensure(window.state);
    window.render();
    return window.state.chars.map(character => ({
      id: character.id,
      name: character.name,
      hasSkins: window.SkinSystem.forChar(character.id).length > 0,
    }));
  });
  await expect(page.getByRole("heading", { name: "别墅客厅" })).toBeVisible();
  await expect(page.locator(".living-room-card")).toHaveCount(characters.length);
  expect(await page.locator(".living-room-card").evaluateAll(cards =>
    cards.map(card => card.dataset.activeInfo)))
    .toEqual(characters.map(character => character.id));
  await expect(page.locator("[data-upgrade],[data-stat],[data-recommend-stat],[data-reset]"))
    .toHaveCount(0);

  const sampleIds = ["lokar", "wendy", "hoshino_kaiichi"];
  const samples = sampleIds.map(id => characters.find(character => character.id === id));
  expect(samples.every(Boolean)).toBe(true);
  expect(samples.some(character => character.hasSkins)).toBe(true);
  expect(samples.some(character => !character.hasSkins)).toBe(true);
  for (const character of samples) {
    const card = page.locator(`[data-active-info="${character.id}"]`);
    await card.scrollIntoViewIfNeeded();
    await expectImagesLoaded(card.locator("img"));
    await card.focus();
    await page.keyboard.press("Enter");

    const overlay = page.locator(".info-overlay");
    await expect(overlay).toHaveAttribute("aria-label", `${character.name}角色详情`);
    await expect(page.locator(".growth-table > div")).toHaveCount(5);
    await expectImagesLoaded(page.locator(".info-art img"));
    if (character.id === "lokar") {
      await expect(page.locator(".info-title-row .combat-role")).toHaveCount(1);
      await expect(page.locator(".info-popup")).toContainText("成长倾向");
      await expect(page.locator(".growth-table")).toContainText("0级");
      await expect(page.locator(".growth-table")).toContainText("20级");
    }

    await page.locator('[data-info-tab="skills"]').click();
    await expect(page.locator('[data-info-tab="skills"]')).toHaveClass(/active/);
    await expect(page.locator(".skill-detail").first()).toBeVisible();
    await page.locator('[data-info-tab="relics"]').click();
    await expect(page.locator(".relic-slot")).toHaveCount(2);

    if (character.hasSkins) {
      await page.locator('[data-info-tab="skins"]').click();
      const skinCount = await page.evaluate(id => window.SkinSystem.forChar(id).length, character.id);
      await expect(page.locator(".battle-skin-option")).toHaveCount(skinCount);
      await expectImagesLoaded(page.locator(".battle-skin-option img"));
    }

    await page.locator('[data-info-tab="stats"]').click();
    await page.locator(".info-art [data-art-src]").click();
    await expect(page.locator(".art-zoom")).toBeVisible();
    await expectImagesLoaded(page.locator(".art-zoom img"));
    await page.keyboard.press("Escape");
    await expect(page.locator(".art-zoom")).toHaveCount(0);
    await expect(overlay).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(overlay).toHaveCount(0);
    await expect(card).toBeFocused();
  }

  const rootOverflow = await page.evaluate(() =>
    document.documentElement.scrollHeight > document.documentElement.clientHeight
    || document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(rootOverflow).toBe(false);
  expect(relevantErrors(errors)).toEqual([]);
});

test("living-room character panel equips skins and relics", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-view='livingRoom']").click();
  await page.evaluate(() => {
    window.state.ownedSkins.lokar_motherbound = true;
    window.state.resources.relics = ["母亲照片"];
    window.render();
  });

  await page.locator('[data-active-info="lokar"]').click();
  await page.locator('[data-info-tab="skins"]').click();
  await page.locator('[data-equip-skin="lokar_motherbound"]').click();
  await expect.poll(() => page.evaluate(() =>
    window.state.equippedSkins.lokar)).toBe("lokar_motherbound");
  await expect(page.locator(".info-art [data-art-src]"))
    .toHaveAttribute("data-art-src", /lokar-motherbound-refined-bg/);

  await page.locator('[data-info-tab="relics"]').click();
  await page.locator('[data-relic-slot="0"]').click();
  await page.locator('[data-relic-pool-item="母亲照片"]').click();
  await expect.poll(() => page.evaluate(() =>
    window.state.equipment.lokar?.[0])).toBe("母亲照片");
  await page.locator('[data-relic-slot="0"]').click();
  await expect.poll(() => page.evaluate(() =>
    window.state.equipment.lokar?.[0] || null)).toBe(null);

  await page.locator(".info-overlay").click({ position: { x: 5, y: 5 } });
  await expect(page.locator(".info-overlay")).toHaveCount(0);
  await page.locator("[data-view='hall']").click();
  await expect(page.locator(".villa-hall")).toBeVisible();
});
