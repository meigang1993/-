const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

// 废墟沙城解锁事件的 focused test
// 覆盖：触发 -> 弹窗 -> 完成 -> 亚缇娜/玛利亚解锁 -> 副本开放
test("ruins sand city unlock event dispatches completion and unlocks artina and maria", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);

  // 解锁前：两角色均为锁定，且未标记
  await expect.poll(() => page.evaluate(() => ({
    artina: !!window.state.chars.find(character => character.id === "artina")?.locked,
    maria: !!window.state.chars.find(character => character.id === "maria")?.locked,
    unlocked: !!window.state.flags.ruinsSandCityUnlocked,
  }))).toEqual({ artina: true, maria: true, unlocked: false });

  // 模拟通关兽人地下城·勇士级（真实入口）
  await page.evaluate(() => {
    window.triggerRuinsSandCityUnlockEvent(window.state, {
      missionId: "orc_dungeon",
      difficultyId: "warrior",
      complete: true,
    });
    window.render();
  });
  await expect.poll(() => page.evaluate(() => window.state.hallModal)).toBe("ruinsSandCityUnlock");
  await expect.poll(() => page.evaluate(() =>
    !!window.state.flags.ruinsSandCityUnlockPending)).toBe(true);

  // 完成解锁（真实全局函数，等同点击弹窗按钮）
  await page.evaluate(() => window.completeRuinsSandCityUnlockEvent());

  await expect.poll(() => page.evaluate(() => ({
    unlocked: !!window.state.flags.ruinsSandCityUnlocked,
    pending: !!window.state.flags.ruinsSandCityUnlockPending,
    seen: !!window.state.flags.ruinsSandCityUnlockSeen,
    artina: !window.state.chars.find(character => character.id === "artina")?.locked,
    maria: !window.state.chars.find(character => character.id === "maria")?.locked,
    completed: !!window.state.unlockEvents?.completed?.ruins_sand_city,
    modal: window.state.hallModal,
  }))).toEqual({
    unlocked: true,
    pending: false,
    seen: true,
    artina: true,
    maria: true,
    completed: true,
    modal: null,
  });

  expect(relevantErrors(errors)).toEqual([]);
});

// 副本解锁门槛与角色一致
test("ruins sand city mission requires the same unlock flag", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  const mission = await page.evaluate(() => window.GameDataRuinsSandCity?.mission);
  expect(mission?.id).toBe("ruins_sand_city");
  expect(mission?.requiresFlag).toBe("ruinsSandCityUnlocked");
  expect(relevantErrors(errors)).toEqual([]);
});
