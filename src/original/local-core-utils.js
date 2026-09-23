window.LocalCoreUtils = (() => {
  const clone = v => JSON.parse(JSON.stringify(v));
  const outcomes = Object.freeze({
    changed: Object.freeze({ changed: true, accepted: true, apply: true }),
    reconciled: Object.freeze({ changed: false, accepted: true, apply: true }),
    accepted: Object.freeze({ changed: false, accepted: true, apply: false }),
    rejected: Object.freeze({ changed: false, accepted: false, apply: false }),
  });
  const fullScope = Object.freeze({
    full: true, random: true, resources: true, chars: true, deck: true,
    shopCards: true, defeatedElites: true, unlockedShopCards: true,
    unlockedDifficulties: true, flags: true, unlockEvents: true, pendingRun: true,
    localRunState: true, bountyLedger: true, defeatLedger: true,
    inventoryLedger: true, skins: true, shopAuthority: true,
  });
  const scopes = Object.freeze({
    unlockChar: { resources: true, chars: true, flags: true },
    shopRefresh: { random: true, shopCards: true, defeatedElites: true, unlockedShopCards: true, shopAuthority: true },
    shopBuy: { resources: true, deck: true, shopCards: true, shopAuthority: true },
    shopDelete: { resources: true, deck: true, inventoryLedger: true },
    smeltRelic: { resources: true, inventoryLedger: true },
    startDungeon: { unlockedDifficulties: true, flags: true, pendingRun: true, localRunState: true },
    settleDungeon: { random: true, resources: true, chars: true, pendingRun: true, localRunState: true, defeatedElites: true, unlockedShopCards: true },
    bankRun: { resources: true, deck: true, pendingRun: true, localRunState: true },
    claimBounty: { resources: true, deck: true, bountyLedger: true },
    settleDefeat: { chars: true, flags: true, pendingRun: true, localRunState: true, defeatLedger: true },
    unlockEvent: { chars: true, flags: true, defeatedElites: true, unlockEvents: true },
    buySkin: { resources: true, chars: true, skins: true },
    equipSkin: { resources: true, chars: true, skins: true },
  });
  Object.values(scopes).forEach(scope => Object.freeze(scope));
  const operationScope = method => scopes[method] || fullScope;
  const n = (v, d = 0) => Number.isFinite(Math.floor(Number(v))) ? Math.floor(Number(v)) : d;
  function clampResource(value) {
    if (window.GameStoreSaveLimits?.clampResource) return window.GameStoreSaveLimits.clampResource(value);
    return Math.min(1_000_000_000, Math.max(0, n(value)));
  }
  function addResource(current, amount) {
    if (window.GameStoreSaveLimits?.addResource) return window.GameStoreSaveLimits.addResource(current, amount);
    return Math.min(1_000_000_000, clampResource(current) + clampResource(amount));
  }
  function assertInventoryCapacity(state, additions) {
    if (window.GameStoreSaveLimits?.assertInventoryCapacity) {
      return window.GameStoreSaveLimits.assertInventoryCapacity(state, additions);
    }
    const max = 4096, cards = Array.isArray(state?.deck) ? state.deck.length : 0;
    const relics = Array.isArray(state?.resources?.relics) ? state.resources.relics.length : 0;
    if (cards + (Number(additions?.cards) || additions?.cards?.length || 0) > max
      || relics + (Number(additions?.relics) || additions?.relics?.length || 0) > max) {
      const error = new Error("库存空间不足，本次入库未执行。请先清理库存后重试。");
      error.code = "INVENTORY_CAPACITY_EXCEEDED";
      throw error;
    }
    return true;
  }
  const uniq = list => [...new Set((Array.isArray(list) ? list : []).filter(Boolean))];
  const sample = (arr, owner = window.state) => window.GameRandom.sample(arr, owner);
  const suits = ["♠", "♥", "♣", "♦"];
  function cleanCharacter(c) {
    const tpl = GameData.characters?.find(item => item.id === c?.id);
    const next = { ...c };
    if (tpl) window.GameStoreStateFactory?.applyProgression?.(next, tpl);
    return next;
  }
  const initialSkins = state => Object.fromEntries((window.SkinSystem?.skins || []).filter(s => s.initial && !state.chars?.find(c => c.id === s.charId)?.locked).map(s => [s.id, true]));
  function settlementLedger(state) {
    const raw = clone(state._localRunState || null);
    if (!raw) return { rewards: {} };
    if (raw.version === 1) return { version: 1, key: raw.key, rewards: raw.rewards || {} };
    if (!raw.key) return { rewards: raw.rewards && typeof raw.rewards === "object" ? raw.rewards : {} };
    const rewards = {};
    Object.entries(raw.rewards || {}).forEach(([nodeId, reward]) => { rewards[`${raw.key}:${nodeId}`] = reward; });
    return { rewards };
  }
  function cleanShopUnlocks(state) {
    const initial = GameData.initialShopCardNames || [];
    const valid = new Set([
      ...(GameData.eliteCards || []).map(card => card.name),
      ...initial,
    ]);
    return uniq([...(state.unlockedShopCards || []), ...initial])
      .filter(name => valid.has(name));
  }
  function sanitize(state, method) {
    const scope = operationScope(method);
    const resources = state.resources || {};
    const pending = state._localPendingRun || state.pendingRun || { gold:0, essence:0, cards:[], relics:[] };
    const defeatLedger = scope.defeatLedger
      ? window.ReceiptLedger.normalize(state._localDefeatLedger, state._localDefeatIds, "defeat")
      : state._localDefeatLedger;
    const inventoryLedger = scope.inventoryLedger
      ? window.ReceiptLedger.normalize(state._localInventoryLedger, state._localInventoryOperationIds, "inventory")
      : state._localInventoryLedger;
    return {
      random: scope.random ? window.GameRandom.snapshot(state) : state.random,
      resources: scope.resources
        ? { gold:clampResource(resources.gold), essence:clampResource(resources.essence), relics:scope.full ? [...(resources.relics || [])] : (resources.relics || []) }
        : resources,
      chars: scope.chars ? clone(state.chars || []).map(cleanCharacter) : (state.chars || []),
      deck: scope.full ? clone(state.deck || []) : (state.deck || []),
      shopCards: scope.shopCards ? clone(state.shopCards || []) : (state.shopCards || []),
      shopAuthorityVersion: scope.shopAuthority ? Math.max(0, n(state.shopAuthorityVersion)) : state.shopAuthorityVersion,
      defeatedElites: scope.defeatedElites ? uniq(state.defeatedElites) : (state.defeatedElites || []),
      unlockedShopCards: scope.unlockedShopCards
        ? cleanShopUnlocks(state) : (state.unlockedShopCards || []),
      unlockedDifficulties: scope.unlockedDifficulties ? uniq(state.unlockedDifficulties || ["normal"]) : (state.unlockedDifficulties || []),
      flags: scope.flags ? { ...(state.flags || {}) } : (state.flags || {}),
      unlockEvents: scope.unlockEvents
        ? window.UnlockEventProgress.snapshot(state) : state.unlockEvents,
      pendingRun: scope.pendingRun ? clone(pending) : pending,
      localRunState: scope.localRunState ? settlementLedger(state) : state._localRunState,
      localRunStatePresent: state._localRunState != null,
      bountyLedger: scope.bountyLedger ? window.BountyLedger.normalize(state._localBountyLedger, state._localClaimedBountyIds) : state._localBountyLedger,
      bountyClaimCounter: Math.max(0, n(state._localBountyClaimCounter)),
      defeatLedger, defeatCounter: scope.defeatLedger ? window.ReceiptLedger.safeCounter(state._localDefeatCounter, defeatLedger.through) : state._localDefeatCounter,
      inventoryLedger, inventoryOperationCounter: scope.inventoryLedger ? window.ReceiptLedger.safeCounter(state._localInventoryOperationCounter, inventoryLedger.through) : state._localInventoryOperationCounter,
      inventoryRevision: n(state._localInventoryRevision),
      ownedSkins: scope.skins ? { ...initialSkins(state), ...(state.ownedSkins || {}) } : (state.ownedSkins || {}),
      equippedSkins: scope.skins ? { ...(state.equippedSkins || {}) } : (state.equippedSkins || {}),
    };
  }
  return { n, uniq, sample, suits, outcomes, operationScope, clampResource, addResource, assertInventoryCapacity, sanitize };
})();
