window.StoreUnlockRecovery = (() => {
  const done = (state, id) => window.UnlockEventProgress.isCompleted(state, id);
  const character = (state, id) => state.chars.find(item => item.id === id);

  function recoverPendingDefeatEvents(state) {
    const safeHall = state.view === "hall" && !state.battle
      && !state.explore && !state.hallModal;
    if (!safeHall) return false;
    if (state.flags.firstDefeatSeen && !done(state, "first_defeat")) {
      state.hallModal = "firstDefeat";
    } else if (state.flags.secondDefeatSeen && !done(state, "second_defeat")) {
      state.hallModal = "secondDefeat";
    }
    return !!state.hallModal;
  }

  function recoverPostUnderwaterTrainEvents(state) {
    if (state.battle || state.explore || state.hallModal) return false;
    const ophelia = character(state, "ophelia");
    if (state.flags?.underwaterTrainFirstClear
      && ophelia?.locked && !state.flags.opheliaUnlockSeen) {
      state.view = "hall";
      state.hallModal = "opheliaUnlock";
      return true;
    }
    if (state.flags?.bestaNurseryUnlockPending
      && !state.flags.bestaNurseryUnlocked
      && !state.flags.bestaNurseryUnlockSeen) {
      state.view = "hall";
      state.hallModal = "bestaNurseryUnlock";
      return true;
    }
    return false;
  }

  function recoverPendingLittleElranaEvent(state) {
    if (!state.flags?.littleElranaUnlockPending) return;
    if (state.flags.littleElranaUnlockSeen) {
      delete state.flags.littleElranaUnlockPending;
      return;
    }
    const little = character(state, "little_elrana");
    if (little && !little.locked) {
      state.flags.littleElranaUnlockSeen = true;
      delete state.flags.littleElranaUnlockPending;
      return;
    }
    if (little?.locked) {
      state.view = "hall";
      state.hallModal = "littleElranaUnlock";
    }
  }

  function recoverInterruptedBattle(state) {
    if (!state.battle && state.view !== "battle"
      && state.view !== "battleLoading") return null;
    const wasTest = !!state.battle?.test || state.testBattleStarting
      || state.loadingBattleName === "测试战斗";
    const ids = wasTest ? (state.testAllies || []) : (state.party || []);
    ids.slice(0, 4).forEach(id => {
      const member = character(state, id);
      if (member) member.hp = member.stats.maxHp;
    });
    if (!wasTest && state.explore) {
      window.StoreRunMigrations.rollbackPendingNode(state.explore);
    }
    state.battle = null;
    state.loadingBattleName = null;
    state.loadingBattleProgress = null;
    state.view = wasTest ? "hall" : state.explore ? "dungeon" : "hall";
    state.battleLog = [];
    state.log = state.log || [];
    state.log.unshift(wasTest
      ? "检测到上次测试战斗中断，已返回测试配置并保留临时卡牌/饰品选择。"
      : "检测到上次战斗中断，已返回据点并恢复出战角色。请重新进入战斗。");
    state.log = state.log.slice(0, 30);
    return wasTest ? "testBattle" : null;
  }

  function recoverPartyUnlocks(state) {
    const party = new Set(Array.isArray(state.party) ? state.party : []);
    let changed = false;
    state.chars.forEach(member => {
      if (!party.has(member.id) || !member.locked) return;
      member.locked = false;
      member.hp = member.stats.maxHp;
      changed = true;
    });
    return changed;
  }

  return {
    recoverInterruptedBattle,
    recoverPartyUnlocks,
    recoverPendingDefeatEvents,
    recoverPendingLittleElranaEvent,
    recoverPostUnderwaterTrainEvents,
  };
})();
