window.GameStoreBountyRepairs = (() => {
  const { rand } = window.GameStoreStateFactory;

  function missionIdFromTitle(title) {
    const text = String(title || "");
    if (!text) return null;
    return Object.entries(GameData.enemies || {})
      .find(([, enemies]) => enemies.some(enemy => text.includes(enemy.name)))?.[0]
      || null;
  }

  function bountyRanges(reward) {
    return [
      reward?.bountyGoldRange,
      ...(reward?.bountyLegacyGoldRanges || []),
    ].filter(Boolean);
  }

  function maxCommittedGold() {
    return Math.max(0, ...(GameData.missions || [])
      .flatMap(mission => bountyRanges(mission.reward).map(([, max]) => max)));
  }

  function refreshItem(item, fallbackMissionId, committed = false, state = window.state) {
    const existingGold = Number(item?.bonusGold);
    const missionId = item?.missionId
      || missionIdFromTitle(item?.taskTitle)
      || fallbackMissionId;
    const reward = GameData.missions?.find(mission => mission.id === missionId)?.reward;
    const range = reward?.bountyGoldRange;
    const validCommitted = committed && Number.isFinite(existingGold) && existingGold > 0
      && (reward
        ? bountyRanges(reward)
          .some(([min, max]) => existingGold >= min && existingGold <= max)
        : existingGold <= maxCommittedGold());
    if (validCommitted) {
      const normalized = Math.floor(existingGold);
      const changed = item.bonusGold !== normalized;
      item.bonusGold = normalized;
      return changed;
    }
    if (!range) {
      if (committed && item?.bonusGold) {
        item.bonusGold = 0;
        return true;
      }
      return false;
    }
    const [min, max] = range;
    if (item.bonusGold >= min && item.bonusGold <= max) return false;
    item.bonusGold = rand(min, max, state);
    return true;
  }

  function refreshBountyGold(state) {
    let changed = false;
    (state.bounties || []).forEach(item => {
      changed = refreshItem(
        item, state.explore?.missionId, !!item?.accepted, state
      ) || changed;
    });
    (state.pendingBountyRewards || []).forEach(item => {
      changed = refreshItem(item, state.explore?.missionId, true, state) || changed;
    });
    (state.bountyPopup?.rewards || []).forEach(item => {
      changed = refreshItem(item, state.explore?.missionId, true, state) || changed;
    });
    const hadTargetGold = !!state.explore?.targetGold;
    if (hadTargetGold) delete state.explore.targetGold;
    if (changed || hadTargetGold) {
      Object.defineProperty(state, "_needsSaveAfterMigration", {
        value: true,
        configurable: true,
      });
    }
  }

  return { refreshBountyGold };
})();
