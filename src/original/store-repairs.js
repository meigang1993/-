window.StoreRepairs = (() => {
  const record = value => !!value && typeof value === "object" && !Array.isArray(value);
  const schema = window.GameStoreSaveSchema;
  function cardKey(card) { return `${card?.name || ""}|${card?.suit || ""}`; }
  function renameRelic(name) { return name; }
  const renameRelics = list => (list || []).map(renameRelic);
  function renameRelicMap(map) {
    return Object.fromEntries(Object.entries(map || {}).map(([id, list]) => [id, renameRelics(list)]));
  }
  const repairCard = card => schema.rebuildCard(card);
  function repairCards(cards, fallback = GameData.baseDeck.map(c => ({ ...c }))) {
    return Array.isArray(cards) && cards.length ? cards.map(repairCard).filter(Boolean) : fallback;
  }
  function repairRewardCard(item) {
    const reward = item?.reward || item;
    if (reward?.type === "card") {
      const card = repairCard(reward.card);
      if (!card) return null;
      reward.card = card;
    }
    return item;
  }
  function repairRewardCards(reward) {
    if (record(reward) && reward.cards != null) reward.cards = repairCards(reward.cards, []);
    return reward;
  }
  function repairCardLists(state) {
    const before = JSON.stringify({
      shopCards: state.shopCards,
      bounties: state.bounties,
      pendingBountyRewards: state.pendingBountyRewards,
      explore: state.explore,
      localPendingRun: state._localPendingRun,
      pendingRun: state.pendingRun,
      localRunState: state._localRunState,
    });
    state.deck = repairCards(state.deck);
    state.shopCards = (state.shopCards || []).map(slot => {
      const card = repairCard(slot?.card);
      return card ? { card, sold: slot.sold === true } : null;
    }).filter(Boolean);
    (state.bounties || []).forEach(task => {
      if (task?.reward?.type !== "card") return;
      const card = repairCard(task.reward.card);
      if (card) task.reward.card = card;
      else delete task.reward;
    });
    if (state.explore?.earned) state.explore.earned.cards = repairCards(state.explore.earned.cards, []);
    if (state.explore?.lastReward) state.explore.lastReward.cards = repairCards(state.explore.lastReward.cards, []);
    if (state.explore?.rewardPopup) state.explore.rewardPopup.cards = repairCards(state.explore.rewardPopup.cards, []);
    state.pendingBountyRewards = (state.pendingBountyRewards || []).map(repairRewardCard).filter(Boolean);
    if (state.bountyPopup?.rewards) state.bountyPopup.rewards = state.bountyPopup.rewards.map(repairRewardCard).filter(Boolean);
    repairRewardCards(state._localPendingRun);
    repairRewardCards(state.pendingRun);
    Object.values(state._localRunState?.rewards || {}).forEach(repairRewardCards);
    const after = JSON.stringify({
      shopCards: state.shopCards,
      bounties: state.bounties,
      pendingBountyRewards: state.pendingBountyRewards,
      explore: state.explore,
      localPendingRun: state._localPendingRun,
      pendingRun: state.pendingRun,
      localRunState: state._localRunState,
    });
    return before !== after;
  }
  function repairRelicLists(state) {
    const before = JSON.stringify({
      bounties: state.bounties,
      pendingBountyRewards: state.pendingBountyRewards,
      explore: state.explore,
      localPendingRun: state._localPendingRun,
      pendingRun: state.pendingRun,
      localRunState: state._localRunState,
    });
    const normalizeList = reward => {
      if (record(reward) && reward.relics != null) {
        reward.relics = window.RelicSystem.normalizeNames(reward.relics);
      }
    };
    (state.bounties || []).forEach(task => {
      if (task?.reward?.type !== "relic") return;
      const relic = window.RelicSystem.data(task.reward.relic)?.name;
      if (relic) task.reward.relic = relic;
      else delete task.reward;
    });
    state.pendingBountyRewards = (state.pendingBountyRewards || []).map(item => {
      const reward = item?.reward || item;
      if (reward?.type !== "relic") return item;
      const relic = window.RelicSystem.data(reward.relic)?.name;
      if (!relic) return null;
      reward.relic = relic;
      return item;
    }).filter(Boolean);
    [state.explore?.earned, state.explore?.lastReward, state.explore?.rewardPopup,
      state._localPendingRun, state.pendingRun].forEach(normalizeList);
    Object.values(state._localRunState?.rewards || {}).forEach(normalizeList);
    const after = JSON.stringify({
      bounties: state.bounties,
      pendingBountyRewards: state.pendingBountyRewards,
      explore: state.explore,
      localPendingRun: state._localPendingRun,
      pendingRun: state.pendingRun,
      localRunState: state._localRunState,
    });
    return before !== after;
  }
  return {
    cardKey,
    cardIdentity: schema.cardIdentity,
    validStoredCard: schema.validStoredCard,
    validPersistedState: schema.validPersistedState,
    renameRelics, renameRelicMap, repairCard, repairCardLists, repairRelicLists,
    refreshBountyGold: window.GameStoreBountyRepairs.refreshBountyGold,
  };
})();
