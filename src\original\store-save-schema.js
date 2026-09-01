window.GameStoreSaveSchema = (() => {
  const suits = new Set(["♠", "♥", "♣", "♦"]);
  const legacyRemovedCards = new Set([
    "药瓶箱", "命运硬币", "强杀", "重振旗鼓", "本能反应",
  ]);
  const record = value => !!value && typeof value === "object" && !Array.isArray(value);
  const safeId = value => typeof value === "string"
    && /^[A-Za-z0-9._:-]{1,120}$/.test(value);

  function canonicalCard(name) {
    if (typeof name !== "string" || !name) return null;
    const data = window.GameData || {};
    return [...(data.baseDeck || []), ...(data.eliteCards || [])]
      .find(card => card.name === name) || null;
  }

  function rebuildCard(card) {
    const source = record(card) ? canonicalCard(card.name) : null;
    if (!source || !suits.has(card.suit)) return null;
    return { ...source, suit: card.suit };
  }

  function cardIdentity(card) {
    const rebuilt = rebuildCard(card);
    return rebuilt ? { name: rebuilt.name, suit: rebuilt.suit } : null;
  }

  function validStoredCard(card, allowLegacyRemoved = false) {
    return !!rebuildCard(card)
      || allowLegacyRemoved && record(card)
        && legacyRemovedCards.has(card.name) && suits.has(card.suit);
  }

  function validShopStock(raw, options = {}) {
    if (!Array.isArray(raw?.unlockedShopCards)
      || !Array.isArray(raw?.defeatedElites)
      || !Array.isArray(raw?.shopCards)) return false;
    const unlocked = new Set(raw.unlockedShopCards);
    const pool = new Set((window.GameData?.eliteCards || [])
      .filter(card => unlocked.has(card.name)).map(card => card.name));
    const expanded = raw.defeatedElites.includes("shark_captain_mordio");
    const economy = window.GameEconomy?.shop;
    const size = expanded ? economy?.expandedStockSize : economy?.stockSize;
    const expected = pool.size ? size : 0;
    return Number.isSafeInteger(expected) && raw.shopCards.length === expected
      && raw.shopCards.every(slot => record(slot)
        && typeof slot.sold === "boolean"
        && (!options.requireUnsold || slot.sold === false)
        && pool.has(slot.card?.name)
        && validStoredCard(slot.card));
  }

  function validReward(reward, compact) {
    if (!record(reward)) return false;
    if (reward.type === "card") {
      return Object.keys(reward).every(key => key === "type" || key === "card")
        && validStoredCard(reward.card, compact);
    }
    if (reward.type === "relic") {
      return Object.keys(reward).every(key => key === "type" || key === "relic")
        && typeof reward.relic === "string" && reward.relic.length > 0
        && reward.relic.length <= 200;
    }
    return reward.type === "essence"
      && Object.keys(reward).every(key => key === "type" || key === "essence")
      && Number.isSafeInteger(reward.essence) && reward.essence >= 0
      && reward.essence <= 7;
  }

  function validBountyTask(task, compact = false) {
    if (!record(task) || !safeId(task.id) || !["hunt", "bond"].includes(task.type)) return false;
    const common = ["id", "type", "accepted", "failed", "missionId", "reward", "bonusGold"];
    const allowed = task.type === "hunt"
      ? [...common, "targetId", "targetName", "targetType"]
      : [...common, "charId", "charName"];
    if (!Object.keys(task).every(key => allowed.includes(key))) return false;
    if (task.accepted != null && typeof task.accepted !== "boolean") return false;
    if (task.failed != null && typeof task.failed !== "boolean") return false;
    if (!safeId(task.missionId)) return false;
    if (task.bonusGold != null && (!Number.isSafeInteger(task.bonusGold)
      || task.bonusGold < 0 || task.bonusGold > 1_000_000_000)) return false;
    if (task.reward != null && !validReward(task.reward, compact)) return false;
    const text = value => typeof value === "string" && value.length > 0
      && value.length <= 200;
    return task.type === "hunt"
      ? safeId(task.targetId)
        && (task.targetName == null || text(task.targetName))
        && (task.targetType == null || ["elite", "boss"].includes(task.targetType))
      : safeId(task.charId) && (task.charName == null || text(task.charName));
  }

  function validCardList(list, compact) {
    return list == null || Array.isArray(list)
      && list.every(card => validStoredCard(card, compact));
  }

  function validPersistedState(raw, allowLegacyRemoved = false) {
    if (!validCardList(raw?.deck, allowLegacyRemoved)) return false;
    if (raw?.shopCards != null && (!Array.isArray(raw.shopCards)
      || raw.shopCards.some(slot => !record(slot)
        || !validStoredCard(slot.card, allowLegacyRemoved)
        || (slot.sold != null && typeof slot.sold !== "boolean")))) return false;
    if (raw?.bounties != null && (!Array.isArray(raw.bounties)
      || raw.bounties.some(task => !validBountyTask(task, allowLegacyRemoved)))) return false;
    const cardLists = [
      raw?.explore?.earned?.cards,
      raw?.explore?.lastReward?.cards,
      raw?.explore?.rewardPopup?.cards,
      raw?._localPendingRun?.cards,
      raw?.pendingRun?.cards,
    ];
    const runRewards = raw?._localRunState?.rewards;
    if (runRewards != null && !record(runRewards)) return false;
    if (record(runRewards)) {
      Object.values(runRewards).forEach(reward => cardLists.push(reward?.cards));
    }
    if (cardLists.some(list => !validCardList(list, allowLegacyRemoved))) return false;
    if (raw?.pendingBountyRewards != null && (!Array.isArray(raw.pendingBountyRewards)
      || raw.pendingBountyRewards.some(item =>
        !record(item) || !validReward(item.reward || item, allowLegacyRemoved)))) return false;
    return true;
  }

  return {
    cardIdentity,
    rebuildCard,
    safeId,
    validBountyTask,
    validPersistedState,
    validShopStock,
    validStoredCard,
  };
})();
