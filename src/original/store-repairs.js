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
  // 技能合并后的旧档迁移：战斗单位里的 skills / 技能卡是存档快照，
  // 不会随 state.chars 的模板重建（migrateCharacter 只处理名册）。
  // 不清理会留下已删除技能的幽灵条目、旧被动型【狂战意志】（没有主动按钮）
  // 与「能打出但无效果」的死卡；checkpoint 的 played 与共享牌堆同样是完整牌对象。
  const MERGED_REMOVED = new Set(["改造副作用", "猩红暴走"]);
  function normalizeMergedSkills(state) {
    const b = state?.battle;
    if (!b) return false;
    const templates = window.GameData?.characters || [];
    let changed = false;
    const units = [...(Array.isArray(b.allies) ? b.allies : []),
      ...(Array.isArray(b.enemies) ? b.enemies : [])];
    const cardLists = [b.played];
    units.forEach(unit => {
      if (!unit || typeof unit !== "object") return;
      const tpl = templates.find(c => c?.id === (unit.ref || unit.id));
      if (Array.isArray(tpl?.skills)) {
        const current = Array.isArray(unit.skills) ? unit.skills : [];
        const stale = !Array.isArray(unit.skills)
          || current.some(s => MERGED_REMOVED.has(s?.name)
            || (s?.name === "狂战意志" && s.type !== "active")
            || (s?.name === "淫气改造" && !/结束阶段/.test(s.text || "")))
          || !tpl.skills.every(t => current.some(s => s?.name === t?.name));
        if (stale) {
          const merged = tpl.skills.map(s => ({
            ...s, ...(s.card ? { card: { ...s.card } } : {}),
          }));
          const dynamic = current.filter(s => !merged.some(m => m.name === s?.name)
            && !MERGED_REMOVED.has(s?.name));
          unit.skills = merged.concat(dynamic);
          changed = true;
        }
      }
      if (unit.skipPlayReason === "改造副作用") {
        unit.skipPlayReason = "淫气改造";
        changed = true;
      }
      ["hand", "deck", "discard", "consumed"].forEach(key => cardLists.push(unit[key]));
      const pile = unit.pileStats;
      if (pile) ["deck", "discard", "consumed"].forEach(key => cardLists.push(pile[key]));
    });
    cardLists.forEach(list => {
      if (!Array.isArray(list)) return;
      list.forEach(card => {
        if (!card || typeof card !== "object") return;
        let hit = false;
        if (card.crimsonRampage || card.name === "猩红暴走") {
          delete card.crimsonRampage;
          card.berserkWill = true;
          card.name = "狂战意志";
          if (card.text) card.text = card.text.replace(/猩红暴走/g, "狂战意志");
          hit = true;
        }
        ["generatedBySkill", "sourceSkill", "skillName"].forEach(key => {
          if (card[key] !== "猩红暴走" && card[key] !== "改造副作用") return;
          card[key] = card[key] === "猩红暴走" ? "狂战意志" : "淫气改造";
          hit = true;
        });
        if (hit) changed = true;
      });
    });
    return changed;
  }
  return {
    cardKey,
    cardIdentity: schema.cardIdentity,
    validStoredCard: schema.validStoredCard,
    validPersistedState: schema.validPersistedState,
    renameRelics, renameRelicMap, repairCard, repairCardLists, repairRelicLists,
    normalizeMergedSkills,
    refreshBountyGold: window.GameStoreBountyRepairs.refreshBountyGold,
  };
})();
