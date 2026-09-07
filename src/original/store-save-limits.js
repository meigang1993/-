window.GameStoreSaveLimits = (() => {
  const limits = Object.freeze({
    bytes: 2 * 1024 * 1024,
    resource: 1_000_000_000,
    counter: 1_000_000_000_000,
    timestamp: 4_102_444_800_000,
    collection: 4096,
    objectKeys: 4096,
    nodes: 50_000,
    rewardItems: 512,
    runRewards: 1024,
    stringItems: 4096,
    lists: Object.freeze({
      chars: 256, deck: 4096, party: 8, log: 200, battleLog: 1000,
      shopCards: 128, bounties: 256, pendingBountyRewards: 256,
      _pendingSettlementActions: 256, testAllies: 8, testEnemies: 8,
      testCards: 2048, testRelics: 2048, completed: 2048,
      defeatedElites: 2048, unlockedShopCards: 2048,
      unlockedDifficulties: 64, relicCollection: 4096,
    }),
  });
  function clampResource(value) {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number) || number <= 0) return 0;
    return Math.min(number, limits.resource);
  }
  function addResource(current, amount) {
    return Math.min(limits.resource, clampResource(current) + clampResource(amount));
  }
  const additionCount = value => Array.isArray(value)
    ? value.length
    : Math.max(0, Math.floor(Number(value) || 0));
  function inventoryStatus(state) {
    const cards = Array.isArray(state?.deck) ? state.deck.length : 0;
    const relics = Array.isArray(state?.resources?.relics) ? state.resources.relics.length : 0;
    return {
      cards: { current: cards, max: limits.lists.deck, remaining: Math.max(0, limits.lists.deck - cards) },
      relics: { current: relics, max: limits.collection, remaining: Math.max(0, limits.collection - relics) },
    };
  }
  function pendingInventoryAdditions(state) {
    const pending = state?._localPendingRun || state?.pendingRun || {};
    const bounty = Array.isArray(state?.pendingBountyRewards)
      ? state.pendingBountyRewards
      : [];
    const additions = {
      cards: additionCount(pending.cards),
      relics: additionCount(pending.relics),
    };
    let ledger = window.BountyLedger?.normalize?.(
      state?._localBountyLedger, state?._localClaimedBountyIds,
    );
    const returned = new Set();
    bounty.forEach(item => {
      const claimId = String(item?.claimId || "");
      if (!claimId || returned.has(claimId)) return;
      returned.add(claimId);
      const result = window.BountyLedger?.claim?.(ledger, claimId);
      if (!result || result.status !== "granted") return;
      ledger = result.ledger;
      if (item.reward?.type === "card" && item.reward.card) additions.cards += 1;
      if (item.reward?.type === "relic" && item.reward.relic) additions.relics += 1;
    });
    return additions;
  }
  function pendingInventoryPressure(state) {
    const status = inventoryStatus(state);
    const additions = pendingInventoryAdditions(state);
    return Object.fromEntries(Object.keys(status).map(key => [key, {
      ...status[key],
      incoming: additions[key],
      needed: Math.max(0, status[key].current + additions[key] - status[key].max),
    }]));
  }
  function assertInventoryCapacity(state, additions = {}) {
    const status = inventoryStatus(state);
    const requested = {
      cards: additionCount(additions.cards),
      relics: additionCount(additions.relics),
    };
    const blocked = Object.keys(requested).filter(key =>
      status[key].current + requested[key] > status[key].max);
    if (!blocked.length) return status;
    const detail = blocked.map(key => {
      const unit = key === "cards" ? "张卡牌" : "件饰品";
      const label = key === "cards" ? "牌库" : "饰品库存";
      return `${label}${status[key].current}/${status[key].max}，本次还需加入${requested[key]}${unit}`;
    }).join("；");
    const action = blocked.length > 1
      ? "删除卡牌或拆解饰品"
      : blocked[0] === "cards" ? "整理库存并删除卡牌" : "在魂能熔炉拆解饰品";
    const error = new Error(`库存空间不足：${detail}。本次入库未执行，请先${action}后重试。`);
    error.code = "INVENTORY_CAPACITY_EXCEEDED";
    error.details = { blocked, requested, status };
    throw error;
  }
  function serializedBytes(value) {
    let text;
    try { text = typeof value === "string" ? value : JSON.stringify(value); }
    catch (_) { return Infinity; }
    if (typeof text !== "string") return Infinity;
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text).byteLength;
    if (typeof Blob === "function") return new Blob([text]).size;
    return text.length * 3;
  }
  const validation = window.GameStoreSaveValidation({ limits, serializedBytes });
  return {
    limits,
    clampResource,
    addResource,
    inventoryStatus,
    pendingInventoryPressure,
    assertInventoryCapacity,
    serializedBytes,
    ...validation,
  };})();
