const { test, expect } = require("@playwright/test");
const { startRegressionBattle } = require("./helpers/preview-game");

test("play-phase draws follow the newest hand card", async ({ page }) => {
  await startRegressionBattle(page);
  await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = window.BattleSystem.active(battle);
    actor.hand = Array.from({ length: 14 }, (_, index) => ({
      name: `测试牌${index + 1}`,
      suit: index % 2 ? "♣" : "♥",
      type: "tactic",
    }));
    window.render();
    const hand = document.querySelector(".active-hand");
    hand.scrollLeft = 0;
    actor.hand.push({
      name: "新摸到的牌", suit: "♦", type: "tactic", _pendingDraw: true,
    });
    window.render();
    delete actor.hand.at(-1)._pendingDraw;
    window.render();
  });
  await expect.poll(() => page.locator(".active-hand").evaluate(hand => ({
    scrollable: hand.scrollWidth > hand.clientWidth,
    atNewest: hand.scrollWidth - hand.clientWidth - hand.scrollLeft < 3,
  }))).toEqual({ scrollable: true, atNewest: true });
});
