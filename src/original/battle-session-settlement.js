window.BattleSessionSettlement = ({
  cleanupBattlePrompts, clearBattleLog, getCombat,
}) => {
  function directMissionReward(state, battle) {
    if (!Array.isArray(state.log)) state.log = [];
    const missions = Array.isArray(GameData.missions) ? GameData.missions : [];
    const mission = missions.find(item => item.id === battle.missionId);
    const gold = mission?.reward?.gold;
    if (mission && mission.reward && Number.isSafeInteger(gold) && gold >= 0) {
      return { mission, gold };
    }
    const message = "任务奖励数据异常，奖励未写入。请重试结算。";
    battle.pendingVictory = false;
    battle.settlementError = message;
    window.BattleVictory?.open(state);
    if (state.log[0] !== message) state.log.unshift(message);
    window.dzmm?.toast?.error?.(message);
    return null;
  }

  async function finishBattle(state, win, skipVictory = false) {
    if (!win) {
      getCombat().checkDefeat(state);
      return;
    }
    const battle = state.battle;
    if (!battle) return false;
    if (!battle.pendingVictory && !skipVictory) {
      cleanupBattlePrompts(battle);
      if (state.battle !== battle) return false;
      battle.pendingVictory = true;
      battle.locked = true;
      return;
    }
    cleanupBattlePrompts(battle);
    if (state.battle !== battle) return false;
    battle.pendingVictory = false;
    if (!skipVictory && !battle.victoryScreen) {
      window.BattleVictory?.open(state);
      return;
    }
    if (battle.test) {
      clearBattleLog(state);
      battle.locked = true;
      battle.testComplete = true;
      battle.selectedCardIndex = null;
      battle.selectedCostCardIndex = null;
      battle.selectedBagIndexes = null;
      battle.pendingTargetUid = null;
      state.log.unshift("测试完成。");
      return;
    }
    if (battle.exploration) {
      const settled = await window.DungeonSystem?.completeBattle(state, true);
      if (settled) return;
      if (state.battle !== battle) return false;
      battle.pendingVictory = false;
      window.BattleVictory?.open(state);
      state.log.unshift("副本结算失败，请在胜利界面重试。");
      return;
    }
    const reward = directMissionReward(state, battle);
    if (!reward) return false;
    const { mission, gold } = reward;
    delete battle.settlementError;
    state.resources.gold = window.GameStoreSaveLimits.addResource(
      state.resources.gold, gold
    );
    if (mission.kind === "limited") {
      if (!Array.isArray(state.completed)) state.completed = [];
      if (!state.completed.includes(mission.id)) state.completed.push(mission.id);
    }
    clearBattleLog(state);
    state.log.unshift(`胜利，获得莉莉丝元${gold}。`);
    window.BattleFX?.leave?.(state);
    state.view = "hall";
    state.battle = null;
    return true;
  }

  return finishBattle;
};
