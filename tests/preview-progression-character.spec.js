const { test, expect } = require("@playwright/test");
const {
  openGame, startFreshGame,
} = require("./helpers/preview-game");

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
