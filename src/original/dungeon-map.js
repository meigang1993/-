window.DungeonMap = (() => {
  const meta = {
    start: ["start", "起点"], normal: ["normal", "普通战斗"], elite: ["elite", "精英战斗"], rest: ["rest", "休整"], chest: ["chest", "宝箱"], boss: ["boss", "BOSS"],
  };
  const sample = (arr, state = window.state) => window.GameRandom.sample(arr, state);
  const rand = (min, max, state = window.state) => window.GameRandom.int(min, max, state);
  function makeNode(layer, col, type) { return { id: `n${layer}-${col}`, layer, col, type, enemies: null, next: [], done: false }; }
  function buildLayers(mission, diff, state = window.state) {
    if (mission?.route?.type === "linear") return linearLayers(mission.route, diff, state);
    if (mission?.route?.type === "fixed-random") return fixedRandomLayers(mission.route, diff, state);
    const layers = [[makeNode(1, 0, "start")]];
    for (let i = 2; i <= diff.layers; i++) layers.push(i === diff.layers ? [makeNode(i, 0, "boss")] : Array.from({ length: rand(3, 5, state) }, (_, c) => makeNode(i, c, pickNodeType(diff, state))));
    return layers;
  }
  function fixedRandomLayers(route, diff, state) {
    const last = route.layers || diff.layers, rest = new Set(route.rest || []), chest = new Set(route.chest || []), boss = new Set(route.boss || [last]);
    const fixedType = layer => layer === 1 ? "start" : boss.has(layer) ? "boss" : rest.has(layer) ? "rest" : chest.has(layer) ? "chest" : null;
    return Array.from({ length: last }, (_, i) => {
      const layer = i + 1, type = fixedType(layer);
      if (type) return [makeNode(layer, 0, type)];
      return Array.from({ length: rand(3, 5, state) }, (_, c) => makeNode(layer, c, "normal"));
    });
  }
  function linearLayers(route, diff, state) {
    const last = route.layers || diff.layers, rest = new Set(route.rest || []), chest = new Set(route.chest || []), boss = new Set(route.boss || [last]);
    return Array.from({ length: last }, (_, i) => {
      const layer = i + 1, type = layer === 1 ? "start" : boss.has(layer) ? "boss" : rest.has(layer) ? "rest" : chest.has(layer) ? "chest" : layer >= (route.mixedEliteFrom || 99) && window.GameRandom.chance(diff.eliteRate || 0, state) ? "elite" : "normal";
      return [makeNode(layer, 0, type)];
    });
  }
  function pickNodeType(diff, state) {
    return window.GameRandom.chance(diff.eliteRate || 0, state) ? "elite" : pickType(diff.weights, state);
  }
  function pickType(weights, state) {
    let roll = window.GameRandom.value(state) * Object.values(weights).reduce((a, b) => a + b, 0);
    for (const [type, weight] of Object.entries(weights)) { roll -= weight; if (roll <= 0) return type; }
    return "normal";
  }
  function connect(layers, state = window.state) {
    for (let i = 0; i < layers.length - 1; i++) {
      const from = layers[i], to = layers[i + 1];
      from.forEach((n, c) => { n.next = to.filter((_, x) => Math.abs(x - c) <= 1 || from.length === 1 || to.length === 1).map(x => x.id); if (!n.next.length) n.next = [nearest(to, c).id]; });
      to.forEach(t => { if (!from.some(n => n.next.includes(t.id))) sample(from, state).next.push(t.id); });
    }
  }
  function nearest(layer, col) { return layer.reduce((best, n) => Math.abs(n.col - col) < Math.abs(best.col - col) ? n : best, layer[0]); }
  function repairLinks(run) {
    if (!run?.layers) return;
    for (let i = 0; i < run.layers.length - 1; i++) {
      const from = run.layers[i], to = run.layers[i + 1];
      from.forEach(n => { const valid = (n.next || []).filter(id => to.some(t => t.id === id)); n.next = valid.length ? valid : [nearest(to, n.col).id]; });
    }
  }
  function currentNode(run) { repairLinks(run); return nodes(run).find(n => n.id === run.current); }
  function nodes(run) { return run.layers.flat(); }
  function canChoose(run, id) { return !run.pending && !run.rewardPopup && currentNode(run)?.next.includes(id) && !nodes(run).find(n => n.id === id)?.done; }
  function validType(type) { return ["start", "normal", "elite", "rest", "chest", "boss"].includes(type); }
  return { meta, makeNode, buildLayers, connect, nodes, canChoose, validType };
})();
