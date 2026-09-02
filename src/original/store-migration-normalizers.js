window.StoreMigrationNormalizers = (() => {
  const { refreshBountyGold } = window.StoreRepairs;

  function normalizeRelics(state, markForSave) {
    const before = JSON.stringify({
      relicCollection: state.relicCollection,
      relics: state.resources.relics,
      testRelics: state.testRelics,
      equipment: state.equipment,
      testEquipment: state.testEquipment,
    });
    state.relicCollection = window.RelicSystem.normalizeNames(state.relicCollection);
    state.resources.relics = window.RelicSystem.normalizeNames(state.resources.relics);
    state.testRelics = window.RelicSystem.normalizeNames(state.testRelics);
    state.equipment = window.RelicSystem.normalizeMap(state.equipment);
    state.testEquipment = window.RelicSystem.normalizeMap(state.testEquipment);
    const after = JSON.stringify({
      relicCollection: state.relicCollection,
      relics: state.resources.relics,
      testRelics: state.testRelics,
      equipment: state.equipment,
      testEquipment: state.testEquipment,
    });
    if (before !== after) markForSave(state);
  }

  function normalizeShopUnlocks(state, markForSave) {
    const before = JSON.stringify(state.unlockedShopCards || []);
    const initial = GameData.initialShopCardNames || [];
    const valid = new Set([
      ...(GameData.eliteCards || []).map(card => card.name),
      ...initial,
    ]);
    state.unlockedShopCards = [...new Set([
      ...(state.unlockedShopCards || []), ...initial,
    ])].filter(name => valid.has(name));
    if (before !== JSON.stringify(state.unlockedShopCards)) markForSave(state);
  }

  function normalizeParty(state) {
    const party = Array.isArray(state.party) ? state.party : ["lokar", "besta_doll"];
    state.party = [...new Set(party)]
      .filter(id => state.chars.some(character => character.id === id && !character.locked))
      .slice(0, 4);
    const bestaAvailable = state.chars.some(character =>
      character.id === "besta_doll" && !character.locked);
    if (!state.party.includes("besta_doll") && bestaAvailable && state.party.length < 4) {
      state.party.push("besta_doll");
    }
    if (!state.party.length) state.party = ["lokar"];
  }

  function normalizeUiState(state, interruptedModal) {
    if (state.view === "workshop") state.view = "hall";
    if (state.view === "training") state.view = "livingRoom";
    state.hallModal = interruptedModal || null;
    state.deckFilter ||= "all";
    state.shopCards = Array.isArray(state.shopCards) ? state.shopCards : [];
    state.bounties = Array.isArray(state.bounties) ? state.bounties : [];
    state.pendingBountyRewards ||= [];
  }

  function normalizeLedgers(state, markForSave) {
    const bounty = window.BountyLedger.normalize(
      state._localBountyLedger, state._localClaimedBountyIds,
    );
    const bountyChanged = JSON.stringify(bounty) !== JSON.stringify(state._localBountyLedger || null)
      || !!state._localClaimedBountyIds;
    state._localBountyLedger = bounty;
    delete state._localClaimedBountyIds;
    state._localBountyClaimCounter = window.BountyLedger.safeCounter(
      state._localBountyClaimCounter, bounty.through,
    );
    const defeat = window.ReceiptLedger.normalize(
      state._localDefeatLedger, state._localDefeatIds, "defeat",
    );
    const inventory = window.ReceiptLedger.normalize(
      state._localInventoryLedger, state._localInventoryOperationIds, "inventory",
    );
    const receiptsChanged = JSON.stringify(defeat) !== JSON.stringify(state._localDefeatLedger || null)
      || JSON.stringify(inventory) !== JSON.stringify(state._localInventoryLedger || null)
      || !!state._localDefeatIds || !!state._localInventoryOperationIds;
    state._localDefeatLedger = defeat;
    delete state._localDefeatIds;
    state._localInventoryLedger = inventory;
    delete state._localInventoryOperationIds;
    state._localDefeatCounter = window.ReceiptLedger.safeCounter(
      state._localDefeatCounter, defeat.through,
    );
    state._localInventoryOperationCounter = window.ReceiptLedger.safeCounter(
      state._localInventoryOperationCounter, inventory.through,
    );
    if (bountyChanged || receiptsChanged) markForSave(state);
  }

  function normalizeCollectionState(state, markForSave) {
    const before = JSON.stringify({
      testAllies: state.testAllies, testEnemies: state.testEnemies,
      testCards: state.testCards, testRelics: state.testRelics,
      testEquipment: state.testEquipment, testSkins: state.testSkins,
      ownedSkins: state.ownedSkins, equippedSkins: state.equippedSkins,
    });
    state.ownedSkins ||= {};
    state.equippedSkins ||= {};
    state.testSkins ||= {};
    window.SkinSystem?.ensure?.(state);
    refreshBountyGold(state);
    const validCharacters = new Set(state.chars.map(character => character.id));
    state.testAllies = (state.testAllies || ["lokar", "besta_doll"])
      .filter((id, index, list) => validCharacters.has(id) && list.indexOf(id) === index)
      .slice(0, 4);
    if (!state.testAllies.includes("besta_doll")
      && state.chars.some(character => character.id === "besta_doll")) {
      state.testAllies.push("besta_doll");
    }
    if (!state.testAllies.length) state.testAllies = state.chars.slice(0, 1)
      .map(character => character.id);
    state.testEnemies = (state.testEnemies || [0])
      .filter((index, position, list) => Number.isInteger(index)
        && !!GameData.testEnemies[index] && list.indexOf(index) === position).slice(0, 4);
    state.sortieStarting = false;
    state.testBattleStarting = false;
    if (!state.testEnemies.length) state.testEnemies = [0];
    if (!GameData.difficulties[state.testDifficulty]) state.testDifficulty = "normal";
    const validCards = new Set((GameData.cardCodex || []).map(card => card.name));
    const baseCards = new Set(GameData.baseCardNames || []);
    state.testCards = (state.testCards || [])
      .filter(name => validCards.has(name) && !baseCards.has(name));
    state.testRelics = window.RelicSystem.normalizeNames(state.testRelics);
    state.testEquipment = Object.fromEntries(Object.entries(state.testEquipment || {})
      .filter(([id]) => validCharacters.has(id))
      .map(([id, relics]) => [id, window.RelicSystem.normalizeSlots(relics)]));
    state.testSkins = Object.fromEntries(Object.entries(state.testSkins)
      .filter(([id, skinId]) => validCharacters.has(id)
        && window.SkinSystem?.byId?.(skinId)?.charId === id));
    if (before !== JSON.stringify({
      testAllies: state.testAllies, testEnemies: state.testEnemies,
      testCards: state.testCards, testRelics: state.testRelics,
      testEquipment: state.testEquipment, testSkins: state.testSkins,
      ownedSkins: state.ownedSkins, equippedSkins: state.equippedSkins,
    })) markForSave(state);
  }

  return {
    normalizeCollectionState, normalizeLedgers, normalizeParty, normalizeRelics,
    normalizeShopUnlocks, normalizeUiState,
  };
})();
