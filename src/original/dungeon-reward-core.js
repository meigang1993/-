window.DungeonRewardCore = (() => {
  const reward = window.GameEconomy.dungeonGold;
  const settlingRuns = new WeakMap();
  const nodes = run => window.DungeonEvents.nodes(run);
  function rollGold(run, type, state = window.state) {
    const diff = GameData.difficulties[run.difficultyId], baseGold = reward[type] || 0;
    const mission = GameData.missions.find(m => m.id === run.missionId), multiplier = mission?.reward?.goldMultiplier || 1;
    const raw = Array.isArray(baseGold) ? window.GameRandom.int(baseGold[0], baseGold[1], state) : baseGold;
    return Math.round(raw * (diff.reward || 1) * multiplier);
  }
  function gain(run, type, count = 1, state = window.state) {
    run.lastReward = { gold: 0, essence: 0, relics: [], cards: [], type };
    for (let i = 0; i < count; i++) run.lastReward.gold += rollGold(run, type, state);
    run.earned.gold += run.lastReward.gold;
  }
  function completeNode(state, extraType) {
    const run = state.explore, node = nodes(run).find(n => n.id === run.pending);
    if (!node) return;
    if (extraType) gain(run, extraType, 1, state);
    node.done = true; run.pending = null; run.keepScroll = true; delete run.previous;
    if (node.layer === run.layers.length) run.complete = true;
  }
  function beginSettle(run) {
    const nodeId = run?.pending, node = nodeId && nodes(run).find(n => n.id === nodeId);
    if (!nodeId || !node || node.done || settlingRuns.get(run) === nodeId) return null;
    settlingRuns.set(run, nodeId);
    return { nodeId, node };
  }
  function canApplyReward(run, token, reward) {
    const current = token?.nodeId && nodes(run).find(n => n.id === token.nodeId);
    return !!current && !current.done && run.pending === token.nodeId && reward?.nodeId === token.nodeId;
  }
  function endSettle(run, token) {
    if (settlingRuns.get(run) === token?.nodeId) settlingRuns.delete(run);
  }
  function rewardText(run) { return `莉莉丝元${run.earned.gold} / 精华宝珠${run.earned.essence}`; }
  function healParty(state) {
    const ids = state.explore?.party || state.party;
    ids.forEach(id => {
      const c = state.chars.find(x => x.id === id);
      if (c) c.hp = c.stats.maxHp;
    });
  }
  return { nodes, rollGold, gain, completeNode, beginSettle, canApplyReward, endSettle, rewardText, healParty };
})();
