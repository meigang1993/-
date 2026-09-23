const { test, expect } = require("@playwright/test");
const {
  collectErrors, relevantErrors, openGame, startRegressionBattle,
} = require("./helpers/preview-game");

test("fatal targets keep their hand until the death feedback finishes", async ({ page }) => {
  await startRegressionBattle(page);
  const results = await page.evaluate(() => {
    const battle = window.state.battle;
    battle.test = false;
    return ["ally", "enemy"].flatMap(side => ["damage", "hp-loss"].map(kind => {
      const target = side === "ally" ? battle.allies[0] : battle.enemies[0];
      target.hp = 0;
      target.hand = [{ name: `${side}-${kind}`, type: "tactic" }];
      target.deathDiscarded = false;
      battle.animQueue = [{ type: "float", kind, uid: target.uid, visualHp: 0 }];
      window.BattleSystem.checkDefeat(window.state);
      const during = {
        hand: target.hand.length,
        discarded: !!target.deathDiscarded,
      };
      battle.animQueue = [];
      window.BattleSystem.checkDefeat(window.state);
      const after = {
        hand: target.hand.length,
        discarded: !!target.deathDiscarded,
      };
      target.hp = 10;
      battle.failedTriggered = false;
      battle.pendingDefeat = false;
      battle.locked = false;
      return { side, kind, during, after };
    }));
  });
  expect(results).toEqual([
    { side: "ally", kind: "damage", during: { hand: 1, discarded: false }, after: { hand: 0, discarded: true } },
    { side: "ally", kind: "hp-loss", during: { hand: 1, discarded: false }, after: { hand: 0, discarded: true } },
    { side: "enemy", kind: "damage", during: { hand: 1, discarded: false }, after: { hand: 0, discarded: true } },
    { side: "enemy", kind: "hp-loss", during: { hand: 1, discarded: false }, after: { hand: 0, discarded: true } },
  ]);
});

test("Overlord resistance pays two cards before cleansing a status", async ({ page }) => {
  const errors = collectErrors(page);
  await openGame(page);
  const result = await page.evaluate(() => {
    const elite = {
      uid: "overlord-resistance-test",
      side: "enemy",
      type: "elite",
      name: "测试精英",
      skills: [{ name: "霸王色抗性" }],
      hand: [],
      deck: [],
      discard: [],
      consumed: [],
      statuses: [],
    };
    const testState = {
      log: [],
      battle: {
        allies: [],
        enemies: [elite],
        animQueue: [],
        played: [],
      },
    };
    const battle = testState.battle;
    const clearPiles = () => {
      elite.deck.length = 0;
      elite.discard.length = 0;
      elite.consumed.length = 0;
      battle.animQueue = [];
      battle.played = [];
      testState.log = [];
    };
    clearPiles();
    elite.hand = [
      window.BattleStatusCards.create("stun"),
      { name: "抗性费用A", suit: "♥", type: "tactic" },
      { name: "抗性费用B", suit: "♦", type: "response" },
    ];
    const paid = window.BattleStatusCards.resolveResistance(testState, elite);
    const discardEvent = battle.animQueue.find(event =>
      event.type === "discardBatch");
    const paidResult = {
      paid,
      hand: elite.hand.map(card => card.name),
      discard: elite.discard.map(card => card.name),
      consumed: elite.consumed.map(card => card.name),
      queue: battle.animQueue.map(event => event.type),
      discardEvent: {
        toPublic: discardEvent?.toPublic,
        cards: discardEvent?.cards.map(card => card.name) || [],
      },
      publicCards: battle.played.map(card => ({
        name: card.name,
        action: card._playedAction,
        pile: card._destinationPile,
      })),
      log: testState.log.find(message => message.includes("霸王色抗性")) || "",
    };
    clearPiles();
    elite.hand = [
      window.BattleStatusCards.create("stun"),
      { name: "仅一张费用", suit: "♥", type: "response" },
    ];
    elite.deck.push({ name: "黑色判定", suit: "♠", type: "tactic" });
    elite.skipPlayPhase = false;
    const unpaid = window.BattleStatusCards.resolveResistance(testState, elite);
    window.BattleStatusCards.judgement(testState, elite);
    return {
      paid: paidResult,
      unpaid: {
        paid: unpaid,
        hand: elite.hand.map(card => card.name),
        consumed: elite.consumed.map(card => card.name),
        queue: battle.animQueue.map(event => event.type),
        skipPlayPhase: elite.skipPlayPhase,
      },
    };
  });
  expect(result.paid).toEqual({
    paid: true,
    hand: [],
    discard: ["抗性费用A", "抗性费用B"],
    consumed: ["眩晕"],
    queue: ["discardBatch", "burnCard"],
    discardEvent: {
      toPublic: true,
      cards: ["抗性费用A", "抗性费用B"],
    },
    publicCards: [
      { name: "抗性费用B", action: "弃置了", pile: "discard" },
      { name: "抗性费用A", action: "弃置了", pile: "discard" },
    ],
    log: expect.stringContaining("弃置抗性费用A、抗性费用B，移除眩晕状态牌"),
  });
  expect(result.unpaid).toEqual({
    paid: false,
    hand: ["眩晕", "仅一张费用"],
    consumed: [],
    queue: ["judgement"],
    skipPlayPhase: true,
  });
  expect(relevantErrors(errors)).toEqual([]);
});
