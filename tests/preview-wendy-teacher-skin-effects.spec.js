const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

test("Wendy Benevolent Teacher renders dedicated effects and victory summary", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.state.testAllies = ["wendy", "flora"];
    window.state.testEnemies = [0];
    window.SkinSystem.testEquip(window.state, "wendy", "wendy_benevolent_teacher");
    window.state.hallModal = "testBattle";
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await expect(page.locator(".ally-unit .skin-effect-wendy-teacher")).toHaveCount(1);

  await page.evaluate(() => {
    const battle = window.state.battle;
    const wendy = battle.allies.find(unit => unit.ref === "wendy");
    const flora = battle.allies.find(unit => unit.ref === "flora");
    window.WendySkills.afterCardPlayed(window.state, flora,
      { name: "战术回归", type: "tactic" }, {
        draw(unit) {
          const card = { name: "教师摸牌回归", type: "tactic" };
          unit.hand.push(card);
          return [card];
        },
      });
    window.WendySkills.afterDiscard(window.state, wendy, [{}, {}], {
      pushFloat() {},
    });
    window.WendySkills.tutor(window.state, wendy);
    const tactic = window.WendySkills.tutorPool(window.state)[0];
    window.WendySkills.chooseTutorCard(window.state, tactic.name);
    window.WendySkills.chooseTutorCard(window.state, null, flora.uid);
    battle.performance[wendy.uid].damage = 18;
    battle.victoryScreen = true;
    battle.locked = true;
    window.render();
  });
  await expect(page.locator(".wendy-teacher-victory")).toBeVisible();
  await expect(page.locator(".wendy-teacher-board b")).toHaveText("下课");
  await expect(page.locator(".wendy-teacher-summary")).toContainText("伤害 18");
  await expect(page.locator(".wendy-teacher-summary")).toContainText("护甲 3");
  await expect(page.locator(".wendy-teacher-summary")).toContainText("摸牌 1");
  const overflow = await page.locator(".victory-screen").evaluate(element => ({
    x: element.scrollWidth - element.clientWidth,
    y: element.scrollHeight - element.clientHeight,
  }));
  expect(overflow.x).toBeLessThanOrEqual(1);
  expect(overflow.y).toBeLessThanOrEqual(1);
  expect(relevantErrors(errors)).toEqual([]);
});

test("Wendy teacher effects stop immediately after equipping the default skin", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.evaluate(() => {
    window.GameAssets.preloadBattle = async () => {};
    window.BattleEffects.whenIdle = async () => {};
    window.BattleFX.playBattleStart = callback => callback?.();
    window.state.testAllies = ["wendy", "flora"];
    window.state.testEnemies = [0];
    window.SkinSystem.testEquip(window.state, "wendy", "wendy_benevolent_teacher");
    window.state.hallModal = "testBattle";
    window.render();
  });
  await page.locator("[data-start-test-battle]").click();
  await expect(page.locator(".battle-screen")).toBeVisible();
  await page.evaluate(() => {
    const battle = window.state.battle;
    const wendy = battle.allies.find(unit => unit.ref === "wendy");
    window.state.infoUnit = wendy.uid;
    window.state.infoTab = "skins";
    window.GameStore.saveSettings = async settings => settings;
    window.render();
    window.WendyTeacherSkinFX.answer(window.state, wendy, battle.enemies[0]);
  });
  await expect(page.locator(".wendy-teacher-fx,.wendy-teacher-line")).not.toHaveCount(0);
  await page.locator('[data-battle-equip-skin="wendy_default"]').click();
  await expect.poll(() => page.evaluate(() => {
    const wendy = window.state.battle.allies.find(unit => unit.ref === "wendy");
    return window.WendyTeacherSkinFX.active(wendy);
  })).toBe(false);
  await expect(page.locator(".wendy-teacher-fx,.wendy-teacher-line")).toHaveCount(0);
  await expect(page.locator(".skin-effect-wendy-teacher")).toHaveCount(0);
  expect(relevantErrors(errors)).toEqual([]);
});
