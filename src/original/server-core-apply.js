window.ServerCoreApply = (() => {
  function apply(state, core, context = {}) {
    const scope = window.LocalCoreUtils.operationScope(context.method);
    if (scope.random && core.random) state.random = window.GameRandom.snapshot(core);
    if (scope.resources) applyResources(state, core, scope);
    if (scope.deck) scope.full ? state.deck = repairCards(core.deck || []) : applyDeckPatch(state, core);
    if (scope.shopCards) state.shopCards = repairShop(core.shopCards || []);
    if (scope.shopAuthority) state.shopAuthorityVersion = Math.max(0, Number(core.shopAuthorityVersion) || 0);
    if (scope.defeatedElites) state.defeatedElites = [...(core.defeatedElites || [])];
    if (scope.unlockedShopCards) state.unlockedShopCards = [...(core.unlockedShopCards || [])];
    if (scope.unlockedDifficulties) state.unlockedDifficulties = [...(core.unlockedDifficulties || [])];
    if (scope.flags) state.flags = { ...(core.flags || {}) };
    if (scope.unlockEvents) state.unlockEvents = window.UnlockEventProgress.snapshot(core);
    if (scope.skins) {
      state.ownedSkins = { ...(core.ownedSkins || state.ownedSkins || {}) };
      state.equippedSkins = { ...(core.equippedSkins || state.equippedSkins || {}) };
    }
    if (scope.full) state.currentSaveSlot = core.currentSaveSlot ?? state.currentSaveSlot ?? null;
    if (scope.localRunState) state._localRunState = core.localRunState || null;
    if (scope.bountyLedger) applyBountyLedger(state, core);
    if (scope.defeatLedger) applyDefeatLedger(state, core);
    if (scope.inventoryLedger) applyInventoryLedger(state, core);
    if (scope.chars) applyChars(state, core.chars || [], context);
    if (scope.pendingRun) applyPendingRun(state, core, context);
  }
  function applyResources(state, core, scope) {
    const resources = state.resources || {};
    state.resources = {
      ...resources,
      gold: core.resources?.gold ?? resources.gold ?? 0,
      essence: core.resources?.essence ?? resources.essence ?? 0,
      relics: scope.full ? [...(core.resources?.relics || [])] : (resources.relics || []),
    };
    const removal = core.relicRemoval?.index;
    if (Number.isInteger(removal) && removal >= 0) state.resources.relics.splice(removal, 1);
    if (core.relicAdditions?.length) state.resources.relics.push(...core.relicAdditions);
  }
  function applyDeckPatch(state, core) {
    state.deck = Array.isArray(state.deck) ? state.deck : [];
    const removal = core.deckRemoval?.index;
    if (Number.isInteger(removal) && removal >= 0) state.deck.splice(removal, 1);
    const additions = repairCards(core.deckAdditions || []);
    if (additions.length) state.deck.push(...additions);
  }
  function applyBountyLedger(state, core) {
    state._localBountyLedger = window.BountyLedger.normalize(core.bountyLedger);
    state._localBountyClaimCounter = window.BountyLedger.safeCounter(state._localBountyClaimCounter, core.bountyClaimCounter, state._localBountyLedger.through);
    delete state._localClaimedBountyIds;
  }
  function applyDefeatLedger(state, core) {
    state._localDefeatLedger = window.ReceiptLedger.normalize(core.defeatLedger, [], "defeat");
    state._localDefeatCounter = window.ReceiptLedger.safeCounter(state._localDefeatCounter, core.defeatCounter, state._localDefeatLedger.through);
    delete state._localDefeatIds;
  }
  function applyInventoryLedger(state, core) {
    state._localInventoryLedger = window.ReceiptLedger.normalize(core.inventoryLedger, [], "inventory");
    state._localInventoryOperationCounter = window.ReceiptLedger.safeCounter(state._localInventoryOperationCounter, core.inventoryOperationCounter, state._localInventoryLedger.through);
    delete state._localInventoryOperationIds;
    state._localInventoryRevision = Number(core.inventoryRevision) || 0;
  }
  function applyPendingRun(state, core, context) {
    if (["bankRun", "settleDefeat"].includes(context.method)) {
      delete state._serverRun;
      state._localPendingRun = { gold:0, essence:0, cards:[], relics:[] };
      return;
    }
    state._localPendingRun = core.pendingRun || state._localPendingRun
      || { gold:0, essence:0, cards:[], relics:[] };
  }
  function applyChars(state, coreChars, context = {}) {
    const scopedId = context.method === "unlockChar"
      ? String(context.args?.id || "") : "";
    const map = new Map(coreChars.map(c => [c.id, c]));
    (state.chars || []).forEach(c => {
      if (scopedId && c.id !== scopedId) return;
      const next = map.get(c.id);
      if (!next) return;
      const oldMax = c.stats?.maxHp || c.hp || 1;
      c.locked = !!next.locked;
      c.level = Number(next.level) || 0;
      c.exp = Number(next.exp) || 0;
      recomputeStats(c);
      if (context.method === "unlockChar" && !c.locked) c.hp = c.stats.maxHp;
      else if (c.hp >= oldMax || c.hp == null) c.hp = c.stats.maxHp;
      else c.hp = Math.max(0, Math.min(c.hp, c.stats.maxHp));
    });
  }
  function recomputeStats(c) {
    const tpl = (window.GameData?.characters || []).find(x => x.id === c.id) || {};
    const base = window.GameStore?.baseStats?.() || { attack:0, magic:0, speed:0, maxHp:10, bloodlust:1, handLimit:0, drawPerTurn:0, initialDraw:2 };
    c.level = window.CharacterProgression.cleanLevel(c.level);
    c.exp = window.CharacterProgression.cleanExp(c.exp, c.level);
    c.stats = { ...base, ...window.CharacterProgression.statsAt(tpl, c.level) };
    c.stats.bloodlust = Math.min(99, Math.max(1, c.stats.bloodlust || 1));
  }
  function repairCards(cards) {
    return (cards || []).map(card =>
      window.GameStoreSaveSchema.rebuildCard(card)).filter(Boolean);
  }
  function repairShop(slots) {
    return (slots || []).map(slot => {
      const card = window.GameStoreSaveSchema.rebuildCard(slot?.card);
      return card ? { card, sold: slot.sold === true } : null;
    }).filter(Boolean);
  }
  return { apply };
})();
