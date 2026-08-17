window.GameStoreSaveValidation = ({ limits, serializedBytes }) => {
  const record = value =>
    !!value && typeof value === "object" && !Array.isArray(value);
  const boundedInteger = (value, max = limits.counter) =>
    Number.isSafeInteger(Number(value))
    && Number(value) >= 0 && Number(value) <= max;

  function boundedStructure(root) {
    const stack = [root], seen = new WeakSet();
    let nodes = 0;
    while (stack.length) {
      const value = stack.pop();
      if (!value || typeof value !== "object" || seen.has(value)) continue;
      seen.add(value);
      const entries = Array.isArray(value) ? value : Object.values(value);
      const max = Array.isArray(value) ? limits.collection : limits.objectKeys;
      if (entries.length > max) return false;
      nodes += entries.length;
      if (nodes > limits.nodes) return false;
      entries.forEach(item => {
        if (item && typeof item === "object") stack.push(item);
      });
    }
    return true;
  }

  function stringList(value, max = limits.stringItems) {
    return Array.isArray(value) && value.length <= max
      && value.every(item =>
        typeof item === "string" && item.length > 0 && item.length <= 200);
  }

  const compactReceipt = value =>
    typeof value === "string" && /^[0-9a-z]{1,7}\.[0-9a-z]{1,7}$/.test(value);
  const receiptLedger = value => record(value)
    && (value.version == null || Number(value.version) === 1)
    && (value.through == null || boundedInteger(value.through))
    && (value.legacy == null || (stringList(value.legacy)
      && value.legacy.length
        <= (window.ReceiptLedger?.LEGACY_LIMIT || limits.stringItems)
      && value.legacy.every(compactReceipt)));
  const reward = value => record(value)
    && !["gold", "essence"].some(key =>
      value[key] != null && !boundedInteger(value[key], limits.resource))
    && !["cards", "relics"].some(key => value[key] != null
      && (!Array.isArray(value[key]) || value[key].length > limits.rewardItems));
  const formalRelicList = value => value == null || Array.isArray(value)
    && value.every(name => window.RelicSystem?.isFormalId?.(name));
  const formalRelicSlots = value => Array.isArray(value) && value.length <= 2
    && value.every(name => name == null || window.RelicSystem?.isFormalId?.(name));
  const formalRelicMap = value => value == null || record(value)
    && Object.values(value).every(formalRelicSlots);
  const formalRelicReward = value => {
    const rewardValue = value?.reward || value;
    return rewardValue?.type !== "relic"
      || window.RelicSystem?.isFormalId?.(rewardValue.relic);
  };
  const formalRewardRelics = value => value == null
    || formalRelicList(value.relics);
  function formalRelicState(raw) {
    const runRewards = Object.values(raw._localRunState?.rewards || {});
    return formalRelicList(raw.relicCollection)
      && formalRelicList(raw.resources?.relics)
      && formalRelicList(raw.testRelics)
      && formalRelicMap(raw.equipment)
      && formalRelicMap(raw.testEquipment)
      && (raw.bounties || []).every(formalRelicReward)
      && (raw.pendingBountyRewards || []).every(formalRelicReward)
      && [raw.explore?.earned, raw.explore?.lastReward,
        raw.explore?.rewardPopup, raw._localPendingRun, raw.pendingRun,
        ...runRewards].every(formalRewardRelics);
  }

  function validShape(raw, checkBytes) {
    if (!record(raw) || !boundedStructure(raw)) return false;
    if (!window.GameStoreSaveSchema.validPersistedState(raw, checkBytes)) return false;
    if (!checkBytes && !formalRelicState(raw)) return false;
    if (["settings", "resources", "flags", "unlockEvents", "equipment", "testEquipment", "ownedSkins", "equippedSkins", "testSkins", "_localBountyLedger"].some(key => raw[key] != null && !record(raw[key]))) return false;
    if (raw.unlockEvents != null
      && !window.UnlockEventProgress.validPersisted(raw.unlockEvents)) return false;
    if (raw.updatedAt != null && !boundedInteger(raw.updatedAt, limits.timestamp)) return false;
    if (raw._saveVersion != null && !boundedInteger(raw._saveVersion)) return false;
    if (raw.shopAuthorityVersion != null && !boundedInteger(raw.shopAuthorityVersion)) return false;
    if (raw._saveHeads != null) {
      if (!record(raw._saveHeads) || Object.keys(raw._saveHeads).some(key => !["main", "slot1", "slot2", "slot3"].includes(key))) return false;
      if (Object.values(raw._saveHeads).some(head => !record(head)
        || !boundedInteger(head.revision)
        || typeof head.commit !== "string" || !/^[0-9a-f-]{16,80}$/i.test(head.commit)
        || typeof head.digest !== "string" || !/^[0-9a-f]{64}$/i.test(head.digest))) return false;
    }
    if (["_localBountyClaimCounter", "_localDefeatCounter", "_localInventoryOperationCounter"].some(key => raw[key] != null && !boundedInteger(raw[key]))) return false;
    if (Object.entries(limits.lists).some(([key, max]) => raw[key] != null
      && (!Array.isArray(raw[key]) || raw[key].length > max))) return false;
    if (raw.resources && ["gold", "essence", "shards"].some(key => raw.resources[key] != null
      && !boundedInteger(raw.resources[key], limits.resource))) return false;
    const legacyGold = Number(raw.resources?.gold || 0)
      + Number(raw.resources?.shards || 0);
    if (!Number.isSafeInteger(legacyGold) || legacyGold > limits.resource) return false;
    if (raw.resources && ["relics", "cores"].some(key => raw.resources[key] != null
      && (!Array.isArray(raw.resources[key]) || raw.resources[key].length > limits.collection))) return false;
    if (raw.pendingBountyRewards?.some(item => !record(item) || !reward(item.reward || item)
      || (item.bonusGold != null && !boundedInteger(item.bonusGold, limits.resource)))) return false;
    if (raw._pendingSettlementActions?.some(item => !record(item)
      || typeof item.id !== "string" || !item.id || item.id.length > 200
      || typeof item.type !== "string" || !item.type || item.type.length > 64
      || (item.data != null && !record(item.data))
      || (item.attempts != null && !boundedInteger(item.attempts))
      || (item.lastError != null && (typeof item.lastError !== "string" || item.lastError.length > 500)))) return false;
    if (raw._localBountyLedger?.legacy != null
      && (!stringList(raw._localBountyLedger.legacy)
        || !raw._localBountyLedger.legacy.every(compactReceipt))) return false;
    if (raw._localBountyLedger?.version != null
      && Number(raw._localBountyLedger.version) !== 1) return false;
    if (raw._localBountyLedger?.through != null
      && !boundedInteger(raw._localBountyLedger.through)) return false;
    if (raw._localBountyLedger?.legacy?.length
      > (window.BountyLedger?.LEGACY_LIMIT || limits.stringItems)) return false;
    if (["_localDefeatLedger", "_localInventoryLedger"].some(key =>
      raw[key] != null && !receiptLedger(raw[key]))) return false;
    if (["_localClaimedBountyIds", "_localDefeatIds", "_localInventoryOperationIds"].some(key =>
      raw[key] != null && !stringList(raw[key]))) return false;
    if (raw._localInventoryRevision != null
      && !boundedInteger(raw._localInventoryRevision)) return false;
    if (["_localPendingRun", "pendingRun"].some(key =>
      raw[key] != null && !reward(raw[key]))) return false;
    if (raw._localRunState != null) {
      if (!record(raw._localRunState) || (raw._localRunState.key != null
        && (typeof raw._localRunState.key !== "string"
          || !raw._localRunState.key))) return false;
      if (raw._localRunState.version != null
        && Number(raw._localRunState.version) !== 1) return false;
      const rewards = raw._localRunState.rewards;
      if (rewards != null && (!record(rewards)
        || Object.keys(rewards).length > limits.runRewards
        || Object.values(rewards).some(item => !reward(item)))) return false;
    }
    return !checkBytes || serializedBytes(raw) <= limits.bytes;
  }

  return {
    validateRaw: raw => validShape(raw, true),
    validateMigrated: raw => validShape(raw, false),
  };
};
