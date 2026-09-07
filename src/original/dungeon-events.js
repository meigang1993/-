window.DungeonEvents = (() => {
  const map = () => window.DungeonMap;
  function createFocusId(missionId, difficultyId, state = window.state) {
    return `${missionId}-${difficultyId}-${window.GameRandom.persistentId("run-", state)}`;
  }
  function start(state, missionId, difficultyId = "normal", runId = "") {
    if (!state.unlockedDifficulties.includes(difficultyId)) return;
    const diff = GameData.difficulties[difficultyId], mission = GameData.missions.find(m => m.id === missionId), layers = map().buildLayers(mission, diff, state);
    layers.flat().forEach(n => { if (["normal", "elite", "boss"].includes(n.type)) n.enemies = window.DungeonEnemyGroups.enemiesFor({ missionId, difficultyId }, n.type, state); });
    map().connect(layers, state); layers[0][0].done = true;
    const party = [...state.party].slice(0, 4);
    const focusId = runId || createFocusId(missionId, difficultyId, state);
    const run = { focusId, missionId, difficultyId, party, activeParty: [...party], layers, current: "n1-0", earned: { gold: 0, essence: 0, relics: [], cards: [] }, pending: null, lastReward: null, complete: false };
    applyBountyTargets(state, run);
    state.explore = run;
    state.view = "dungeon"; state.log.unshift(`进入${mission?.name || "副本"}·${diff.name}难度，共${layers.length}层。`);
  }
  function plan(run) {
    return {
      nodes: map().nodes(run).map(n => ({
        id: n.id,
        type: n.type,
        enemyIds: (n.enemies || []).map(e => e.id).filter(Boolean),
      })),
    };
  }
  function applyServerPlan(run, plan, state = null) {
    const serverNodes = Array.isArray(plan?.nodes) ? plan.nodes : [];
    if (!run || !serverNodes.length) return false;
    const grouped = {};
    serverNodes.forEach((src, index) => {
      const m = /^n(\d+)-(\d+)$/.exec(String(src.id || ""));
      const layer = m ? Number(m[1]) : index + 1, col = m ? Number(m[2]) : 0;
      const type = map().validType(src.type) ? src.type : (layer === 1 ? "start" : "normal");
      const settled = new Set(plan?.settledNodes || []);
      const node = { id: `n${layer}-${col}`, layer, col, type, enemies: null, next: [], done: layer === 1 || settled.has(`n${layer}-${col}`) };
      if (["normal", "elite", "boss"].includes(type)) node.enemies = window.DungeonEnemyGroups.fromIds(run, type, src.enemyIds, state);
      (grouped[layer] ||= []).push(node);
    });
    run.layers = Object.entries(grouped).sort(([a], [b]) => Number(a) - Number(b)).map(([, layer]) => layer.sort((a, b) => a.col - b.col));
    map().connect(run.layers, state);
    if (state) markBountyTargets(state, run);
    run.current = run.layers[0]?.[0]?.id || "n1-0"; run.pending = null; run.complete = false; run.keepScroll = true;
    delete run.previous; run.lastReward = null;
    return true;
  }
  function restoreServerRun(state, plan, pendingRun) {
    if (state.explore || !Array.isArray(plan?.nodes) || !plan.nodes.length) return false;
    const party = (state.party || []).filter(id => state.chars?.some(c => c.id === id && !c.locked)).slice(0, 4);
    const cards = Array.isArray(pendingRun?.cards) ? pendingRun.cards : [], relics = Array.isArray(pendingRun?.relics) ? pendingRun.relics : [];
    const run = { focusId: `${plan.missionId}-${plan.difficultyId}-server`, missionId: plan.missionId, difficultyId: plan.difficultyId, party, activeParty: [...party], layers: [], current: "n1-0", earned: { gold: Number(pendingRun?.gold) || 0, essence: Number(pendingRun?.essence) || 0, relics: [...relics], cards: [...cards] }, pending: null, lastReward: null, complete: false };
    if (!applyServerPlan(run, plan, state)) return false;
    restoreCurrent(run, plan);
    state.explore = run; state.battle = null; state.view = "dungeon"; state.hallModal = null;
    state.log?.unshift?.("已恢复未完成副本。若之前停在战斗中，已回到战斗前的可选节点。");
    return true;
  }
  function restoreCurrent(run, plan) {
    const list = map().nodes(run), settled = new Set(plan?.settledNodes || []), rewardTypes = new Set(["normal", "elite", "boss", "chest"]);
    list.forEach(n => { n.done = n.type === "start" || settled.has(n.id); });
    const candidate = list.filter(n => n.done).sort((a, b) => b.layer - a.layer).find(n => (n.next || []).some(id => !list.find(x => x.id === id)?.done));
    run.current = (candidate || list.find(n => n.done) || list[0])?.id || "n1-0";
    run.pending = null; delete run.previous; run.lastReward = null;
    run.complete = list.filter(n => rewardTypes.has(n.type)).every(n => n.done);
  }
  function enter(state, id) {
    const run = state.explore, node = map().nodes(run).find(n => n.id === id);
    if (!node || !map().canChoose(run, id) || (run.activeParty && !run.activeParty.length)) return null;
    run.previous = run.current; run.current = id; run.pending = id; run.lastReward = null; delete run.keepScroll; delete run.scrollAnchorId;
    if (["normal", "elite", "boss"].includes(node.type)) return { battle: true, context: { exploration: true, nodeId: id, nodeType: node.type, enemies: node.enemies || window.DungeonEnemyGroups.enemiesFor(run, node.type, state) } };
    return { battle: false };
  }
  function rollbackPending(state, expectedNodeId = "") {
    return window.StoreRunMigrations.rollbackPendingNode(
      state.explore, expectedNodeId);
  }
  function applyBountyTargets(state, run) {
    const pool = GameData.enemies[run.missionId] || [], diff = GameData.difficulties[run.difficultyId];
    const targets = (state.bounties || []).filter(t => t.accepted && t.type === "hunt" && t.missionId === run.missionId).map(task => ({ task, target: pool.find(e => e.id === task.targetId) })).filter(x => x.target);
    const bosses = [...new Map(targets.filter(x => x.target.type === "boss").map(x => [x.target.id, x])).values()];
    if (bosses.length) forceBossNode(run, pool, diff, bosses, state);
    const used = new Set();
    targets.filter(x => x.target.type === "elite").forEach(x => forceEliteNode(run, pool, diff, x.target, used, x.task, state));
  }
  function markBountyTargets(state, run) {
    const tasks = (state.bounties || []).filter(t => t.accepted && t.type === "hunt" && t.missionId === run.missionId);
    tasks.forEach(task => {
      const node = map().nodes(run).find(n => (n.enemies || []).some(e => e.id === task.targetId));
      if (node) window.BountySystem?.markMapNode?.(node, task);
    });
  }
  function forceBossNode(run, pool, diff, bosses, state) {
    const node = map().nodes(run).find(n => n.type === "boss") || run.layers[run.layers.length - 1]?.[0];
    if (!node) return;
    node.type = "boss"; node.enemies = window.DungeonEnemyGroups.bossGroup(pool, diff, bosses.map(x => x.target), state);
    node.bounty = { type: "hunt", title: bosses.length === 1 ? (window.BountySystem?.title?.(bosses[0].task) || `讨伐 ${bosses[0].target.name}`) : `讨伐 ${bosses.map(x => x.target.name).join("、")}` };
  }
  function forceEliteNode(run, pool, diff, target, used, task, state) {
    const candidates = run.layers.slice(1, -1).flat().filter(n => !used.has(n.id) && ["elite", "normal"].includes(n.type));
    const node = candidates.find(n => n.type === "elite") || candidates[0];
    if (!node) return;
    used.add(node.id); node.type = "elite"; node.enemies = window.DungeonEnemyGroups.eliteGroup(pool, diff, target.id, state);
    if (task) window.BountySystem?.markMapNode?.(node, task);
  }
  return {
    createFocusId, start, enter, rollbackPending, plan, applyServerPlan, restoreServerRun,
    nodes: run => map().nodes(run),
    render: state => window.DungeonRender.render(state),
    rewardPopup: run => window.DungeonRender.rewardPopup(run),
  };
})();
