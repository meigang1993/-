window.DungeonRunRewards = (() => {
  const { completeNode, rewardText, healParty } = window.DungeonRewardCore;
  const retryPending = state => window.DungeonNodeRewards.retryPending(state);

  async function rest(state) {
    const ids = state.explore?.activeParty || state.party;
    if (!ids.length) return await fail(state);
    const team = state.chars.filter(character => ids.includes(character.id));
    team.forEach(character => {
      character.hp = Math.min(
        character.stats.maxHp,
        character.hp + Math.ceil(character.stats.maxHp * 0.5),
      );
    });
    completeNode(state);
    window.DungeonSettlementActions?.queueDungeonCompletion?.(state, state.explore);
    await retryPending(state);
    state.log.unshift("休整完成：全队恢复50%生命。");
  }

  async function bank(state, run) {
    if (run.banked) return false;
    run.banked = true;
    const result = await window.ServerCore.call("bankRun", { run }, state);
    if (result.stale) {
      run.banked = false;
      return false;
    }
    if (!result.ok) {
      run.banked = false;
      return false;
    }
    return true;
  }

  async function retreat(state) {
    const run = state.explore;
    if (!run || state.view === "battle") return;
    if (!await retryPending(state)) {
      state.log.unshift("附加结算尚未完成，请重试后再撤退。");
      return false;
    }
    if (!await bank(state, run)) return false;
    window.BountySystem?.failRun?.(state, run.missionId, [], "", "撤退");
    const key = run.focusId || `${run.missionId}:${run.difficultyId}:retreat`;
    window.SettlementRecovery.enqueue(state, {
      id: `retreat-claim:${key}`, type: "claimBounty", data: {},
    });
    window.SettlementRecovery.enqueue(state, {
      id: `retreat-shop:${key}`, type: "shopRefresh", data: {},
    });
    const recovered = await retryPending(state);
    healParty(state);
    state.log.unshift(`撤退成功，带回${rewardText(run)}，全体角色生命已恢复，未完成任务已失败${recovered
      ? "，商店已刷新。" : "，任务奖励或商店刷新待重试。"}`);
    state.explore = null;
    state.view = "hall";
    return true;
  }

  async function finish(state) {
    const run = state.explore;
    if (!run?.complete || run.rewardPopup) return;
    if (!await bank(state, run)) return;
    window.NewCharacterUnlockEvents?.recordDungeonClear?.(state, run);
    unlockNext(state, run.difficultyId);
    healParty(state);
    const key = run.focusId || `${run.missionId}:${run.difficultyId}`;
    window.DungeonSettlementActions?.queueDungeonCompletion?.(state, run);
    window.SettlementRecovery.enqueue(state, {
      id: `finish-shop:${key}`, type: "shopRefresh", data: {},
    });
    const recovered = await retryPending(state);
    state.log.unshift(`副本通关，带回${rewardText(run)}，全体角色生命已恢复${recovered
      ? "，商店已刷新。" : "，部分附加结算未完成。"}`);
    state.explore = null;
    state.view = "hall";
    if (!window.triggerOrcDungeonUnlockEvent?.(state, run)) {
      window.triggerPostUnderwaterTrainClearEvents?.(state, run);
    }
    window.NewCharacterUnlockEvents?.triggerPending?.(state);
  }

  function unlockNext(state, difficultyId) {
    const next = Object.entries(GameData.difficulties)
      .find(([, difficulty]) => difficulty.unlock === difficultyId)?.[0];
    if (!next || state.unlockedDifficulties.includes(next)) return;
    state.unlockedDifficulties.push(next);
    state.log.unshift(`新难度已解锁：${GameData.difficulties[next].name}。`);
  }

  async function fail(state) {
    const run = state.explore;
    const beforeFirst = !!state.flags?.firstDefeatSeen;
    const beforeSecond = !!state.flags?.secondDefeatSeen;
    const fallbackId = state.battle?._defeatSettlementId
      || window.ReceiptLedger.assign(
        state, "defeat", "_localDefeatLedger", "_localDefeatCounter", "_localDefeatIds",
      );
    const defeatId = state.battle
      ? (state.battle._defeatSettlementId ||= fallbackId)
      : fallbackId;
    const result = await window.ServerCore.call("settleDefeat", { defeatId }, state);
    if (result.stale) return;
    if (!result.ok) {
      if (state.battle) {
        state.battle.failedTriggered = false;
        state.battle.pendingDefeat = false;
        state.battle.locked = false;
      }
      state.log.unshift("结算失败，请重试。");
      return;
    }
    window.BountySystem?.failRun?.(state, run?.missionId, [], run?.focusId, "全军覆没");
    const key = run?.focusId || defeatId || "unknown-run";
    window.SettlementRecovery.enqueue(state, {
      id: `defeat-shop:${key}`, type: "shopRefresh", data: {},
    });
    const recovered = await retryPending(state);
    healParty(state);
    if (state.battle) {
      state.battle.failedTriggered = false;
      state.battle.defeat = false;
      state.battle.locked = false;
    }
    const firstDefeat = !beforeFirst && state.flags?.firstDefeatSeen;
    const secondDefeat = !beforeSecond && state.flags?.secondDefeatSeen;
    const resultText = firstDefeat
      ? "首次全军覆没：回到大厅触发贝丝妲与洛基事件，洛基加入角色栏。"
      : secondDefeat
        ? "第二次全军覆没：回到大厅触发卡洛斯事件，卡洛斯加入角色栏。"
        : "全军覆没，本次探索获得的资源和卡牌全部丢失，出战角色已返回据点并恢复满血。";
    state.log.unshift(`${resultText}${recovered ? " 商店已刷新。" : " 商店刷新待重试。"}`);
    window.BattleFX?.leave?.(state);
    state.battle = null;
    state.explore = null;
    state.view = "hall";
    if (firstDefeat) state.hallModal = "firstDefeat";
    else if (secondDefeat) state.hallModal = "secondDefeat";
  }

  return { rest, retreat, finish, fail, rewardText };
})();
