const {
  assert, combatTypes, DungeonEvents, DungeonMap, GameData, RelicSystem,
} = require("./dungeon-matrix-harness");

function validateReachability(run, label, nodes, byId, incoming) {
  const reachable = new Set([run.layers[0][0].id]), queue = [...reachable];
  while (queue.length) {
    const node = byId.get(queue.shift());
    node.next.forEach(id => { if (!reachable.has(id)) { reachable.add(id); queue.push(id); } });
  }
  nodes.forEach(node => assert(reachable.has(node.id), `${label}/${node.id}: unreachable from start`));

  const reachesBoss = new Set(run.layers.at(-1).map(node => node.id)), reverseQueue = [...reachesBoss];
  while (reverseQueue.length) {
    incoming.get(reverseQueue.shift()).forEach(node => {
      if (!reachesBoss.has(node.id)) { reachesBoss.add(node.id); reverseQueue.push(node.id); }
    });
  }
  nodes.forEach(node => assert(reachesBoss.has(node.id), `${label}/${node.id}: cannot reach a boss`));
}

function validateNodeChoices(run, label, nodes, incoming) {
  const original = {
    current: run.current,
    pending: run.pending,
    done: new Map(nodes.map(node => [node.id, node.done])),
  };
  try {
    nodes.slice(1).forEach(node => {
      incoming.get(node.id).forEach(previous => {
        run.current = previous.id;
        run.pending = null;
        node.done = false;
        assert(DungeonMap.canChoose(run, node.id), `${label}/${previous.id}->${node.id}: legal next node is not selectable`);
      });
      node.done = true;
      assert(!DungeonMap.canChoose(run, node.id), `${label}/${node.id}: completed node is selectable`);
      node.done = false;
      run.pending = node.id;
      assert(!DungeonMap.canChoose(run, node.id), `${label}/${node.id}: node is selectable while another entry is pending`);
    });
  } finally {
    run.current = original.current;
    run.pending = original.pending;
    nodes.forEach(node => { node.done = original.done.get(node.id); });
  }
}

function validateRun(run, label) {
  const mission = GameData.missions.find(item => item.id === run.missionId);
  const expectedLayers = mission.route?.layers || GameData.difficulties[run.difficultyId].layers;
  const nodes = DungeonEvents.nodes(run);
  const byId = new Map(nodes.map(node => [node.id, node]));
  const incoming = new Map(nodes.map(node => [node.id, []]));
  const pool = new Set((GameData.enemies[run.missionId] || []).map(enemy => enemy.id));
  assert(run.layers.length === expectedLayers, `${label}: wrong layer count`);
  run.layers.forEach((layer, layerIndex) => {
    assert(layer.length > 0, `${label}/layer-${layerIndex + 1}: empty layer`);
    layer.forEach((node, colIndex) => {
      assert(node.id === `n${layerIndex + 1}-${colIndex}`, `${label}/${node.id}: invalid node id`);
      assert(node.layer === layerIndex + 1 && node.col === colIndex, `${label}/${node.id}: invalid coordinates`);
      assert(DungeonMap.validType(node.type), `${label}/${node.id}: invalid node type`);
    });
  });
  assert(nodes[0].type === "start" && nodes[0].done, `${label}: invalid start node`);
  assert(run.layers.at(-1).every(node => node.type === "boss"), `${label}: final layer must be boss`);
  assert(new Set(nodes.map(node => node.id)).size === nodes.length, `${label}: duplicate node ids`);
  nodes.forEach(node => {
    const targets = node.next || [];
    assert(new Set(targets).size === targets.length, `${label}/${node.id}: duplicate outgoing edge`);
    if (node.layer < expectedLayers) assert(targets.length > 0, `${label}/${node.id}: dead end`);
    else assert(targets.length === 0, `${label}/${node.id}: final node has outgoing edge`);
    targets.forEach(id => {
      const target = byId.get(id);
      assert(target, `${label}/${node.id}: edge points to missing node ${id}`);
      assert(target.layer === node.layer + 1, `${label}/${node.id}: edge skips to layer ${target.layer}`);
      incoming.get(id).push(node);
    });
    if (!combatTypes.has(node.type)) return;
    assert(node.enemies?.length > 0, `${label}/${node.id}: empty enemy group`);
    node.enemies.forEach(enemy => {
      assert(pool.has(enemy.id), `${label}/${node.id}: unknown enemy ${enemy.id}`);
      assert(Number.isFinite(enemy.hp) && enemy.hp > 0, `${label}/${node.id}/${enemy.id}: invalid hp`);
      ["attack", "magic", "speed", "bloodlust", "handLimit", "drawPerTurn", "initialDraw"].forEach(stat => {
        assert(Number.isFinite(enemy[stat]) && enemy[stat] >= 0, `${label}/${node.id}/${enemy.id}: invalid ${stat}`);
      });
      const expectedRelics = RelicSystem.enemyRelics(enemy.id);
      if (run.difficultyId === "hell" && expectedRelics.length) {
        assert(JSON.stringify(enemy.battleRelics) === JSON.stringify(expectedRelics), `${label}/${node.id}/${enemy.id}: missing hero relics`);
      }
    });
  });
  nodes.slice(1).forEach(node => assert(incoming.get(node.id).length > 0, `${label}/${node.id}: no incoming edge`));
  validateReachability(run, label, nodes, byId, incoming);
  validateNodeChoices(run, label, nodes, incoming);
}

module.exports = { validateNodeChoices, validateReachability, validateRun };
