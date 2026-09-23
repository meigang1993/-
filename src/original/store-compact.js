window.GameStoreCompact = (() => {
  const transientHallViews = new Set(["livingRoom", "training", "nursery", "furnace"]);
  const transientUiKeys = [
    "hallModal", "infoUnit", "infoTab", "artZoom",
    "deckFilter", "cardCodex", "selectedCodexCard", "skinFilterChar", "skinFlash",
    "relicEquipChar", "pendingRelicSlot", "selectedRelic", "relicCodex",
    "selectedCodexRelic", "succubusCodex", "codexFlashId", "confirmDialog",
    "inventoryCleanupTab",
    "bountyPopup", "sortieStarting", "testBattleStarting",
    "loadingBattleName", "loadingBattleProgress",
  ];
  function safeNumber(value) {
    const n = Number(value || 0);
    return Number.isFinite(n) ? n : 0;
  }
  function stripTransientUiState(data) {
    transientUiKeys.forEach(key => delete data[key]);
    if (transientHallViews.has(data.view) || data.view === "dungeonInventory") {
      data.view = data.explore ? "dungeon" : "hall";
    }
    if (data.battle) delete data.battle.speech;
    return data;
  }
  function stripTemporaryCards(data) {
    const cleanList = list => Array.isArray(list) ? list.filter(c => !c?.temporary).map(c => ({ ...c, _pendingDraw: c._pendingDraw && !c.temporary ? c._pendingDraw : undefined })).map(c => { if (c._pendingDraw === undefined) delete c._pendingDraw; return c; }) : list;
    const units = data.battle ? [...(data.battle.allies || []), ...(data.battle.enemies || [])] : [];
    const piles = [...new Set(units.map(u => u.pileStats).filter(Boolean))];
    piles.forEach(p => { p.deck = cleanList(p.deck); p.discard = cleanList(p.discard); p.consumed = cleanList(p.consumed); });
    units.forEach(u => { u.hand = cleanList(u.hand); u.deck = cleanList(u.deck); u.discard = cleanList(u.discard); u.consumed = cleanList(u.consumed); });
    return data;
  }
  function compactCard(card) {
    return window.GameStoreSaveSchema.cardIdentity(card);
  }
  function compactCards(list) { return Array.isArray(list) ? list.map(compactCard) : list; }
  function compactCharacter(c) {
    if (!c || typeof c !== "object") return c;
    return { id:c.id, locked:!!c.locked, level:safeNumber(c.level), exp:safeNumber(c.exp), hp:safeNumber(c.hp) };
  }
  function compactSaveData(data) {
    stripTransientUiState(data);
    data.chars = (data.chars || []).map(compactCharacter);
    data.deck = compactCards(data.deck);
    data.shopCards = (data.shopCards || []).map(slot => slot?.card
      ? { card:compactCard(slot.card), sold:slot.sold === true } : slot);
    const compactReward = item => {
      const r = item?.reward || item;
      if (r?.card) r.card = compactCard(r.card);
      if (r?.cards) r.cards = compactCards(r.cards);
      return item;
    };
    data.bounties = (data.bounties || []).map(compactReward);
    data.pendingBountyRewards = (data.pendingBountyRewards || []).map(compactReward);
    if (data.explore?.earned) data.explore.earned.cards = compactCards(data.explore.earned.cards);
    if (data.explore?.lastReward) data.explore.lastReward.cards = compactCards(data.explore.lastReward.cards);
    if (data.explore?.rewardPopup) data.explore.rewardPopup.cards = compactCards(data.explore.rewardPopup.cards);
    compactReward(data._localPendingRun);
    compactReward(data.pendingRun);
    Object.values(data._localRunState?.rewards || {}).forEach(compactReward);
    const units = data.battle ? [...(data.battle.allies || []), ...(data.battle.enemies || [])] : [];
    const piles = [...new Set(units.map(u => u.pileStats).filter(Boolean))];
    piles.forEach(p => { p.deck = compactCards(p.deck); p.discard = compactCards(p.discard); p.consumed = compactCards(p.consumed); });
    units.forEach(u => { u.hand = compactCards(u.hand); u.deck = compactCards(u.deck); u.discard = compactCards(u.discard); u.consumed = compactCards(u.consumed); });
    if (data.battle) { data.battle.played = compactCards(data.battle.played); data.battle.shownPlayed = []; }
    return data;
  }
  return { stripTemporaryCards, stripTransientUiState, compactSaveData };
})();
