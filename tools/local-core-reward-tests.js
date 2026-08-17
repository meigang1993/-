const {
  assert,
  BountyRewards,
  BountySystem,
  GameStoreSaveLimits,
  ServerCore,
  state,
} = require("./local-core-test-harness");

async function testResourceCaps() {
  const cap = GameStoreSaveLimits.limits.resource;
  const current = state();
  current.resources.gold = cap - 10;
  current.resources.essence = cap - 1;
  current.resources.relics = ["母亲照片"];
  await ServerCore.call("smeltRelic", { index: 0, relic: "母亲照片", operationId: "smelt-at-cap" }, current);
  assert.strictEqual(current.resources.gold, cap, "normal gold rewards must saturate at the save limit");
  await ServerCore.call("claimBounty", {
    items: [{ claimId: "cap-reward", reward: { type: "essence", essence: 3 }, bonusGold: 25 }],
  }, current);
  assert.strictEqual(current.resources.gold, cap, "bounty gold must remain within the save limit");
  assert.strictEqual(current.resources.essence, cap, "bounty essence must remain within the save limit");
  current._localPendingRun = { gold: 50, essence: 50, cards: [], relics: [] };
  await ServerCore.call("bankRun", {}, current);
  assert.strictEqual(current.resources.gold, cap, "banked gold must remain within the save limit");
  assert.strictEqual(current.resources.essence, cap, "banked essence must remain within the save limit");
}

async function testBountyReceipts() {
  const current = state();
  const item = { claimId: "task:run", reward: { type: "essence", essence: 3 }, bonusGold: 25 };
  const before = { ...current.resources };
  await ServerCore.call("claimBounty", { items: [item] }, current);
  const repeated = await ServerCore.call("claimBounty", { items: [item] }, current);
  assert.strictEqual(current.resources.essence - before.essence, 3);
  assert.strictEqual(current.resources.gold - before.gold, 25);
  assert.strictEqual(repeated.result.core.lastBountyRewards[0].claimId, item.claimId);
  current._localClaimedBountyIds = Array.from({ length: 200 }, (_, i) => `old-claim-${i}`);
  await ServerCore.call("claimBounty", { items: [{ ...item, claimId: "new-claim" }] }, current);
  const afterNewClaim = { ...current.resources };
  await ServerCore.call("claimBounty", { items: [{ ...item, claimId: "old-claim-0" }] }, current);
  assert.deepStrictEqual(current.resources, afterNewClaim, "old bounty receipts must not expire");
}

async function testLegacyPendingRewardId() {
  const current = state(), legacyReward = { type: "essence", essence: 4 };
  const originalNow = Date.now;
  let now = 1000;
  Date.now = () => ++now;
  try {
    current.pendingBountyRewards = [legacyReward];
    await BountyRewards.claimPending(current);
    const afterFirstClaim = current.resources.essence;
    current.pendingBountyRewards = [legacyReward];
    await BountyRewards.claimPending(current);
    assert.strictEqual(current.resources.essence, afterFirstClaim, "a restored legacy pending reward must keep a stable claim id");
  } finally {
    Date.now = originalNow;
  }
}

function testFailedRunRewardCleanup() {
  const current = state();
  current.pendingBountyRewards = [
    { taskTitle: "旧存档奖励", reward: { type: "essence", essence: 2 } },
    { receiptKey: "task-a:failed-run", reward: { type: "essence", essence: 3 } },
    { receiptKey: "task-b:other-run", reward: { type: "essence", essence: 4 } },
  ];
  BountySystem.failRun(current, "machine_factory", [], "failed-run");
  assert.deepStrictEqual(
    current.pendingBountyRewards.map(item => item.receiptKey || item.taskTitle),
    ["旧存档奖励", "task-b:other-run"],
    "a failed run must discard only its own queued rewards and preserve old or unrelated promises",
  );
}

async function testDistinctLegacyRewards() {
  const current = state();
  const legacy = [
    { taskTitle: "旧任务", missionId: "machine_factory", reward: { type: "essence", essence: 2 } },
    { taskTitle: "旧任务", missionId: "machine_factory", reward: { type: "essence", essence: 3 } },
  ];
  current.pendingBountyRewards = legacy;
  await BountyRewards.claimPending(current);
  assert.strictEqual(current.resources.essence, 35, "distinct legacy rewards with the same title must not share a claim id");
  current.pendingBountyRewards = legacy;
  await BountyRewards.claimPending(current);
  assert.strictEqual(current.resources.essence, 35, "restored wrapped legacy rewards must remain idempotent");
}

async function testBountyInventoryCapacity() {
  const current = state();
  const max = GameStoreSaveLimits.limits.lists.deck;
  current.resources.gold = 0;
  current.deck = Array.from({ length: max }, () => ({ name: "毒杀", suit: "♠" }));
  current.pendingBountyRewards = [{
    claimId: "bounty:1",
    reward: { type: "card", card: { name: "物资补给", suit: "♦" } },
    bonusGold: 25,
  }];
  const beforeGold = current.resources.gold;
  const blocked = await BountyRewards.claimPending(current);
  assert.strictEqual(blocked, false);
  assert.strictEqual(current.pendingBountyRewards.length, 1, "full inventory must preserve the queued bounty reward");
  assert.strictEqual(current.resources.gold, beforeGold, "blocked bounty reward must not grant bonus resources");
  assert.strictEqual(current._localBountyLedger?.through || 0, 0, "blocked bounty reward must not consume its receipt");
  const cleanup = await ServerCore.call("shopDelete", {
    index: 0, cardName: "毒杀", cardSuit: "♠",
    operationId: "bounty-recovery-delete", recoveryCardSlots: 1,
  }, current);
  assert.strictEqual(cleanup.changed, true, "queued bounty cards must enable free capacity recovery");
  assert.strictEqual(current.resources.gold, 0, "free capacity recovery must not charge gold");
  const retried = await BountyRewards.claimPending(current);
  assert.strictEqual(retried, true);
  assert.strictEqual(current.pendingBountyRewards.length, 0);
  assert.strictEqual(current.deck.length, max, "reward must remain claimable after inventory space is freed");

  const relicState = state();
  const relicMax = GameStoreSaveLimits.limits.lists.relicCollection;
  relicState.relicCollection = Array.from({ length: relicMax }, (_, index) => `旧饰品${index}`);
  relicState.pendingBountyRewards = [{
    claimId: "bounty:relic-collection",
    reward: { type: "relic", relic: "鬼王扑克" },
  }];
  assert.strictEqual(await BountyRewards.claimPending(relicState), true);
  assert.strictEqual(relicState.relicCollection.length, relicMax,
    "full relic discovery history must stay within the save limit");
  assert(relicState.resources.relics.includes("鬼王扑克"),
    "bounded discovery history must not discard the actual relic reward");
}

async function testUnknownRelicRewardsRejected() {
  const bountyState = state();
  const bounty = await ServerCore.call("claimBounty", {
    items: [{
      claimId: "invalid-relic",
      reward: { type: "relic", relic: "篡改饰品" },
      bonusGold: 50,
    }],
  }, bountyState);
  assert.strictEqual(bounty.ok, false,
    "unknown bounty relic rewards must be rejected");
  assert.strictEqual(bountyState.resources.relics.length, 0,
    "rejected bounty relics must not enter inventory");
  assert.strictEqual(bountyState.resources.gold, 10000,
    "rejected bounty relics must not grant attached gold");
  assert.strictEqual(bountyState._localBountyLedger?.through || 0, 0,
    "rejected bounty relics must not consume their receipt");

  const dungeonState = state();
  dungeonState._localPendingRun = {
    gold: 50, essence: 1, cards: [], relics: ["篡改饰品"],
  };
  const dungeon = await ServerCore.call("bankRun", {}, dungeonState);
  assert.strictEqual(dungeon.ok, false,
    "unknown pending dungeon relics must be rejected");
  assert.strictEqual(dungeonState.resources.relics.length, 0,
    "rejected dungeon relics must not enter inventory");
  assert.strictEqual(dungeonState.resources.gold, 10000,
    "rejected dungeon relics must not grant bundled resources");
  assert.strictEqual(dungeonState._localPendingRun.relics[0], "篡改饰品",
    "rejected dungeon rewards must remain pending for migration or recovery");
}

module.exports = {
  testBountyReceipts,
  testBountyInventoryCapacity,
  testDistinctLegacyRewards,
  testFailedRunRewardCleanup,
  testLegacyPendingRewardId,
  testResourceCaps,
  testUnknownRelicRewardsRejected,
};
