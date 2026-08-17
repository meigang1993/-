const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

async function expectImagesLoaded(locator) {
  await expect.poll(() => locator.evaluateAll(images =>
    images.length > 0 && images.every(image => image.complete
      && image.naturalWidth > 0 && image.naturalHeight > 0))).toBe(true);
}

test("living room character details preserve page scroll after closing", async ({ page }) => {
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-view='livingRoom']").click();
  await page.evaluate(() => {
    window.state.chars.forEach(character => { character.locked = false; });
    window.render();
  });
  const scroller = page.locator(".villa-page-scroll");
  await scroller.evaluate(element => { element.scrollTop = element.scrollHeight; });
  const before = await scroller.evaluate(element => element.scrollTop);
  await page.locator(".living-room-card").last().click();
  await page.locator(".info-close").click();
  await expect.poll(() => scroller.evaluate(element => element.scrollTop))
    .toBeGreaterThanOrEqual(before - 2);
});

test("compact landscape skill panels stay inside the dialog and scroll internally", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 420 });
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-view='livingRoom']").click();
  await page.evaluate(() => {
    window.state.chars.forEach(character => { character.locked = false; });
    window.render();
  });
  await page.locator('[data-active-info="aileng"]').click();
  await page.locator('[data-info-tab="skills"]').click();

  const geometry = await page.evaluate(() => {
    const popup = document.querySelector(".info-popup");
    const section = popup?.querySelector("section");
    const popupRect = popup.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    return {
      sectionTop: sectionRect.top,
      sectionBottom: sectionRect.bottom,
      popupTop: popupRect.top,
      popupBottom: popupRect.bottom,
      scrollable: section.scrollHeight > section.clientHeight,
      rootOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
        || document.documentElement.scrollHeight > document.documentElement.clientHeight,
    };
  });
  expect(geometry.sectionTop).toBeGreaterThanOrEqual(geometry.popupTop);
  expect(geometry.sectionBottom).toBeLessThanOrEqual(geometry.popupBottom);
  expect(geometry.scrollable).toBe(true);
  expect(geometry.rootOverflow).toBe(false);
});

test("all playable character skill panels render complete readable content", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize({ width: 800, height: 420 });
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-view='livingRoom']").click();
  const characters = await page.evaluate(() => {
    window.state.chars.forEach(character => { character.locked = false; });
    window.render();
    return window.state.chars.map(character => ({ id: character.id, name: character.name }));
  });

  for (const character of characters) {
    await page.locator(`[data-active-info="${character.id}"]`).click();
    await page.locator('[data-info-tab="skills"]').click();
    const audit = await page.evaluate(characterId => {
      const skills = [...document.querySelectorAll(".skill-detail")];
      const character = window.state.chars.find(item => item.id === characterId);
      const expected = window.UICommon.skillsOf(character);
      const section = document.querySelector(".info-popup section");
      const popup = document.querySelector(".info-popup");
      const textOverflow = skills.some(skill => {
        const paragraph = skill.querySelector("p");
        return paragraph && paragraph.scrollWidth > paragraph.clientWidth;
      });
      return {
        rendered: skills.length,
        expected: expected?.filter(skill => skill.showInSkillInfo !== false).length ?? 0,
        missingName: skills.some(skill => !skill.querySelector(".skill em")?.textContent.trim()),
        missingText: skills.some(skill => !skill.querySelector("p")?.textContent.trim()),
        missingIcon: skills.some(skill => !skill.querySelector(".skill span")?.textContent.trim()),
        textOverflow,
        sectionInsidePopup: section.getBoundingClientRect().bottom
          <= popup.getBoundingClientRect().bottom + 1,
        sectionScrollable: section.scrollHeight > section.clientHeight,
        rootOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
          || document.documentElement.scrollHeight > document.documentElement.clientHeight,
      };
    }, character.id);
    expect(audit.rendered, `${character.id} skill count`).toBeGreaterThan(0);
    expect(audit.expected, `${character.id} expected skill count`).toBe(audit.rendered);
    expect(audit.missingName, `${character.id} skill name`).toBe(false);
    expect(audit.missingText, `${character.id} skill text`).toBe(false);
    expect(audit.missingIcon, `${character.id} skill icon`).toBe(false);
    expect(audit.textOverflow, `${character.id} text overflow`).toBe(false);
    expect(audit.sectionInsidePopup, `${character.id} section bounds`).toBe(true);
    if (audit.sectionScrollable) {
      await page.locator(".info-popup section").evaluate(section => {
        section.scrollTop = section.scrollHeight;
      });
      await expect(page.locator(".skill-detail").last()).toBeVisible();
    }
    expect(audit.rootOverflow, `${character.id} root overflow`).toBe(false);
    await page.locator(".info-close").click();
  }
});

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
      await expect(page.locator(".role-position")).toHaveCount(1);
      await expect(page.locator(".growth-table")).toContainText("0级");
      await expect(page.locator(".growth-table")).toContainText("15级");
    }

    await page.locator('[data-info-tab="skills"]').click();
    await expect(page.locator('[data-info-tab="skills"]')).toHaveClass(/active/);
    await expect(page.locator(".skill-detail").first()).toBeVisible();
    if (character.id === "lokar") {
      await expect(page.locator(".role-position")).toHaveCount(0);
    }

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

test("Manny, Flora, and Wendy special art unlocks and equips automatically at level 10", async ({ page }) => {
  const errors = collectErrors(page);
  const cases = [
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

test("test battle keeps Bertis special art locked before level 10", async ({ page }) => {
  test.setTimeout(45000);
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
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
  await expect(trial).toBeDisabled();
  await expect(trial).toContainText("Lv.10解锁");
  await expect.poll(() => page.evaluate(() =>
    window.state.testSkins.bertis || null)).toBe(null);

  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await expect(page.locator(".ally-unit .unit-art"))
    .toHaveAttribute("data-art-src", /bertis-portrait/);
  await page.evaluate(() => {
    const bertis = window.state.battle.allies.find(unit => unit.ref === "bertis");
    window.state.infoUnit = bertis.uid;
    window.state.infoTab = "skins";
    window.render();
  });
  const lockedSkin = page.locator('[data-battle-equip-skin="bertis_level_10_special"]');
  await expect(lockedSkin).toBeDisabled();
  await expect(lockedSkin).toContainText("Lv.10解锁");
  await expect(lockedSkin.locator("img")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() =>
    window.state.testSkins.bertis || null)).toBe(null);
  expect(await page.evaluate(() => window.state.equippedSkins.bertis))
    .toBe("bertis_default");
  await expect(page.locator(".ally-unit .unit-art"))
    .toHaveAttribute("data-art-src", /bertis-portrait/);
  expect(await page.evaluate(() => window.state.equippedSkins.bertis))
    .toBe("bertis_default");
  expect(relevantErrors(errors)).toEqual([]);
});
