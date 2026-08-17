const {
  assert,
  combatTypes,
  difficultyIds,
  DungeonEvents,
  DungeonMap,
  DungeonRewardPayload,
  DungeonRewards,
  GameStoreStateFactory,
  seeded,
  ServerCore,
} = require("./dungeon-matrix-harness");
const { pathToNode, validateServerRestore } = require("./dungeon-matrix-paths");
const { validateRun } = require("./dungeon-matrix-validation");

function confirmNodeReward(state, node, label) {
  const run = state.explore, nextId = node.next?.[0];
  assert(run.rewardPopup, `${label}/${node.id}: reward popup was not shown`);
  if (nextId) {
    assert(!DungeonMap.canChoose(run, nextId),
      `${label}/${node.id}: next node opened before reward confirmation`);
    assert(DungeonEvents.enter(state, nextId) === null,
      `${label}/${node.id}: next node accepted entry before reward confirmation`);
  }
  DungeonRewards.confirmReward(state);
  if (nextId) {
    assert(DungeonMap.canChoose(run, nextId),
      `${label}/${node.id}: next node stayed locked after reward confirmation`);
  }
}

async function settleEnteredNode(state, node, label) {
  const run = state.explore;
  if (combatTypes.has(node.type)) {
    state.battle = {
      exploration: true, nodeId: node.id, nodeType: node.type,
      defeatedEnemyIds: node.enemies.map(enemy => enemy.id),
      allies: run.activeParty.map(id => {
        const character = state.chars.find(item => item.id === id);
        return { ref: id, hp: character.hp };
      }),
    };
    assert(await DungeonRewards.completeBattle(state, true), `${label}/${node.id}: battle settlement failed`);
    confirmNodeReward(state, node, label);
  } else if (node.type === "chest") {
    await DungeonRewards.chest(state);
    assert(node.done, `${label}/${node.id}: chest settlement failed`);
    confirmNodeReward(state, node, label);
  } else if (node.type === "rest") {
    await DungeonRewards.rest(state, false);
  } else {
    throw new Error(`${label}/${node.id}: unexpected node type ${node.type}`);
  }
  assert(node.done && run.pending === null, `${label}/${node.id}: node did not complete`);
}

async function validateEveryNodeSettlement(sourceState, label) {
  const sourceNodes = DungeonEvents.nodes(sourceState.explore);
  for (const sourceNode of sourceNodes.slice(1)) {
    const state = JSON.parse(JSON.stringify(sourceState)), run = state.explore;
    const path = pathToNode(run, sourceNode.id), settled = new Set(path.slice(0, -1));
    assert(path.length > 1, `${label}/${sourceNode.id}: no legal route for settlement test`);
    DungeonEvents.nodes(run).forEach(node => { node.done = settled.has(node.id); });
    run.current = path.at(-2); run.pending = null; run.complete = false; run.rewardPopup = null;
    delete run.previous;
    state.battle = null; state.view = "dungeon";
    const result = DungeonEvents.enter(state, sourceNode.id);
    const node = DungeonEvents.nodes(run).find(item => item.id === sourceNode.id);
    assert(result && node, `${label}/${sourceNode.id}: could not enter node for real settlement`);
    await settleEnteredNode(state, node, `${label}/all-nodes`);
  }
}

async function settlePath(state, label) {
  const run = state.explore;
  while (!run.complete) {
    const current = DungeonEvents.nodes(run).find(node => node.id === run.current);
    const nextId = current?.next?.[0];
    assert(nextId, `${label}/${run.current}: no route to next layer`);
    const result = DungeonEvents.enter(state, nextId);
    const node = DungeonEvents.nodes(run).find(item => item.id === nextId);
    assert(result && node, `${label}/${nextId}: could not enter node`);
    await settleEnteredNode(state, node, label);
  }
}

async function completeRun(missionId, difficultyId, seed) {
  const oldRandom = Math.random;
  Math.random = seeded(seed);
  try {
    const state = GameStoreStateFactory.freshState();
    const difficultyIndex = difficultyIds.indexOf(difficultyId);
    state.unlockedDifficulties = difficultyIds.slice(0, difficultyIndex + 1);
    state.flags.underwaterTrainUnlocked = true;
    state.flags.orcDungeonUnlocked = true;
    const label = `${missionId}/${difficultyId}`;
    const start = await ServerCore.call("startDungeon", { missionId, difficultyId }, state);
    assert(start.ok, `${label}: local core rejected start`);
    DungeonEvents.start(state, missionId, difficultyId);
    assert(state.explore, `${label}: map creation failed`);
    validateRun(state.explore, label);
    validateServerRestore(state.explore, label);
    await validateEveryNodeSettlement(state, label);
    const before = {
      gold: state.resources.gold,
      essence: state.resources.essence,
      deck: state.deck.length,
      relics: state.resources.relics.length,
    };
    await settlePath(state, label);
    const run = state.explore;
    assert(run.complete, `${label}: boss path did not complete`);
    const earned = { ...run.earned, cards: [...run.earned.cards], relics: [...run.earned.relics] };
    await DungeonRewards.finish(state);
    assert(state.explore === null && state.view === "hall", `${label}: finish did not return to hall`);
    assert(state.resources.gold - before.gold === earned.gold, `${label}: banked gold mismatch`);
    assert(state.resources.essence - before.essence === earned.essence, `${label}: banked essence mismatch`);
    assert(state.deck.length - before.deck === earned.cards.length, `${label}: banked cards mismatch`);
    assert(state.resources.relics.length - before.relics === earned.relics.length, `${label}: banked relics mismatch`);
    const banked = JSON.stringify(state.resources);
    await ServerCore.call("bankRun", { run }, state);
    assert(JSON.stringify(state.resources) === banked, `${label}: repeated bank duplicated rewards`);
    const nextDifficulty = difficultyIds[difficultyIndex + 1];
    if (nextDifficulty) assert(state.unlockedDifficulties.includes(nextDifficulty), `${label}: next difficulty did not unlock`);
    const shouldQueueHoshino = missionId === "orc_dungeon" && difficultyId === "adventure";
    assert(!!state.flags.hoshinoFamilyUnlockPending === shouldQueueHoshino, `${label}: Hoshino Yi unlock condition mismatch`);
    if (shouldQueueHoshino) assert(state.hallModal === "hoshinoFamilyUnlock", `${label}: Hoshino family event did not open`);
  } finally {
    Math.random = oldRandom;
  }
}

function makeRewardTestState() {
  const state = GameStoreStateFactory.freshState();
  const run = {
    focusId: "reward-payload-recovery", missionId: "machine_factory", difficultyId: "normal",
    party: ["lokar"], activeParty: ["lokar"], current: "n1-0", pending: "n2-0",
    layers: [[{ id: "n1-0", layer: 1, col: 0, type: "start", done: true, next: ["n2-0"] }],
      [{ id: "n2-0", layer: 2, col: 0, type: "normal", done: false, next: [], enemies: [{ id: "test-enemy" }] }]],
    earned: { gold: 0, essence: 0, cards: [], relics: [] }, rewardPopup: null, complete: false,
  };
  state.explore = run;
  state.battle = {
    exploration: true, nodeId: "n2-0", nodeType: "normal", defeatedEnemyIds: ["test-enemy"],
    allies: [{ ref: "lokar", hp: state.chars.find(c => c.id === "lokar").hp }],
  };
  return { state, run, node: run.layers[1][0] };
}

async function testRewardPayloadRecovery() {
  const { state, run } = makeRewardTestState();
  await ServerCore.call("startDungeon", {
    missionId: run.missionId, difficultyId: run.difficultyId, runId: run.focusId,
  }, state);
  const originalCall = ServerCore.call;
  ServerCore.call = async (...args) => {
    const result = await originalCall(...args);
    if (result.result?.core) delete result.result.core.lastLocalReward;
    return result;
  };
  try {
    assert(await DungeonRewards.completeBattle(state, true), "settlement must recover a missing direct reward payload");
    assert(run.rewardPopup?.gold > 0 && run.earned.gold === run.rewardPopup.gold, "recovered reward must display and accumulate real gold");
  } finally {
    ServerCore.call = originalCall;
  }
}

async function testEmptyRewardRejection() {
  const { state, run, node } = makeRewardTestState();
  const originalCall = ServerCore.call;
  ServerCore.call = async () => ({
    ok: true,
    result: {
      reward: { nodeId: node.id, gold: 0, essence: 0, cards: [], relics: [] },
    },
  });
  try {
    assert(!(await DungeonRewards.completeBattle(state, true)),
      "an all-empty reward payload must pause settlement");
    assert(run.pending === node.id && !node.done,
      "an all-empty reward must keep the node pending");
    assert(state.battle?.nodeId === node.id && !run.rewardPopup,
      "an all-empty reward must preserve the battle and hide reward confirmation");
    assert(run.earned.gold === 0 && run.earned.essence === 0,
      "an all-empty reward must not change accumulated rewards");
  } finally {
    ServerCore.call = originalCall;
  }
  const malformed = DungeonRewardPayload.pendingSnapshot({
    _localPendingRun: { gold: 0, essence: 0, cards: {}, relics: 7 },
  });
  assert(Array.isArray(malformed.cards) && !malformed.cards.length
    && Array.isArray(malformed.relics) && !malformed.relics.length,
  "malformed pending reward lists must normalize without throwing");
}

module.exports = {
  completeRun, settleEnteredNode, settlePath, testEmptyRewardRejection,
  testRewardPayloadRecovery, validateEveryNodeSettlement,
};
