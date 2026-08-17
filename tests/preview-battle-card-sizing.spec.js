const { test, expect } = require("@playwright/test");
const { startRegressionBattle } = require("./helpers/preview-game");

test("displayed battle cards keep one bounded size across reveal surfaces", async ({ page }) => {
  await page.setViewportSize({ width: 809, height: 483 });
  await startRegressionBattle(page);
  const sizes = await page.evaluate(() => {
    const battle = window.state.battle;
    const actor = battle.enemies[0];
    const target = battle.allies[0];
    target.hand = [
      { name: "展示牌一", suit: "♥", type: "response", text: "展示测试。" },
      { name: "展示牌二", suit: "♦", type: "tactic", text: "展示测试。" },
      { name: "展示牌三", suit: "♣", type: "slash", text: "展示测试。" },
    ];
    battle.handReveal = {
      actorUid: actor.uid,
      targetUid: target.uid,
      cardName: "魔弹特攻",
      card: { name: "魔弹特攻", type: "tactic", magicBullet: true },
      mode: "magicBulletReveal",
    };
    battle.locked = true;
    window.render();
    const read = selector => [...document.querySelectorAll(selector)]
      .map(element => {
        const rect = element.getBoundingClientRect();
        return [
          element.offsetWidth || Math.round(rect.width),
          element.offsetHeight || Math.round(rect.height),
        ];
      });
    const hand = {
      buttons: read(".response-hand-panel .hand-response-card"),
      cards: read(".response-hand-panel .hand-response-card .play-card"),
    };
    battle.handReveal = null;
    battle.revealCards = {
      id: "display-size-reveal",
      title: "展示测试",
      cards: [
        { name: "展示牌一", suit: "♥", type: "response", text: "展示测试。" },
      ],
    };
    window.render();
    return {
      hand,
      reveal: {
        wraps: read(".reveal-card-wrap"),
        cards: read(".reveal-card-wrap .play-card"),
      },
    };
  });
  expect(sizes.hand.buttons).toHaveLength(3);
  expect(new Set(sizes.hand.buttons.map(size => size.join("x"))).size).toBe(1);
  expect(sizes.hand.cards).toEqual(sizes.hand.buttons);
  expect(sizes.hand.buttons[0][0]).toBe(104);
  expect(sizes.hand.buttons[0][1]).toBeGreaterThan(0);
  expect(sizes.reveal.wraps).toEqual([[88, 132]]);
  expect(sizes.reveal.cards).toEqual([[88, 132]]);
});
