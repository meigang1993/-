const { test, expect } = require("@playwright/test");
const { startRegressionBattle } = require("./helpers/preview-game");

test("Gerda Comfort accepts a female target and keeps decline interactive", async ({ page }) => {
  await startRegressionBattle(page);

  const ids = await page.evaluate(async () => {
    const battle = window.state.battle;
    const gerda = battle.allies[0];
    const target = battle.allies[1];
    gerda.ref = "gerda";
    gerda.skills = [{ name: "萌虎慰劳" }];
    gerda.stats.handLimit = 99;
    target.gender = "female";
    battle.activeUid = gerda.uid;
    battle.phase = 5;
    battle.locked = false;
    window.BattleActionGuard.reset();
    await window.BattleSystem.confirmDiscard(window.state, window.render);
    window.render();
    return { gerda: gerda.uid, target: target.uid };
  });

  const target = page.locator(`[data-target="${ids.target}"]`);
  const decline = page.locator("[data-gerda-comfort-skip]");
  await expect(target).toHaveClass(/selectable-target/);
  await expect(decline).toBeVisible();
  await expect.poll(() => page.evaluate(() => ({
    row: getComputedStyle(document.querySelector(".ally-row")).pointerEvents,
    prompt: getComputedStyle(document.querySelector("[data-gerda-comfort-skip]").parentElement).pointerEvents,
  }))).toEqual({ row: "auto", prompt: "auto" });

  await decline.click();
  await expect(page.locator("[data-gerda-comfort-skip]")).toHaveCount(0);
  const hands = await page.evaluate(async ids => {
    const battle = window.state.battle;
    const gerda = battle.allies.find(unit => unit.uid === ids.gerda);
    const target = battle.allies.find(unit => unit.uid === ids.target);
    battle.activeUid = ids.gerda;
    battle.phase = 5;
    battle.locked = false;
    delete battle.endPhaseStep;
    delete battle.endPhaseUnitUid;
    await window.BattleSystem.confirmDiscard(window.state, window.render);
    window.render();
    return { gerda: gerda.hand.length, target: target.hand.length };
  }, ids);
  await target.click();
  await expect(page.locator("[data-gerda-comfort-skip]")).toHaveCount(0);
  const afterHands = await page.evaluate(ids => {
    const battle = window.state.battle;
    return {
      gerda: battle.allies.find(unit => unit.uid === ids.gerda).hand.length,
      target: battle.allies.find(unit => unit.uid === ids.target).hand.length,
    };
  }, ids);
  expect(afterHands.gerda).toBeGreaterThanOrEqual(hands.gerda + 2);
  expect(afterHands.target).toBeGreaterThanOrEqual(hands.target + 2);
});
