const {
  assert, character, GameData, ServerCore, state,
} = require("./local-core-test-harness");

async function testExplicitChangeTracking() {
  const current = state(), hero = current.chars.find(c => c.id === "hero");
  hero.level = 1;
  let deckReads = 0, relicReads = 0, rebuiltCards = 0;
  const tracked = (list, count) => new Proxy(list, {
    get(target, key, receiver) {
      if (key === Symbol.iterator || key === "length"
        || (typeof key === "string" && /^\d+$/.test(key))) count();
      return Reflect.get(target, key, receiver);
    },
  });
  current.deck = tracked(Array.from({ length: 4096 }, () => ({ name: "毒杀", suit: "♠" })), () => { deckReads += 1; });
  current.resources.relics = tracked(Array.from({ length: 4096 }, () => "母亲照片"), () => { relicReads += 1; });
  const rebuildCard = window.GameStoreSaveSchema.rebuildCard;
  window.GameStoreSaveSchema.rebuildCard = function trackedRebuild(card) {
    rebuiltCards += 1;
    return rebuildCard.call(this, card);
  };
  try {
    hero.locked = true;
    hero.unlockCost = 1;
    current.resources.essence = 1;
    const result = await ServerCore.call("unlockChar", { id: "hero" }, current);
    assert.strictEqual(result.changed, true);
  } finally {
    window.GameStoreSaveSchema.rebuildCard = rebuildCard;
  }
  assert.strictEqual(deckReads, 0, "character unlock must not traverse the persistent deck");
  assert.strictEqual(relicReads, 0, "character unlock must not traverse the relic inventory");
  assert.strictEqual(rebuiltCards, 0, "character unlock must not rebuild unrelated cards");
}

async function testProgressionSettlement() {
  const current = state(), hero = current.chars.find(c => c.id === "hero");
  const before = { ...hero.stats };
  const run = {
    focusId: "hero-xp", missionId: "machine_factory", difficultyId: "normal",
    activeParty: ["hero"], pending: "node",
    layers: [[{
      id: "node", type: "normal", done: false,
      enemies: [{ id: "enemy" }],
    }]],
  };
  const args = {
    run, nodeId: "node", kind: "normal", defeatedEnemyIds: ["enemy"],
  };
  const result = await ServerCore.call("settleDungeon", args, current);
  assert.strictEqual(result.changed, true);
  assert.strictEqual(hero.level, 0);
  assert.strictEqual(hero.exp, 30);
  ["maxHp", "attack", "magic", "speed"].forEach(key =>
    assert.strictEqual(hero.stats[key], before[key],
      `${key} must not grow before the first level threshold`));
  ["bloodlust", "handLimit", "drawPerTurn", "initialDraw"].forEach(key =>
    assert.strictEqual(hero.stats[key], before[key], `${key} must stay fixed`));
  const repeated = await ServerCore.call("settleDungeon", args, current);
  assert.strictEqual(repeated.changed, false);
  assert.strictEqual(hero.level, 0, "duplicate settlement must not grant a level");
  assert.strictEqual(hero.exp, 30, "duplicate settlement must not grant experience");
}

async function testSyncDefaults() {
  const current = state();
  current.unlockedShopCards = ["药瓶箱"];
  const result = await ServerCore.sync(current);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(current.unlockedShopCards.sort(), GameData.initialShopCardNames.slice().sort());
  assert(!current.unlockedShopCards.includes("药瓶箱"),
    "LocalCore sync must remove obsolete shop unlock names");
  assert.strictEqual(current.ownedSkins.hero_default, true);
}

async function testDefeatReceipts() {
  const current = state();
  assert.strictEqual((await ServerCore.call("settleDefeat", { defeatId: "defeat-1" }, current)).ok, true);
  assert.strictEqual((await ServerCore.call("settleDefeat", { defeatId: "defeat-1" }, current)).ok, true);
  assert.strictEqual(current.flags.defeatCount, 1, "the same defeat must settle only once");
  current._localDefeatIds = Array.from({ length: 4096 }, (_, i) => `old-defeat-${i}`);
  await ServerCore.call("settleDefeat", { defeatId: "defeat:1" }, current);
  await ServerCore.call("settleDefeat", { defeatId: "old-defeat-0" }, current);
  assert.strictEqual(current.flags.defeatCount, 2, "old defeat receipts must not expire");
  assert.strictEqual(current._localDefeatIds, undefined, "legacy defeat ids must be removed after compression");
  assert.strictEqual(current._localDefeatLedger.legacy.length, 4096, "legacy defeat receipts must remain bounded after migration");
  const event = await ServerCore.call("unlockEvent", { id: "first_defeat" }, current);
  assert.strictEqual(event.ok, true, "settled defeat event must be idempotently completable");
  assert.strictEqual(event.changed, true, "first completion must persist its stable event id");
  assert.strictEqual(current.unlockEvents.completed.first_defeat, true);
  assert.strictEqual((await ServerCore.call("unlockEvent", { id: "first_defeat" }, current)).changed, false);

  const replayState = state();
  replayState._localDefeatLedger = window.ReceiptLedger.claim(null, "defeat:replay", "defeat").ledger;
  replayState._localPendingRun = {
    gold: 77, essence: 2,
    cards: [{ name: "毒杀", suit: "♠" }], relics: ["母亲照片"],
  };
  replayState._serverRun = { stale: true };
  const replay = await ServerCore.call("settleDefeat", { defeatId: "defeat:replay" }, replayState);
  assert.strictEqual(replay.ok, true);
  assert.strictEqual(replay.changed, false);
  assert.deepStrictEqual(replayState._localPendingRun, { gold: 0, essence: 0, cards: [], relics: [] },
    "a repeated defeat settlement must still clear failed-run rewards");
  assert.strictEqual(replayState._serverRun, undefined,
    "a repeated defeat settlement must still clear the stale server run");
}

async function testUnlockPrerequisites() {
  const current = state();
  const event = await ServerCore.call("unlockEvent", { id: "miller" }, current);
  assert.strictEqual(event.ok, false, "event prerequisites must be enforced by local core");
  assert.strictEqual(current.chars.find(c => c.id === "miller").locked, true);
  current.chars = current.chars.filter(c => c.id !== "manny");
  const missingSource = await ServerCore.call("unlockEvent", { id: "miller" }, current);
  assert.strictEqual(missingSource.ok, false, "missing source characters must not satisfy event prerequisites");
  current.chars.push(character("manny", false));
  current.chars = current.chars.filter(c => c.id !== "miller");
  const missingTarget = await ServerCore.call("unlockEvent", { id: "miller" }, current);
  assert.strictEqual(missingTarget.ok, false, "missing target characters must not settle unlock events");
  assert.strictEqual(current.flags.millerUnlockSeen, undefined);
}

module.exports = {
  testDefeatReceipts,
  testExplicitChangeTracking,
  testProgressionSettlement,
  testSyncDefaults,
  testUnlockPrerequisites,
};
