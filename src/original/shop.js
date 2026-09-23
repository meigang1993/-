window.ShopSystem = (() => {
  const economy = window.GameEconomy.shop;
  const BUY_COST = economy.defaultCardPrice;
  const DELETE_COST = economy.deleteCost;
  const AUTHORITY_VERSION = 1;
  const STOCK_SIZE = state => (state.defeatedElites || []).includes("shark_captain_mordio") ? economy.expandedStockSize : economy.stockSize;
  const clone = (card) => ({ ...card });
  const uniqueByName = (cards) => [...new Map(cards.map(c => [c.name, c])).values()];
  const baseKey = c => `${c?.name || ""}|${c?.suit || ""}`;
  function baseCounts() { return (GameData.protectedBaseDeck || GameData.baseDeck || []).reduce((m, c) => (m[baseKey(c)] = (m[baseKey(c)] || 0) + 1, m), {}); }
  function recoveryPressure(state) {
    return window.GameStoreSaveLimits?.pendingInventoryPressure?.(state)?.cards
      || { incoming: 0, needed: 0 };
  }
  function deletionContext(state, options = {}) {
    const counts = (state.deck || []).reduce((out, card) => {
      const key = baseKey(card); out[key] = (out[key] || 0) + 1; return out;
    }, {});
    return {
      counts,
      protected: baseCounts(),
      freeRecovery: !!options.inventoryRecovery && recoveryPressure(state).needed > 0,
    };
  }
  function canDeleteCard(state, index, options = {}) {
    const deck = state.deck || [];
    const card = deck[index];
    const context = options.context || deletionContext(state, options);
    const freeRecovery = context.freeRecovery;
    if (!card || (!freeRecovery && state.resources.gold < DELETE_COST) || deck.length <= 1) return false;
    const key = baseKey(card), protectedCount = context.protected[key] || 0;
    return !protectedCount || (context.counts[key] || 0) > protectedCount;
  }
  function shopPool(state) {
    const names = new Set(state.unlockedShopCards || []);
    return uniqueByName((GameData.eliteCards || []).filter(c => names.has(c.name)));
  }
  function refreshPending(state) {
    const actions = state._pendingSettlementActions;
    return Array.isArray(actions)
      && actions.some(action => action?.type === "shopRefresh");
  }
  function confirmed(state) {
    const authority = Number(state.shopAuthorityVersion);
    const max = window.GameStoreSaveLimits?.limits?.counter || 1_000_000_000_000;
    return Number.isSafeInteger(authority)
      && authority >= AUTHORITY_VERSION
      && authority <= max
      && window.GameStoreSaveSchema?.validShopStock?.(state) === true;
  }
  function needsRefresh(state) {
    return shopPool(state).length > 0 && !confirmed(state);
  }
  async function refresh(state) {
    const authority = Math.max(0, Number(state.shopAuthorityVersion) || 0);
    const result = await window.ServerCore.call("shopRefresh", {}, state);
    if (result.stale) return false;
    return result?.ok === true && confirmed(state)
      && Number(state.shopAuthorityVersion) > authority;
  }
  function normalizeSlot(item) {
    if (!item?.card || typeof item.sold !== "boolean") return null;
    const card = window.GameStoreSaveSchema?.rebuildCard?.(item.card);
    if (!card) return null;
    return { card, sold: item.sold };
  }
  function ensure(state) {
    const list = Array.isArray(state.shopCards) ? state.shopCards.map(normalizeSlot).filter(Boolean) : [];
    state.shopCards = list.slice(0, STOCK_SIZE(state));
    return state.shopCards;
  }
  async function buy(state, index) {
    ensure(state);
    if (!confirmed(state)) {
      state.log?.unshift?.("商店库存尚未确认，请先刷新库存。");
      return false;
    }
    const authority = Number(state.shopAuthorityVersion);
    const slot = state.shopCards[index];
    if (!slot?.card || slot.sold) return;
    const ok = await window.ServerCore.call("shopBuy", {
      index, cardName: slot.card.name, cardSuit: slot.card.suit,
      shopAuthorityVersion: authority,
    }, state);
    if (ok.stale) return false;
    if (ok.changed) state.log.unshift(`商店购买：${slot.card.suit}${slot.card.name} 加入公共牌库。`);
    else state.log.unshift(ok.message || "购买未生效。");
    return ok.changed;
  }
  async function deleteCard(state, index, options = {}) {
    state.deck = state.deck || GameData.baseDeck.map(clone);
    const pressure = recoveryPressure(state);
    if (!canDeleteCard(state, index, options)) return;
    const card = state.deck[index];
    const operationId = window.ReceiptLedger.assign(state, "inventory", "_localInventoryLedger", "_localInventoryOperationCounter", "_localInventoryOperationIds");
    if (!operationId) return state.log.unshift("库存操作序号已达上限，无法继续删除卡牌。"), false;
    const recoveryCardSlots = options.inventoryRecovery ? pressure.incoming : 0;
    let settled = false;
    try {
      const ok = await window.ServerCore.call("shopDelete", {
        index, cardName: card.name, cardSuit: card.suit, operationId, recoveryCardSlots,
      }, state);
      if (ok.stale) return false;
      const replayed = !!ok.result?.core?.lastInventoryOperation?.replayed;
      settled = !!ok.changed || replayed;
      if (replayed) return true;
      const freeRecovery = !!ok.result?.core?.lastInventoryOperation?.freeRecovery;
      if (ok.changed) state.log.unshift(freeRecovery
        ? `远征库存整理：免费删除 ${card.suit}${card.name}，已腾出1个待入库牌位。`
        : `商店服务：删除 ${card.suit}${card.name}，花费${DELETE_COST}莉莉丝元。`);
      else state.log.unshift(ok.message || "删除卡牌未生效。");
      return ok.changed;
    } finally {
      if (!settled) window.ReceiptLedger.release(
        state, operationId, "inventory", "_localInventoryLedger", "_localInventoryOperationCounter",
      );
    }
  }
  return {
    BUY_COST, DELETE_COST, STOCK_SIZE, shopPool, refresh, ensure,
    buy, deleteCard, canDeleteCard, recoveryPressure, deletionContext,
    confirmed, needsRefresh, refreshPending,
  };
})();
