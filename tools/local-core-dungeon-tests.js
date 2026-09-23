const {
  assert, ServerCore, state,
} = require("./local-core-test-harness");

function setConfirmedStock(current, name = "伤口处理", suit = "♥") {
  const card = window.GameData.eliteCards.find(item => item.name === name);
  current.unlockedShopCards = [name];
  current.shopCards = Array.from(
    { length: window.GameEconomy.shop.stockSize },
    () => ({ card: { ...card, suit }, sold: false }),
  );
}

async function testDungeonSettlementReceipts() {
  const current = state();
  const run = {
    focusId: "run-1", missionId: "machine_factory", difficultyId: "normal",
    pending: "n2-0", layers: [[{ id: "n2-0", type: "normal", done: false, enemies: [{ id: "enemy" }] }]],
  };
  const args = { run, nodeId: "n2-0", kind: "normal", defeatedEnemyIds: ["enemy"] };
  const first = await ServerCore.call("settleDungeon", args, current);
  const pending = JSON.stringify(current._localPendingRun);
  const repeated = await ServerCore.call("settleDungeon", args, current);
  assert.strictEqual(JSON.stringify(current._localPendingRun), pending, "node retry must not duplicate rewards");
  assert.deepStrictEqual(repeated.result.core.lastLocalReward, first.result.core.lastLocalReward);
  await ServerCore.call("bankRun", { run }, current);
  assert.strictEqual(current._localRunState, null, "banking a run must clear its node reward receipts");
  const bankReplay = await ServerCore.call("bankRun", { run }, current);
  assert.strictEqual(bankReplay.ok, true, "a repeated bank request must remain idempotently accepted");
  assert.strictEqual(bankReplay.changed, false, "a repeated bank request must not report a new state change");
  await ServerCore.call("startDungeon", { missionId: "machine_factory", difficultyId: "normal", runId: "run-2" }, current);
  const beforeOldRetry = JSON.stringify(current._localPendingRun);
  const oldRetry = await ServerCore.call("settleDungeon", args, current);
  assert.strictEqual(JSON.stringify(current._localPendingRun), beforeOldRetry, "settled node must stay idempotent after banking and starting another run");
  assert.strictEqual(oldRetry.ok, false, "a receipt from an older run must not enter the active run ledger");
  assert.strictEqual(Object.keys(current._localRunState.rewards).length, 0);
}

async function testSkinPurchase() {
  const current = state();
  const result = await ServerCore.call("buySkin", { id: "hero_rare" }, current);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(current.resources.essence, 17, "skin cost must come from SkinSystem");
}

async function testRewardAndShopCardsReachDeck() {
  const current = state();
  setConfirmedStock(current, "毒杀", "♠");
  const bought = await ServerCore.call("shopBuy", {
    index: 0, cardName: "毒杀", cardSuit: "♠",
    shopAuthorityVersion: current.shopAuthorityVersion,
  }, current);
  assert.strictEqual(bought.ok, true);
  assert(current.deck.some(card => card.name === "毒杀" && card.suit === "♠"),
    "shop purchases must enter the persistent deck");

  current._localPendingRun = {
    gold: 0, essence: 0,
    cards: [{ name: "物资补给", suit: "♦", type: "consume" }],
    relics: [],
  };
  await ServerCore.call("bankRun", { run: {} }, current);
  assert(current.deck.some(card => card.name === "物资补给" && card.suit === "♦"),
    "banked elite/BOSS rewards must enter the persistent deck");
}

async function testShopAndDungeonInventoryCapacity() {
  const current = state();
  const max = window.GameStoreSaveLimits.limits.lists.deck;
  current.deck = Array.from({ length: max }, () => ({ name: "毒杀", suit: "♠" }));
  setConfirmedStock(current);
  const beforeGold = current.resources.gold;
  const bought = await ServerCore.call("shopBuy", {
    index: 0, cardName: "伤口处理", cardSuit: "♥",
    shopAuthorityVersion: current.shopAuthorityVersion,
  }, current);
  assert.strictEqual(bought.error?.code, "INVENTORY_CAPACITY_EXCEEDED");
  assert.strictEqual(current.resources.gold, beforeGold, "full-deck purchase must not charge gold");
  assert.strictEqual(current.shopCards[0].sold, false, "full-deck purchase must leave the item unsold");
  current._localPendingRun = {
    gold: 50, essence: 2,
    cards: [{ name: "物资补给", suit: "♦" }],
    relics: [],
  };
  const banked = await ServerCore.call("bankRun", { run: {} }, current);
  assert.strictEqual(banked.error?.code, "INVENTORY_CAPACITY_EXCEEDED");
  assert.strictEqual(current._localPendingRun.cards.length, 1, "full-deck banking must preserve pending rewards");
  assert.strictEqual(current.resources.gold, beforeGold, "failed banking must not partially grant resources");

  const relicState = state();
  const relicMax = window.GameStoreSaveLimits.limits.collection;
  relicState.resources.relics = Array.from({ length: relicMax }, () => "母亲照片");
  relicState._localPendingRun = {
    gold: 50, essence: 2, cards: [], relics: ["鬼王扑克"],
  };
  const relicGold = relicState.resources.gold;
  const relicBanked = await ServerCore.call("bankRun", { run: {} }, relicState);
  assert.strictEqual(relicBanked.error?.code, "INVENTORY_CAPACITY_EXCEEDED");
  assert.deepStrictEqual(relicState._localPendingRun.relics, ["鬼王扑克"],
    "full relic inventory must preserve pending rewards");
  assert.strictEqual(relicState.resources.gold, relicGold,
    "failed relic banking must not partially grant resources");

  const recoveryState = state();
  recoveryState.resources.gold = 0;
  recoveryState.deck = Array.from({ length: max }, () => ({ name: "毒杀", suit: "♠" }));
  recoveryState._localPendingRun = {
    gold: 50, essence: 2,
    cards: [
      { name: "物资补给", suit: "♦" },
      { name: "伤口处理", suit: "♦" },
    ],
    relics: [],
  };
  const blockedRecovery = await ServerCore.call("bankRun", { run: {} }, recoveryState);
  assert.strictEqual(blockedRecovery.error?.code, "INVENTORY_CAPACITY_EXCEEDED");
  const cleanup = await ServerCore.call("shopDelete", {
    index: 0, cardName: "毒杀", cardSuit: "♠",
    operationId: "inventory-recovery-delete-1", recoveryCardSlots: 2,
  }, recoveryState);
  assert.strictEqual(cleanup.changed, true, "capacity recovery must allow the first free non-protected deletion");
  const secondCleanup = await ServerCore.call("shopDelete", {
    index: 0, cardName: "毒杀", cardSuit: "♠",
    operationId: "inventory-recovery-delete-2", recoveryCardSlots: 2,
  }, recoveryState);
  assert.strictEqual(secondCleanup.changed, true, "capacity recovery must cover the full required slot count");
  const excessCleanup = await ServerCore.call("shopDelete", {
    index: 0, cardName: "毒杀", cardSuit: "♠",
    operationId: "inventory-recovery-delete-3", recoveryCardSlots: 2,
  }, recoveryState);
  assert.strictEqual(excessCleanup.changed, false, "capacity recovery must stop waiving cost after pressure clears");
  assert.strictEqual(recoveryState.resources.gold, 0, "capacity recovery must not require spendable gold");
  const recovered = await ServerCore.call("bankRun", { run: {} }, recoveryState);
  assert.strictEqual(recovered.ok, true, "banking must succeed after enough space is freed");
  assert.strictEqual(recoveryState.deck.length, max, "recovery must grant the preserved card exactly once");
  assert.strictEqual(recoveryState.resources.gold, 50, "recovery must grant preserved resources exactly once");
}

module.exports = {
  testDungeonSettlementReceipts, testRewardAndShopCardsReachDeck,
  testShopAndDungeonInventoryCapacity, testSkinPurchase,
};
