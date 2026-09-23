global.window = global;
const fs = require("fs");
const vm = require("vm");
require("../src/original/game-random.js");
require("../src/original/receipt-ledger.js");
require("../src/original/settlement-recovery.js");
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

(async () => {
  const state = { log: [], _pendingSettlementActions: [] };
  SettlementRecovery.enqueue(state, { id: "first", type: "bounty", data: {} });
  SettlementRecovery.enqueue(state, { id: "second", type: "shop", data: {} });
  SettlementRecovery.enqueue(state, { id: "second", type: "shop", data: {} });
  assert(SettlementRecovery.count(state) === 2, "duplicate recovery actions must be coalesced");
  const calls = [];
  let fail = true;
  const first = await SettlementRecovery.run(state, async action => {
    calls.push(action.id);
    if (action.id === "first" && fail) throw new Error("controlled failure");
  });
  assert(first === false, "failed recovery must report pending work");
  assert(calls.join(",") === "first", "later actions must not pass a failed action");
  assert(SettlementRecovery.count(state) === 2, "failed and later actions must remain durable");
  fail = false;
  const retry = await SettlementRecovery.run(state, async action => { calls.push(action.id); });
  assert(retry === true, "retry must finish the pending queue");
  assert(calls.join(",") === "first,first,second", "retry must preserve settlement order");
  assert(SettlementRecovery.count(state) === 0, "successful retry must clear the queue");
  const unknown = { id: "future", type: "futureAction", data: {} };
  SettlementRecovery.enqueue(state, unknown);
  const blocked = await SettlementRecovery.run(state, async action => {
    throw new Error(`unknown:${action.type}`);
  });
  assert(blocked === false, "unknown recovery actions must fail closed");
  assert(SettlementRecovery.count(state) === 1, "unknown recovery actions must remain retryable");
  assert(state._pendingSettlementActions[0].id === unknown.id, "unknown recovery action identity must be preserved");
  state._pendingSettlementActions = [];
  let failBattleExtra = true, bankCalls = 0, failRunCalls = 0, claimCalls = 0;
  let completeDungeonCalls = 0, releaseDefeat = null;
  const failRunReasons = [];
  global.GameData = { difficulties: {}, missions: [] };
  global.DungeonRewardCore = { completeNode() {}, beginSettle() {}, canApplyReward() {}, endSettle() {}, rewardText: () => "奖励", healParty() {} };
  global.ServerCore = { call: method => {
    if (method === "bankRun") bankCalls += 1;
    if (method === "settleDefeat") {
      return new Promise(resolve => {
        releaseDefeat = () => resolve({ ok: true });
      });
    }
    return Promise.resolve({ ok: true });
  } };
  global.BountySystem = {
    completeBattle() { if (failBattleExtra) throw new Error("battle extra failed"); },
    completeDungeon() { completeDungeonCalls += 1; },
    failRun(_state, _missionId, _fallenIds, _focusId, reason) {
      failRunCalls += 1;
      failRunReasons.push(reason);
    },
    claimPending: async () => { claimCalls += 1; return true; },
  };
  let shopRefreshCalls = 0;
  global.ShopSystem = { refresh: async () => { shopRefreshCalls += 1; return true; } };
  require("../src/original/dungeon-reward-payload.js");
  require("../src/original/dungeon-settlement-actions.js");
  require("../src/original/dungeon-node-rewards.js");
  require("../src/original/dungeon-run-rewards.js");
  require("../src/original/dungeon-rewards.js");
  const shopFailureState = { log: [], _pendingSettlementActions: [] };
  SettlementRecovery.enqueue(shopFailureState, {
    id: "shop-refresh-failure", type: "shopRefresh", data: {},
  });
  ShopSystem.refresh = async () => false;
  assert(await DungeonSettlementActions.retryPending(shopFailureState) === false,
    "an unconfirmed shop refresh must keep settlement recovery pending");
  assert(SettlementRecovery.count(shopFailureState) === 1,
    "a failed shop refresh must remain available for explicit retry");
  ShopSystem.refresh = async () => true;
  assert(await DungeonSettlementActions.retryPending(shopFailureState) === true,
    "a confirmed shop refresh must clear the recovery action");
  assert(SettlementRecovery.count(shopFailureState) === 0,
    "successful shop refresh retry must remove the completed action");
  shopRefreshCalls = 0;
  ShopSystem.refresh = async () => { shopRefreshCalls += 1; return true; };
  const retreatState = { explore: { focusId: "run-1", missionId: "mission", difficultyId: "normal", earned: {}, party: [], activeParty: [], rewardPopup: { gold: 1 } }, view: "dungeon", log: [], chars: [], party: [], _pendingSettlementActions: [] };
  SettlementRecovery.enqueue(retreatState, { id: "battle", type: "battleBounty", data: { battle: {}, run: {} } });
  assert(await DungeonRewards.retreat(retreatState) === false, "retreat must wait for earlier settlement recovery");
  assert(bankCalls === 0 && failRunCalls === 0, "blocked retreat must not bank or fail accepted tasks");
  failBattleExtra = false;
  ShopSystem.refresh = async () => { shopRefreshCalls += 1; return false; };
  assert(await DungeonRewards.retreat(retreatState) === true,
    "retreat should return to the hall with a retryable shop refresh");
  assert(bankCalls === 1 && failRunCalls === 1 && claimCalls === 1, "retreat must bank once and claim promised rewards");
  assert(shopRefreshCalls === 1, "retreat must refresh the shop once");
  assert(failRunReasons[0] === "撤退", "retreat must identify its task-failure reason");
  assert(retreatState.view === "hall" && retreatState.explore === null, "successful retreat must return to hall");
  assert(SettlementRecovery.count(retreatState) === 1,
    "a failed retreat shop refresh must remain available for explicit retry");
  assert(retreatState.log[0].includes("商店刷新待重试"),
    "retreat must report a failed shop refresh");
  ShopSystem.refresh = async () => { shopRefreshCalls += 1; return true; };
  assert(await DungeonSettlementActions.retryPending(retreatState) === true,
    "the retained retreat shop refresh must succeed on explicit retry");
  assert(shopRefreshCalls === 2 && SettlementRecovery.count(retreatState) === 0,
    "a successful retreat retry must clear exactly one retained shop action");
  const finishState = {
    explore: {
      focusId: "run-finish", missionId: "mission", difficultyId: "normal",
      complete: true, rewardPopup: null, earned: {}, party: [], activeParty: [],
    },
    view: "dungeon", log: [], chars: [], party: [],
    unlockedDifficulties: ["normal"], _pendingSettlementActions: [],
  };
  const claimsBeforeFinish = claimCalls;
  const shopsBeforeFinish = shopRefreshCalls;
  await DungeonRewards.finish(finishState);
  assert(finishState.view === "hall" && finishState.explore === null,
    "dungeon completion must return to the hall");
  assert(completeDungeonCalls === 1 && claimCalls === claimsBeforeFinish + 1,
    "dungeon completion must refresh completed bond tasks and claim rewards");
  assert(shopRefreshCalls === shopsBeforeFinish + 1,
    "dungeon completion must refresh the shop once");
  const wipeState = {
    explore: { activeParty: [], party: [], missionId: "mission", focusId: "wipe-run" },
    party: [], chars: [], flags: {}, battle: null, log: [], view: "dungeon",
    _pendingSettlementActions: [],
  };
  const shopsBeforeWipe = shopRefreshCalls;
  const wipe = DungeonRewards.rest(wipeState, false);
  assert(typeof wipe?.then === "function"
    && wipeState.view === "dungeon" && wipeState.explore,
  "party wipe must wait for defeat settlement before leaving the dungeon");
  releaseDefeat();
  await wipe;
  assert(wipeState.view === "hall" && wipeState.explore === null,
    "party wipe must return to the hall after settlement");
  assert(failRunReasons.at(-1) === "全军覆没",
    "party wipe must refresh accepted tasks with the wipe reason");
  assert(shopRefreshCalls === shopsBeforeWipe + 1
    && wipeState.log[0].includes("商店已刷新"),
  "party wipe must refresh the shop once");
  const wipeRetryState = { explore: { activeParty: [], party: [], missionId: "mission", focusId: "wipe-retry" }, party: [], chars: [], flags: {}, battle: null, log: [], view: "dungeon", _pendingSettlementActions: [] };
  ShopSystem.refresh = async () => { shopRefreshCalls += 1; return false; };
  const failedWipeRefresh = DungeonRewards.rest(wipeRetryState, false);
  releaseDefeat();
  await failedWipeRefresh;
  assert(DungeonRewards.pendingCount(wipeRetryState) === 1
    && wipeRetryState.log[0].includes("商店刷新待重试"),
  "failed wipe shop refresh must remain retryable");
  ShopSystem.refresh = async () => { shopRefreshCalls += 1; return true; };
  assert(await DungeonRewards.retryPending(wipeRetryState) === true
    && DungeonRewards.pendingCount(wipeRetryState) === 0,
  "wipe shop refresh retry must clear the retained action");
  const autoClaimState = { log: [], _pendingSettlementActions: [] };
  const completedRun = {
    focusId: "run-auto", missionId: "mission", difficultyId: "normal",
    complete: true, party: [], activeParty: [],
  };
  DungeonSettlementActions.queueBattleExtras(autoClaimState, completedRun, "elite-1", {
    defeatedEnemyIds: ["elite"],
  });
  DungeonSettlementActions.queueDungeonCompletion(autoClaimState, completedRun);
  const claimsBefore = claimCalls;
  assert(await DungeonSettlementActions.retryPending(autoClaimState),
    "automatic task settlement queue must complete");
  assert(claimCalls === claimsBefore + 2,
    "hunt and bond completion paths must each trigger an automatic claim");
  let departureRetries = 0, dungeonStarts = 0;
  const departureState = {
    sortieStarting: false, unlockedDifficulties: ["normal"], flags: {}, party: ["hero"], bounties: [], log: [],
  };
  global.state = departureState;
  global.GameData = { missions: [{ id: "mission", kind: "dungeon" }], difficulties: { normal: { name: "普通" } } };
  global.log = message => departureState.log.unshift(message);
  global.render = () => {};
  global.persist = async () => {};
  global.GameBGM = { unlock() {} };
  global.BattleFX = { unlockAudio() {} };
  global.DungeonRewards = { pendingCount: () => 1, retryPending: async () => { departureRetries += 1; return false; } };
  global.ServerCore = { offlineOnly: () => true, call: async () => { dungeonStarts += 1; return { ok: true }; } };
  global.DungeonSystem = { start(current) { current.explore = {}; } };
  vm.runInThisContext(fs.readFileSync("src/original/hall-party-actions.js", "utf8"), { filename: "hall-party-actions.js" });
  await startMission("mission", "normal");
  assert(departureRetries === 1 && dungeonStarts === 0, "a new dungeon must not start while older settlement recovery is blocked");
  assert(departureState.sortieStarting === false, "blocked departure must restore the departure control");
  assert(departureState.log[0]?.includes("旧的附加结算"), `blocked departure must explain the required recovery: ${departureState.log[0] || "missing log"}`);

  DungeonRewards.retryPending = async () => { departureRetries += 1; return true; };
  await startMission("mission", "normal");
  assert(departureRetries === 2 && dungeonStarts === 1, "departure should continue after older settlement recovery succeeds");
  console.log("Settlement recovery tests passed");
})().catch(error => {
  console.error(error.stack);
  process.exit(1);
});
