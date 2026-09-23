window.DungeonNodeRewards = (() => {
  const {
    completeNode, beginSettle, canApplyReward, endSettle,
  } = window.DungeonRewardCore;
  const { missingReward, pendingSnapshot, rewardFromSettlement } = window.DungeonRewardPayload;
  const {
    queueBattleExtras, queueDungeonCompletion, retryPending,
  } = window.DungeonSettlementActions;

  async function completeBattle(state, win) {
    const battle = state.battle;
    const run = state.explore;
    if (!run || !battle?.exploration || !win) return false;
    const token = beginSettle(run);
    if (!token) return false;
    try {
      const before = pendingSnapshot(state);
      const result = await window.ServerCore.call("settleDungeon", {
        run, nodeId: token.nodeId, kind: battle.nodeType,
        defeatedEnemyIds: battle.defeatedEnemyIds || [],
      }, state);
      if (result.stale) return false;
      if (!result.ok) return false;
      const reward = rewardFromSettlement(result, state, token.nodeId, before);
      if (!reward) {
        missingReward(state, token.nodeId);
        return false;
      }
      if (!canApplyReward(run, token, reward)) return false;
      syncHp(state, battle);
      run.lastReward = {
        gold: reward.gold || 0, essence: reward.essence || 0,
        experience: reward.experience || 0,
        progression: reward.progression || [],
        relics: reward.relics || [], cards: reward.cards || [], type: battle.nodeType,
      };
      run.earned.gold += run.lastReward.gold;
      run.earned.essence += run.lastReward.essence;
      run.earned.relics.push(...run.lastReward.relics);
      run.earned.cards.push(...run.lastReward.cards);
      state.log.unshift(`节点胜利，获得莉莉丝元${run.lastReward.gold}${run.lastReward.essence
        ? `、精华宝珠${run.lastReward.essence}` : ""}${run.activeParty?.length
        ? "。" : "，全员被击倒。"}`);
      run.rewardPopup = { ...run.lastReward };
      completeNode(state);
      window.BattleFX?.leave?.(state);
      state.battle = null;
      state.view = "dungeon";
      queueBattleExtras(state, run, token.nodeId, battle);
      queueDungeonCompletion(state, run);
      await retryPending(state);
      return true;
    } finally {
      endSettle(run, token);
    }
  }

  function syncHp(state, battle) {
    const fallen = [];
    battle.allies.forEach(ally => {
      const character = state.chars.find(item => item.id === ally.ref);
      if (!character) return;
      const ratio = ally.hp > 0
        ? ally.hp / Math.max(1, ally.maxHp || ally.stats?.maxHp || 1) : 0;
      character.hp = ratio > 0
        ? Math.max(1, Math.min(character.stats.maxHp,
          Math.round(character.stats.maxHp * ratio)))
        : 0;
      if (character.hp <= 0) fallen.push(character.id);
    });
    if (state.explore?.activeParty) {
      state.explore.activeParty = state.explore.activeParty
        .filter(id => !fallen.includes(id));
    }
    window.BountySystem?.markFallen?.(state, fallen);
    fallen.forEach(id => {
      const character = state.chars.find(item => item.id === id);
      if (character) character.hp = character.stats.maxHp;
    });
  }

  async function chest(state) {
    const run = state.explore;
    const token = beginSettle(run);
    if (!token) return;
    try {
      const before = pendingSnapshot(state);
      const result = await window.ServerCore.call("settleDungeon", {
        run, nodeId: token.nodeId, kind: "chest",
      }, state);
      if (result.stale) return;
      if (!result.ok) return;
      const reward = rewardFromSettlement(result, state, token.nodeId, before);
      if (!reward) {
        missingReward(state, token.nodeId);
        return;
      }
      if (!canApplyReward(run, token, reward)) return;
      run.lastReward = {
        gold: reward.gold || 0, essence: 0, relics: [], cards: [], type: "chest",
      };
      run.earned.gold += run.lastReward.gold;
      completeNode(state);
      run.rewardPopup = { ...run.lastReward, type: "chest" };
      queueDungeonCompletion(state, run);
      await retryPending(state);
      state.log.unshift(`开启宝箱，获得莉莉丝元${run.lastReward.gold}。`);
    } finally {
      endSettle(run, token);
    }
  }
  return { completeBattle, chest, retryPending };
})();
