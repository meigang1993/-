const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startFreshGame,
} = require("./helpers/preview-game");

// 废墟沙城解锁事件的 focused test
// 覆盖：触发 -> 完成 -> 亚缇娜/玛利亚解锁 -> 副本门槛
test("ruins sand city unlock event dispatches completion and unlocks artina and maria", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);

  // 1) 初始：两角色锁定，未解锁
  await expect.poll(() => page.evaluate(() => ({
    artina: !!window.state.chars.find(character => character.id === "artina")?.locked,
    maria: !!window.state.chars.find(character => character.id === "maria")?.locked,
    unlocked: !!window.state.flags.ruinsSandCityUnlocked,
  }))).toEqual({ artina: true, maria: true, unlocked: false });

  // 2) 触发解锁：同一同步块内验证
  //    注意：hallModal 是易失 UI 态，调用 window.render() 会被重置，故此处不 render
  const triggered = await page.evaluate(() => {
    const ok = window.triggerRuinsSandCityUnlockEvent(window.state, {
      missionId: "orc_dungeon",
      difficultyId: "warrior",
      complete: true,
    });
    return {
      ok,
      modal: window.state.hallModal,
      pending: !!window.state.flags.ruinsSandCityUnlockPending,
    };
  });
  expect(triggered).toEqual({
    ok: true,
    modal: "ruinsSandCityUnlock",
    pending: true,
  });

  // 3) 完成解锁（等同点击弹窗按钮）
  await page.evaluate(() => window.completeRuinsSandCityUnlockEvent());

  // 4) 校验持久化结果
  await expect.poll(() => page.evaluate(() => ({
    unlocked: !!window.state.flags.ruinsSandCityUnlocked,
    pending: !!window.state.flags.ruinsSandCityUnlockPending,
    seen: !!window.state.flags.ruinsSandCityUnlockSeen,
    artina: !window.state.chars.find(character => character.id === "artina")?.locked,
    maria: !window.state.chars.find(character => character.id === "maria")?.locked,
    completed: !!window.state.unlockEvents?.completed?.ruins_sand_city,
  }))).toEqual({
    unlocked: true,
    pending: false,
    seen: true,
    artina: true,
    maria: true,
    completed: true,
  });

  expect(relevantErrors(errors)).toEqual([]);
});

// 副本解锁门槛与角色一致
test("ruins sand city mission requires the same unlock flag", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  await startFreshGame(page);
  const mission = await page.evaluate(() => ({
    id: window.GameDataRuinsSandCity?.mission?.id,
    requiresFlag: window.GameDataRuinsSandCity?.mission?.requiresFlag,
  }));
  expect(mission.id).toBe("ruins_sand_city");
  expect(mission.requiresFlag).toBe("ruinsSandCityUnlocked");
  expect(relevantErrors(errors)).toEqual([]);
});
