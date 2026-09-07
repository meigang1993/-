window.BountyRewards = (() => {
  const sample = (list, state) => window.GameRandom.sample(list, state);
  function rollReward(task, state = window.state) {
    if (task?.type === "bond") return essenceReward(state);
    if (task?.type === "hunt") return huntReward(task, state);
    const pool = [cardReward, relicReward].map(fn => fn(state)).filter(Boolean);
    return sample(pool, state) || essenceReward(state);
  }
  function huntReward(task, state) {
    const pool = [targetCardReward(task, state), targetRelicReward(task, state)].filter(Boolean);
    return sample(pool, state) || null;
  }
  function cardReward(state) {
    const card = sample(GameData.eliteCards || [], state);
    return card ? { type: "card", card: { ...card } } : null;
  }
  function targetCardReward(task, state = window.state) {
    if (!task?.targetId) return null;
    const names = GameData.eliteUnlocks?.[task.targetId] || [];
    const card = sample((GameData.eliteCards || []).filter(c => names.includes(c.name)), state);
    return card ? { type: "card", card: { ...card } } : null;
  }
  function relicReward(state) {
    const relic = RelicSystem.randomElite(null, new Set(), state);
    return relic ? { type: "relic", relic } : null;
  }
  function targetRelicReward(task, state = window.state) {
    if (!task?.targetId) return null;
    const relic = RelicSystem.randomElite(task?.targetId, new Set(), state);
    return relic ? { type: "relic", relic } : null;
  }
  function essenceReward(state) { return { type: "essence", essence: window.GameRandom.int(1, 7, state) }; }
  function hasHuntDrop(targetId) {
    const names = new Set(GameData.eliteUnlocks?.[targetId] || []);
    const hasCard = (GameData.eliteCards || []).some(card => names.has(card.name));
    const hasRelic = (RelicSystem.enemyRelics?.(targetId) || []).length > 0;
    return hasCard || hasRelic;
  }
  function matchesTask(task, reward) {
    if (!task || !reward) return false;
    if (task.type === "bond") return reward.type === "essence";
    if (task.type !== "hunt") return !!reward.type;
    if (!task.targetId) return false;
    if (reward.type === "card") return (GameData.eliteUnlocks?.[task.targetId] || []).includes(reward.card?.name);
    if (reward.type === "relic") return RelicSystem.data?.(reward.relic)?.enemy === task.targetId;
    return false;
  }
  async function claimPending(state) {
    const list = window.BountyLedger.assign(state, (state.pendingBountyRewards || []).filter(Boolean)
      .map((item, index) => normalizePending(item, index, state)));
    state.pendingBountyRewards = list;
    if (!list.length) return true;
    const ok = await window.ServerCore.call("claimBounty", { items: list }, state);
    if (ok.stale) return false;
    if (!ok.ok) return false;
    const granted = ok.result?.core?.lastBountyRewards || (ok.offline ? list : []);
    if (!granted.length) {
      state.log?.unshift?.("任务奖励暂未结算，已保留待领取状态。");
      return false;
    }
    granted.forEach(item => {
      const r = item.reward;
      if (r.type === "relic" && r.relic) rememberRelic(state, r.relic);
    });
    const grantedIds = new Set(granted.map(item => item.claimId).filter(Boolean));
    state.pendingBountyRewards = list.filter(item => !grantedIds.has(item.claimId));
    return true;
  }
  function rememberRelic(state, relic) {
    relic = RelicSystem.data(relic)?.name;
    if (!relic) return;
    const max = window.GameStoreSaveLimits?.limits?.lists?.relicCollection || 4096;
    const compact = [...new Set((state.relicCollection || [])
      .filter(item => typeof item === "string" && item))].slice(0, max);
    state.relicCollection = compact;
    if (!compact.includes(relic) && compact.length < max) compact.push(relic);
  }
  function normalizePending(item, index, state) {
    if (item?.reward) {
      const task = taskFromPending(item), reward = task && !matchesTask(task, item.reward) ? rollReward(task, state) : item.reward;
      const claimId = item.claimId || (!item.receiptKey ? legacyClaimId(item, index) : undefined);
      return { ...item, reward, ...(claimId ? { claimId } : {}) };
    }
    return { claimId: legacyClaimId(item, index), reward: item, bonusGold: 0, taskTitle: `任务${index + 1}` };
  }
  function legacyClaimId(item, index) {
    return `legacy:${index}:${JSON.stringify(item)}`;
  }
  function taskFromPending(item) {
    if (item.taskType) return { type: item.taskType, targetId: item.targetId };
    const title = String(item.taskTitle || "");
    if (title.startsWith("羁绊")) return { type: "bond" };
    if (!title.startsWith("讨伐")) return null;
    const enemies = Object.values(GameData.enemies || {}).flat();
    const target = enemies.find(e => title.includes(e.name));
    if (!target) return null;
    return { type: "hunt", targetId: target?.id };
  }
  function rewardText(r) { return window.BountyRender.rewardText(r); }
  return { rollReward, hasHuntDrop, matchesTask, claimPending, rewardText };
})();
