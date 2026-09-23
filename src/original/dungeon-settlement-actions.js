window.DungeonSettlementActions = (() => {
  function unlockEliteCards(state, battle) {
    (battle.defeatedEnemyIds || [])
      .filter(id => GameData.eliteUnlocks?.[id] && !state.defeatedElites.includes(id))
      .forEach(id => {
        state.defeatedElites.push(id);
        GameData.eliteUnlocks[id].forEach(name => {
          if (!state.unlockedShopCards.includes(name)) state.unlockedShopCards.push(name);
        });
        const enemy = Object.values(GameData.enemies).flat().find(item => item.id === id);
        const label = enemy?.type === "boss" ? "BOSS" : "精英";
        if (id === "shark_captain_mordio") {
          state.log.unshift("首次击败莫迪奥：商店商品位与任务列表上限扩展至7，BOSS讨伐任务可跨副本同时出现。");
        }
        state.log.unshift(`首次击败${label}：${enemy?.name || id}，新卡牌已加入商店池。`);
      });
  }

  function queueBattleExtras(state, run, nodeId, battle) {
    const key = `${run.focusId || run.missionId}:${nodeId}`;
    const battleData = { defeatedEnemyIds: [...(battle.defeatedEnemyIds || [])] };
    window.SettlementRecovery.enqueue(state, {
      id: `battle-unlock:${key}`, type: "battleUnlock", data: battleData,
    });
    window.SettlementRecovery.enqueue(state, {
      id: `battle-bounty:${key}`, type: "battleBounty",
      data: {
        battle: battleData,
        run: { focusId: run.focusId, missionId: run.missionId },
      },
    });
    window.SettlementRecovery.enqueue(state, {
      id: `battle-claim:${key}`, type: "claimBounty", data: {},
    });
  }

  function queueDungeonCompletion(state, run) {
    if (!run?.complete) return;
    const key = run.focusId || `${run.missionId}:${run.difficultyId}`;
    const runCopy = {
      focusId: run.focusId, missionId: run.missionId,
      difficultyId: run.difficultyId, complete: true,
      party: [...(run.party || [])], activeParty: [...(run.activeParty || [])],
    };
    window.SettlementRecovery.enqueue(state, {
      id: `finish-bounty:${key}`, type: "dungeonBounty", data: { run: runCopy },
    });
    window.SettlementRecovery.enqueue(state, {
      id: `finish-claim:${key}`, type: "claimBounty", data: {},
    });
  }

  async function applyPending(state, action) {
    if (action.type === "battleUnlock") return unlockEliteCards(state, action.data);
    if (action.type === "battleBounty") {
      return window.BountySystem?.completeBattle?.(state, action.data.battle, action.data.run);
    }
    if (action.type === "dungeonBounty") {
      return window.BountySystem?.completeDungeon?.(state, action.data.run);
    }
    if (action.type === "shopRefresh") {
      if (await window.ShopSystem?.refresh?.(state) !== true) {
        throw new Error("商店刷新未完成");
      }
      return true;
    }
    if (action.type === "claimBounty"
      && await window.BountySystem?.claimPending?.(state) === false) {
      throw new Error("任务奖励领取未完成");
    }
    if (action.type !== "claimBounty") {
      throw new Error(`未知附加结算类型：${action.type}`);
    }
  }

  function retryPending(state) {
    return window.SettlementRecovery.run(state, action => applyPending(state, action));
  }

  return { queueBattleExtras, queueDungeonCompletion, retryPending };
})();
