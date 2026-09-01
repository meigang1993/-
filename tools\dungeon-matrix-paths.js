const {
  assert, DungeonEvents, DungeonMap, GameStoreStateFactory,
} = require("./dungeon-matrix-harness");
const { validateRun } = require("./dungeon-matrix-validation");

function pathToNode(run, targetId) {
  const byId = new Map(DungeonEvents.nodes(run).map(node => [node.id, node]));
  const startId = run.layers[0][0].id, queue = [[startId]], visited = new Set([startId]);
  while (queue.length) {
    const path = queue.shift(), currentId = path.at(-1);
    if (currentId === targetId) return path;
    byId.get(currentId).next.forEach(id => {
      if (!visited.has(id)) { visited.add(id); queue.push([...path, id]); }
    });
  }
  return [];
}

function pathToBoss(run) {
  const boss = run.layers.at(-1)[0];
  return pathToNode(run, boss.id).map(id => DungeonEvents.nodes(run).find(node => node.id === id));
}

function validateServerRestore(sourceRun, label) {
  const route = pathToBoss(sourceRun), boss = route.at(-1);
  const plan = {
    ...DungeonEvents.plan(sourceRun),
    missionId: sourceRun.missionId,
    difficultyId: sourceRun.difficultyId,
    settledNodes: route.slice(0, -1).map(node => node.id),
  };
  const state = GameStoreStateFactory.freshState();
  assert(DungeonEvents.restoreServerRun(state, plan, { gold: 0, essence: 0, cards: [], relics: [] }), `${label}: server run restore failed`);
  validateRun(state.explore, `${label}/restored`);
  assert(state.explore.current === route.at(-2).id, `${label}: restored current node is not the last settled node`);
  assert(DungeonMap.canChoose(state.explore, boss.id), `${label}: restored boss node is not selectable`);
}

module.exports = { pathToBoss, pathToNode, validateServerRestore };
