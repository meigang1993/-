window.LocalCoreCommerceOps = (() => {
  const { n, sample, suits, outcomes, addResource, assertInventoryCapacity } = window.LocalCoreUtils;
  const economy = window.GameEconomy;
  const SHOP_AUTHORITY_VERSION = 1;
  function char(core, id) { return core.chars.find(c => c.id === id); }
  const cardKey = card => `${card?.name || ""}|${card?.suit || ""}`;
  function inventoryOperation(core, args) {
    const id = String(args.operationId || "");
    if (!id) return { valid: false };
    const receipt = window.ReceiptLedger.inspect(core.inventoryLedger, id, "inventory");
    if (receipt.status === "blocked") throw receiptError("库存操作收据账本已满");
    const replayed = receipt.status === "duplicate";
    if (replayed) core.lastInventoryOperation = { id, replayed: true };
    return { valid: true, id, replayed };
  }
  function completeInventoryOperation(core, id) {
    const receipt = window.ReceiptLedger.claim(core.inventoryLedger, id, "inventory");
    if (receipt.status !== "granted") throw receiptError("库存操作收据无法写入");
    core.inventoryLedger = receipt.ledger;
    core.inventoryRevision = n(core.inventoryRevision) + 1;
    core.lastInventoryOperation = { id, replayed: false };
  }
  function receiptError(message) {
    const error = new Error(message);
    error.code = "RECEIPT_LEDGER_FULL";
    return error;
  }
  function protectedCounts() {
    return (GameData.protectedBaseDeck || []).reduce((out, card) => {
      const key = cardKey(card); out[key] = (out[key] || 0) + 1; return out;
    }, {});
  }
  function shopPool(core) {
    const names = new Set(core.unlockedShopCards || []);
    return [...new Map((GameData.eliteCards || []).filter(c => names.has(c.name)).map(c => [c.name, c])).values()];
  }
  function shopRefresh(core) {
    const pool = shopPool(core);
    const size = core.defeatedElites.includes("shark_captain_mordio") ? economy.shop.expandedStockSize : economy.shop.stockSize;
    const authority = Math.max(0, n(core.shopAuthorityVersion));
    const maxAuthority = window.GameStoreSaveLimits?.limits?.counter || 1_000_000_000_000;
    if (authority >= maxAuthority) throw new Error("商店库存确认序号已达上限");
    core.shopCards = pool.length ? Array.from({ length: size }, () => ({ card: { ...sample(pool, core), suit: sample(suits, core) }, sold: false })) : [];
    core.shopAuthorityVersion = authority + SHOP_AUTHORITY_VERSION;
    return outcomes.changed;
  }
  function newGame(core) {
    return shopRefresh(core);
  }
  function shopBuy(core, args) {
    const slot = core.shopCards[n(args.index, -1)], card = slot?.card;
    const canonical = window.GameStoreSaveSchema?.rebuildCard?.(card);
    const expected = `${String(args.cardName || "")}|${String(args.cardSuit || "")}`;
    const price = canonical?.price || economy.shop.defaultCardPrice;
    const authority = Number(core.shopAuthorityVersion);
    const requestedAuthority = Number(args.shopAuthorityVersion);
    const maxAuthority = window.GameStoreSaveLimits?.limits?.counter || 1_000_000_000_000;
    if (!Number.isSafeInteger(authority)
      || authority < SHOP_AUTHORITY_VERSION || authority > maxAuthority
      || !Number.isSafeInteger(requestedAuthority) || requestedAuthority !== authority
      || window.GameStoreSaveSchema?.validShopStock?.(core) !== true
      || !canonical || expected === "|" || cardKey(canonical) !== expected
      || slot.sold || core.resources.gold < price) return outcomes.rejected;
    assertInventoryCapacity(core, { cards: 1 });
    core.resources.gold -= price;
    core.deckAdditions = [{ ...canonical }];
    slot.sold = true;
    return outcomes.changed;
  }
  function shopDelete(core, args) {
    const operation = inventoryOperation(core, args);
    if (!operation.valid) return outcomes.rejected;
    if (operation.replayed) return outcomes.reconciled;
    let index = n(args.index, -1);
    const expected = args.cardName ? `${args.cardName}|${args.cardSuit || ""}` : "";
    if (!expected) return outcomes.rejected;
    if (expected && cardKey(core.deck[index]) !== expected) index = core.deck.findIndex(card => cardKey(card) === expected);
    const card = core.deck[index], protectedCount = protectedCounts()[cardKey(card)] || 0;
    const ownedCount = card ? core.deck.filter(item => cardKey(item) === cardKey(card)).length : 0;
    const recoverySlots = Math.max(0, n(args.recoveryCardSlots));
    const deckMax = window.GameStoreSaveLimits?.limits?.lists?.deck || 4096;
    const freeRecovery = recoverySlots > 0 && core.deck.length + recoverySlots > deckMax;
    if (!card || core.deck.length <= 1 || protectedCount >= ownedCount
      || (!freeRecovery && core.resources.gold < economy.shop.deleteCost)) return outcomes.rejected;
    if (!freeRecovery) core.resources.gold -= economy.shop.deleteCost;
    core.deckRemoval = { index };
    completeInventoryOperation(core, operation.id);
    core.lastInventoryOperation.freeRecovery = freeRecovery;
    return outcomes.changed;
  }
  function smeltRelic(core, args) {
    const operation = inventoryOperation(core, args);
    if (!operation.valid) return outcomes.rejected;
    if (operation.replayed) return outcomes.reconciled;
    let index = n(args.index, -1);
    const expected = String(args.relic || "");
    if (!window.RelicSystem?.isFormalId?.(expected)) return outcomes.rejected;
    if (expected && core.resources.relics[index] !== expected) index = core.resources.relics.indexOf(expected);
    if (!core.resources.relics[index]) return outcomes.rejected;
    core.relicRemoval = { index };
    core.resources.gold = addResource(core.resources.gold, economy.relic.smeltGold);
    completeInventoryOperation(core, operation.id);
    return outcomes.changed;
  }
  function skinUnlocked(core, id) {
    const c = char(core, window.SkinSystem?.byId?.(id)?.charId);
    return c && !c.locked;
  }
  function levelSkinOwned(core, skin) {
    const c = char(core, skin?.charId);
    return !!skin?.unlockLevel && !!c && !c.locked && n(c.level) >= skin.unlockLevel;
  }
  function buySkin(core, args) {
    const id = String(args?.id || ""), skin = window.SkinSystem?.byId?.(id);
    const cost = skin && window.SkinSystem.price(skin), charId = skin?.charId;
    if (!cost || skin.initial || skin.unlockLevel || !charId || core.ownedSkins?.[id] || !skinUnlocked(core, id) || core.resources.essence < cost) return outcomes.rejected;
    core.resources.essence -= cost;
    core.ownedSkins[id] = true;
    core.equippedSkins[charId] = id;
    return outcomes.changed;
  }
  function equipSkin(core, args) {
    const id = String(args?.id || ""), skin = window.SkinSystem?.byId?.(id), charId = skin?.charId;
    const owned = core.ownedSkins?.[id] || levelSkinOwned(core, skin);
    if (!charId || !owned || !skinUnlocked(core, id) || core.equippedSkins?.[charId] === id) return outcomes.rejected;
    if (levelSkinOwned(core, skin)) core.ownedSkins[id] = true;
    core.equippedSkins[charId] = id;
    return outcomes.changed;
  }
  return { newGame, shopRefresh, shopBuy, shopDelete, smeltRelic, buySkin, equipSkin };
})();
