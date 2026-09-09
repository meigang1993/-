const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

test("Angelica Imperial Blood Slaying renders battle effects and victory scene", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  await page.locator("[data-open-modal='team']").first().click();
  await page.getByRole("button", { name: "测试战斗" }).click();
  await page.locator("[data-test-ally='angelica']").click();
  await page.evaluate(() => {
    window.state.ownedSkins.angelica_berserker = true;
    window.state.testSkins.angelica = "angelica_berserker";
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
    battle.activeUid = battle.allies.find(unit => unit.ref === "angelica").uid;
    window.BattleEffects.recover(window.state);
    window.render();
  });
  await expect(page.locator(".unit-art img").first()).toBeVisible();

  const effectCounts = await page.evaluate(() => {
    const state = window.state;
    const battle = state.battle;
    const actor = battle.allies.find(unit => unit.ref === "angelica");
    const target = battle.enemies[0];
    window.AngelicaBerserkerSkinFX.cancel();
    window.AngelicaBerserkerSkinFX.entry(state, actor);
    window.AngelicaBerserkerSkinFX.might(state, actor, { type: "slash" });
    window.AngelicaBerserkerSkinFX.rageGain(state, actor, true);
    window.AngelicaBerserkerSkinFX.rageSpend(state, actor, 4);
    window.AngelicaBerserkerSkinFX.rageTrail(state, actor, target);
    window.AngelicaBerserkerSkinFX.taunt(state, actor);
    return {
      entry: document.querySelectorAll(".angelica-berserker-entry").length,
      might: document.querySelectorAll(".angelica-berserker-might").length,
      rageGain: document.querySelectorAll(".angelica-berserker-rage-gain").length,
      rageSpend: document.querySelectorAll(".angelica-berserker-rage-slam").length,
      rageTrail: document.querySelectorAll(".angelica-berserker-rage-trail").length,
      taunt: document.querySelectorAll(".angelica-berserker-taunt").length,
      warweb: document.querySelectorAll(".angelica-berserker-warweb").length,
      entering: document.querySelectorAll(".angelica-berserker-entering").length,
    };
  });
  expect(effectCounts).toMatchObject({
    entry: 1, might: 1, rageGain: 1, rageSpend: 1, rageTrail: 1, taunt: 1, warweb: 1,
  });
  expect(effectCounts.entering).toBe(1);

  await page.evaluate(() => {
    window.AngelicaBerserkerSkinFX.cancel();
    window.state.battle.victoryScreen = true;
    window.state.battle.locked = true;
    window.render();
  });
  await expect(page.locator(".victory-screen.angelica-berserker-victory")).toBeVisible();
  await expect(page.locator(".angelica-berserker-victory-art img")).toBeVisible();
  await expect(page.locator(".angelica-victory-embers i")).toHaveCount(5);
  await expect(page.locator(".angelica-victory-motto")).toHaveText("帝血未冷，下一场继续。");

  const layout = await page.evaluate(() => {
    const screen = document.querySelector(".victory-screen");
    const stats = document.querySelector(".victory-stats");
    const art = document.querySelector(".angelica-berserker-victory-show");
    return {
      horizontalOverflow: screen.scrollWidth - screen.clientWidth,
      verticalOverflow: screen.scrollHeight - screen.clientHeight,
      statsVisible: stats.getBoundingClientRect().width > 0,
      artVisible: art.getBoundingClientRect().width > 0,
    };
  });
  expect(layout).toEqual({
    horizontalOverflow: 0,
    verticalOverflow: 0,
    statsVisible: true,
    artVisible: true,
  });
  expect(relevantErrors(errors)).toEqual([]);
});
