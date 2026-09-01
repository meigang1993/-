const { assert, GameEconomy, ServerCore, state } = require("./local-core-test-harness");
const fs = require("fs");
const vm = require("vm");

require("../src/original/shop.js");

async function testConcurrentDeletes() {
  const current = state();
  current.deck = [
    { name: "杀（普攻）", suit: "♠" },
    { name: "毒杀", suit: "♠" },
    { name: "伤口处理", suit: "♥" },
    { name: "物资补给", suit: "♦" },
  ];
  const missingIdentity = await ServerCore.call("shopDelete", { index: 1, operationId: "delete-missing-identity" }, current);
  assert.strictEqual(missingIdentity.ok, false, "card deletion must require the requested card identity");
  const protectedDelete = await ServerCore.call("shopDelete", {
    index: 0, cardName: "杀（普攻）", cardSuit: "♠", operationId: "delete-protected",
  }, current);
  assert.strictEqual(protectedDelete.ok, false, "protected base cards must not be deleted");
  await Promise.all([
    ServerCore.call("shopDelete", { index: 1, cardName: "毒杀", cardSuit: "♠", operationId: "delete-poison" }, current),
    ServerCore.call("shopDelete", { index: 2, cardName: "伤口处理", cardSuit: "♥", operationId: "delete-heal" }, current),
  ]);
  assert.deepStrictEqual(current.deck.map(card => card.name), ["杀（普攻）", "物资补给"]);
  assert.strictEqual(current.resources.gold, 10000 - (GameEconomy.shop.deleteCost * 2), "different concurrent deletes must each charge once");
}

async function testRepeatedDelete() {
  const current = state();
  current.deck = [
    { name: "杀（普攻）", suit: "♠" },
    { name: "毒杀", suit: "♠" },
    { name: "毒杀", suit: "♠" },
    { name: "物资补给", suit: "♦" },
  ];
  const request = { index: 1, cardName: "毒杀", cardSuit: "♠", operationId: "delete-same-request" };
  const beforeGold = current.resources.gold;
  const [first, replay] = await Promise.all([
    ServerCore.call("shopDelete", request, current),
    ServerCore.call("shopDelete", request, current),
  ]);
  assert.strictEqual(first.ok && replay.ok, true);
  assert.strictEqual(replay.result.core.lastInventoryOperation.replayed, true);
  assert.strictEqual(current.deck.filter(card => card.name === "毒杀").length, 1, "a repeated delete request must remove only one matching card");
  assert.strictEqual(beforeGold - current.resources.gold, GameEconomy.shop.deleteCost);
}

async function testConcurrentSmelts() {
  const current = state();
  current.resources.relics = ["母亲照片", "白色哥特洛丽塔", "鬼王扑克"];
  const missingIdentity = await ServerCore.call("smeltRelic", { index: 0, operationId: "smelt-missing-identity" }, current);
  assert.strictEqual(missingIdentity.ok, false, "relic smelting must require the requested relic identity");
  await Promise.all([
    ServerCore.call("smeltRelic", { index: 0, relic: "母亲照片", operationId: "smelt-photo" }, current),
    ServerCore.call("smeltRelic", { index: 1, relic: "白色哥特洛丽塔", operationId: "smelt-lolita" }, current),
  ]);
  assert.deepStrictEqual(current.resources.relics, ["鬼王扑克"]);
  assert.strictEqual(current.resources.gold, 10000 + (GameEconomy.relic.smeltGold * 2), "different concurrent smelts must each grant once");
}

async function testRepeatedSmelt() {
  const current = state();
  current.resources.relics = ["母亲照片", "母亲照片", "鬼王扑克"];
  const request = { index: 0, relic: "母亲照片", operationId: "smelt-same-request" };
  const beforeGold = current.resources.gold;
  const [first, replay] = await Promise.all([
    ServerCore.call("smeltRelic", request, current),
    ServerCore.call("smeltRelic", request, current),
  ]);
  assert.strictEqual(first.ok && replay.ok, true);
  assert.strictEqual(replay.result.core.lastInventoryOperation.replayed, true);
  assert.strictEqual(current.resources.relics.filter(relic => relic === "母亲照片").length, 1, "a repeated smelt request must remove only one matching relic");
  assert.strictEqual(current.resources.gold - beforeGold, GameEconomy.relic.smeltGold);
}

async function testRepeatedSmeltUiReplay() {
  if (typeof global.smeltRelic !== "function") {
    vm.runInThisContext(fs.readFileSync("./src/original/hall-relic-actions.js", "utf8"), {
      filename: "hall-relic-actions.js",
    });
  }
  const current = state(), operationId = "inventory:smelt-ui-replay";
  current.resources.relics = ["母亲照片"];
  current._localInventoryLedger = window.ReceiptLedger.claim(null, operationId, "inventory").ledger;
  const previousState = global.state, previousLog = global.log;
  const assign = window.ReceiptLedger.assign;
  const messages = [];
  global.state = current;
  global.log = message => messages.push(message);
  window.ReceiptLedger.assign = () => operationId;
  try {
    assert.strictEqual(await global.smeltRelic(0, true, current), true,
      "an idempotent smelt replay must be treated as success by the UI action");
  } finally {
    window.ReceiptLedger.assign = assign;
    global.state = previousState;
    global.log = previousLog;
  }
  assert.deepStrictEqual(messages, [], "an idempotent smelt replay must not log a false failure");
}

async function testSmeltPreservesEquipmentSlots() {
  if (typeof global.smeltRelic !== "function") {
    vm.runInThisContext(fs.readFileSync("./src/original/hall-relic-actions.js", "utf8"), {
      filename: "hall-relic-actions.js",
    });
  }
  const current = state();
  current.resources.relics = ["母亲照片", "鬼王扑克"];
  current.equipment = {
    hero: ["母亲照片", "鬼王扑克"],
    loki: [null, "白色哥特洛丽塔"],
  };
  const previousState = global.state, previousLog = global.log;
  global.state = current;
  global.log = () => {};
  try {
    assert.strictEqual(await global.smeltRelic(0, true, current), true,
      "a successful non-rendering smelt must report success");
  } finally {
    global.state = previousState;
    global.log = previousLog;
  }
  assert.deepStrictEqual(current.equipment.hero, [null, "鬼王扑克"],
    "smelting an equipped slot-one relic must not shift slot two");
  assert.deepStrictEqual(current.equipment.loki, [null, "白色哥特洛丽塔"],
    "smelting must tolerate unrelated empty equipment slots");
}

async function testRejectedUiOperationReleasesSequence() {
  const current = state();
  current.deck = [
    { name: "杀（普攻）", suit: "♠" },
    { name: "毒杀", suit: "♠" },
  ];
  current._localInventoryLedger = window.ReceiptLedger.empty();
  current._localInventoryOperationCounter = 0;
  current.log = [];
  const call = window.ServerCore.call;
  window.ServerCore.call = async () => ({
    ok: false, changed: false, message: "模拟业务拒绝", result: null,
  });
  try {
    assert.strictEqual(await window.ShopSystem.deleteCard(current, 1), false);
  } finally {
    window.ServerCore.call = call;
  }
  assert.strictEqual(current._localInventoryOperationCounter, 0,
    "a confirmed rejected UI operation must release its unclaimed sequence");
  assert.strictEqual(await window.ShopSystem.deleteCard(current, 1), true,
    "the next inventory operation must be able to reuse the released sequence");
  assert.strictEqual(current._localInventoryLedger.through, 1);
}

async function testLegacyInventoryReceiptCompression() {
  const current = state();
  current.deck = [{ name: "杀（普攻）", suit: "♠" }, { name: "毒杀", suit: "♠" }];
  current._localInventoryOperationIds = Array.from({ length: 4096 }, (_, i) => `old-inventory-${i}`);
  const result = await ServerCore.call("shopDelete", {
    index: 1, cardName: "毒杀", cardSuit: "♠", operationId: "inventory:1",
  }, current);
  assert.strictEqual(result.changed, true, "structured inventory receipts must continue after legacy compression");
  assert.strictEqual(current._localInventoryOperationIds, undefined);
  assert.strictEqual(current._localInventoryLedger.legacy.length, 4096);
  assert.strictEqual(current._localInventoryLedger.through, 1);
}

module.exports = {
  testConcurrentDeletes, testConcurrentSmelts, testLegacyInventoryReceiptCompression,
  testRepeatedDelete, testRepeatedSmelt,
  testRepeatedSmeltUiReplay, testSmeltPreservesEquipmentSlots,
  testRejectedUiOperationReleasesSequence,
};
