const {
  assert, GameEconomy, ServerCore, state,
} = require("./local-core-test-harness");

require("../src/original/shop.js");

function setConfirmedStock(current, name = "伤口处理", suit = "♥") {
  const card = window.GameData.eliteCards.find(item => item.name === name);
  current.unlockedShopCards = [name];
  current.shopAuthorityVersion = 1;
  current.shopCards = Array.from({ length: GameEconomy.shop.stockSize }, () => ({
    card: { ...card, suit }, sold: false,
  }));
}

async function testShopRefreshFailsClosed() {
  const current = state();
  current.unlockedShopCards = ["毒杀", "伤口处理"];
  current.shopCards = [{
    card: { name: "伤口处理", suit: "♥", price: 400 },
    sold: true,
  }];
  const before = JSON.parse(JSON.stringify(current.shopCards));
  const call = window.ServerCore.call;
  window.ServerCore.call = async () => ({
    ok: false, changed: false, message: "模拟刷新失败", result: null,
  });
  try {
    assert.strictEqual(await window.ShopSystem.refresh(current), false,
      "a rejected shop refresh must report failure");
  } finally {
    window.ServerCore.call = call;
  }
  assert.deepStrictEqual(current.shopCards, before,
    "a rejected shop refresh must preserve the last confirmed stock");
  const authority = current.shopAuthorityVersion;
  window.ServerCore.call = async () => ({
    ok: true, changed: true, message: "模拟未写回成功", result: null,
  });
  try {
    assert.strictEqual(await window.ShopSystem.refresh(current), false,
      "a successful-looking response without a new authority revision must fail closed");
  } finally {
    window.ServerCore.call = call;
  }
  assert.strictEqual(current.shopAuthorityVersion, authority);
  assert.deepStrictEqual(current.shopCards, before,
    "an unapplied successful-looking refresh must preserve confirmed stock");
  const handle = window.LocalCore.handle;
  current.random = window.GameRandom.create(12345);
  const randomBefore = JSON.stringify(current.random);
  window.LocalCore.handle = (...args) => {
    const result = handle(...args);
    if (args[0] === "shopRefresh") result.core.shopAuthorityVersion = authority;
    return result;
  };
  try {
    assert.strictEqual(await window.ShopSystem.refresh(current), false,
      "a partial core response with changed stock and stale authority must fail closed");
  } finally {
    window.LocalCore.handle = handle;
  }
  assert.deepStrictEqual(current.shopCards, before,
    "a rejected partial core response must not apply its inventory");
  assert.strictEqual(JSON.stringify(current.random), randomBefore,
    "a rejected partial core response must not advance applied randomness");
  window.LocalCore.handle = (...args) => {
    const result = handle(...args);
    if (args[0] === "shopRefresh") result.core.shopCards.pop();
    return result;
  };
  try {
    assert.strictEqual(await window.ShopSystem.refresh(current), false,
      "a core response with a newer authority but incomplete stock must fail closed");
  } finally {
    window.LocalCore.handle = handle;
  }
  assert.strictEqual(current.shopAuthorityVersion, authority,
    "an incomplete core response must not advance the applied authority");
  assert.deepStrictEqual(current.shopCards, before,
    "an incomplete core response must preserve the confirmed inventory");
  assert.strictEqual(JSON.stringify(current.random), randomBefore,
    "an incomplete core response must not advance applied randomness");
  current.shopCards = [];
  current._pendingSettlementActions = [{
    id: "failed-shop-refresh", type: "shopRefresh", data: {}, attempts: 1,
  }];
  window.ShopSystem.ensure(current);
  assert.deepStrictEqual(current.shopCards, [],
    "opening the shop must not generate stock while refresh recovery is pending");
}

async function testShopRequiresCoreConfirmedStock() {
  const current = state();
  delete current.shopAuthorityVersion;
  current.unlockedShopCards = ["毒杀", "伤口处理"];
  current.shopCards = [];
  current.log = [];
  const randomBefore = JSON.stringify(current.random || null);
  window.ShopSystem.ensure(current);
  assert.deepStrictEqual(current.shopCards, [],
    "render-time shop normalization must not generate unconfirmed stock");
  assert.strictEqual(JSON.stringify(current.random || null), randomBefore,
    "render-time shop normalization must not advance gameplay randomness");

  current.shopCards = [{
    card: { name: "毒杀", suit: "♠", price: 700 }, sold: false,
  }];
  assert.strictEqual(await window.ShopSystem.buy(current, 0), false,
    "the UI must reject inventory without a core confirmation");
  assert.strictEqual((await ServerCore.call("shopBuy", {
    index: 0, cardName: "毒杀", cardSuit: "♠",
    shopAuthorityVersion: current.shopAuthorityVersion,
  }, current)).ok, false, "the core must reject inventory without an authority marker");

  current.shopAuthorityVersion = 1;
  const goldBeforePartial = current.resources.gold;
  assert.strictEqual(window.ShopSystem.confirmed(current), false,
    "an authority marker must not confirm an incomplete inventory");
  assert.strictEqual(await window.ShopSystem.buy(current, 0), false,
    "the UI must reject incomplete inventory even with an authority marker");
  assert.strictEqual((await ServerCore.call("shopBuy", {
    index: 0, cardName: "毒杀", cardSuit: "♠",
    shopAuthorityVersion: current.shopAuthorityVersion,
  }, current)).ok, false, "the core must reject incomplete confirmed-looking inventory");
  assert.strictEqual(current.resources.gold, goldBeforePartial);
  assert.strictEqual(current.deck.length, 0);

  setConfirmedStock(current, "毒杀", "♠");
  current.shopAuthorityVersion = window.GameStoreSaveLimits.limits.counter + 1;
  const goldBeforeUnsafeAuthority = current.resources.gold;
  assert.strictEqual(window.ShopSystem.confirmed(current), false,
    "an out-of-range authority must not confirm otherwise complete stock");
  assert.strictEqual((await ServerCore.call("shopBuy", {
    index: 0, cardName: "毒杀", cardSuit: "♠",
    shopAuthorityVersion: current.shopAuthorityVersion,
  }, current)).ok, false, "the core must reject an out-of-range shop authority");
  assert.strictEqual(current.resources.gold, goldBeforeUnsafeAuthority);
  assert.strictEqual(current.deck.length, 0);

  setConfirmedStock(current, "毒杀", "♠");
  current.shopCards[0].sold = "false";
  window.ShopSystem.ensure(current);
  assert.strictEqual(window.ShopSystem.confirmed(current), false,
    "render normalization must not revive a slot with an invalid sold marker");
  assert.strictEqual(current.shopCards.length, GameEconomy.shop.stockSize - 1);

  setConfirmedStock(current, "毒杀", "♠");
  current.shopCards = current.shopCards.map(slot => ({ ...slot.card }));
  window.ShopSystem.ensure(current);
  assert.strictEqual(window.ShopSystem.confirmed(current), false,
    "legacy bare-card slots must remain unavailable until a core refresh");
  assert.deepStrictEqual(current.shopCards, []);

  current.shopCards = [];
  current.shopAuthorityVersion = 0;
  const initialized = await ServerCore.call("newGame", {}, current);
  assert.strictEqual(initialized.ok, true, "new-game stock must be initialized by the core");
  assert.strictEqual(window.ShopSystem.confirmed(current), true);
  assert.strictEqual(current.shopCards.length, GameEconomy.shop.stockSize);
  assert(current.shopCards.every(slot =>
    current.unlockedShopCards.includes(slot.card.name) && slot.sold === false),
  "new-game stock must contain only confirmed unlocked cards");

  const goldBeforeMissingRequestAuthority = current.resources.gold;
  assert.strictEqual((await ServerCore.call("shopBuy", {
    index: 0,
    cardName: current.shopCards[0].card.name,
    cardSuit: current.shopCards[0].card.suit,
  }, current)).ok, false,
  "the core must reject a purchase without the displayed stock authority");
  assert.strictEqual(current.resources.gold, goldBeforeMissingRequestAuthority);
  assert.strictEqual(current.deck.length, 0);
}

async function testShopBuyRejectsStaleRefreshIndex() {
  const current = state();
  current.unlockedShopCards = ["毒杀", "伤口处理"];
  current.shopCards = Array.from({ length: 6 }, () => ({
    card: { name: "毒杀", suit: "♠", price: 700 }, sold: false,
  }));
  current.log = [];
  const authority = current.shopAuthorityVersion;
  const sample = window.GameRandom.sample;
  window.GameRandom.sample = list => list[0];
  try {
    const refresh = window.ShopSystem.refresh(current);
    const buy = window.ShopSystem.buy(current, 0);
    assert.strictEqual(await refresh, true);
    assert.strictEqual(await buy, false,
      "a purchase using a pre-refresh slot identity must be rejected");
  } finally {
    window.GameRandom.sample = sample;
  }
  assert.strictEqual(current.shopAuthorityVersion, authority + 1);
  assert.strictEqual(`${current.shopCards[0].card.name}|${current.shopCards[0].card.suit}`,
    "毒杀|♠", "the race regression must refresh to the same visible card identity");
  assert.strictEqual(current.deck.length, 0,
    "a stale shop purchase must not add the replacement card");
  assert(!current.log.some(message => message.includes("加入公共牌库")),
    "a stale shop purchase must not log a false successful item");
}

async function testLargeShopBuyUsesDeckPatch() {
  const current = state();
  let existingCardReads = 0;
  let rebuiltCards = 0;
  current.deck = new Proxy(
    Array.from({ length: 4095 }, () => ({ name: "毒杀", suit: "♠" })),
    {
      get(target, key, receiver) {
        if (key === Symbol.iterator || (typeof key === "string" && /^\d+$/.test(key))) {
          existingCardReads += 1;
        }
        return Reflect.get(target, key, receiver);
      },
    },
  );
  setConfirmedStock(current);
  const rebuildCard = window.GameStoreSaveSchema.rebuildCard;
  window.GameStoreSaveSchema.rebuildCard = function trackedRebuild(card) {
    rebuiltCards += 1;
    return rebuildCard.call(this, card);
  };
  try {
    assert.strictEqual((await ServerCore.call("shopBuy", {
      index: 0, cardName: "伤口处理", cardSuit: "♥",
      shopAuthorityVersion: current.shopAuthorityVersion,
    }, current)).changed, true);
  } finally {
    window.GameStoreSaveSchema.rebuildCard = rebuildCard;
  }
  assert.strictEqual(existingCardReads, 0, "shop purchase must not traverse existing cards");
  assert.strictEqual(rebuiltCards, 8,
    "shop purchase must validate and rebuild only the bounded stock and added card");
  assert.strictEqual(current.deck.length, 4096);
}

async function testShopBuyUsesCanonicalPrice() {
  const current = state();
  setConfirmedStock(current);
  current.shopCards[0].card.price = 1;
  const beforeGold = current.resources.gold;
  const result = await ServerCore.call("shopBuy", {
    index: 0, cardName: "伤口处理", cardSuit: "♥",
    shopAuthorityVersion: current.shopAuthorityVersion,
  }, current);
  assert.strictEqual(result.changed, true);
  assert.strictEqual(beforeGold - current.resources.gold, 400,
    "shop purchases must charge the canonical card price");
  assert.strictEqual(current.deck[0].price, 400,
    "shop purchases must add the canonical card data");
}

module.exports = {
  testLargeShopBuyUsesDeckPatch, testShopBuyRejectsStaleRefreshIndex,
  testShopBuyUsesCanonicalPrice, testShopRefreshFailsClosed,
  testShopRequiresCoreConfirmedStock,
};
