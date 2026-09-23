window.GameStoreIO = (() => {
  const { validateRaw } = window.GameStoreSaveLimits;
  const local = window.GameStoreLocalIO;
  const cloud = window.GameStoreCloudIO;
  const key = "succubus-kill-save-v1";
  const settingsKey = "succubus-kill-settings-v1";
  const slotKey = id => `succubus-kill-slot-${id}-v1`;
  const slotIds = [1, 2, 3];
  const ownedKeys = Object.freeze([key, ...slotIds.map(slotKey), settingsKey]);

  function validSlotId(id) {
    const slot = Number(id);
    if (!Number.isInteger(slot) || !slotIds.includes(slot)) throw new Error("invalid slot");
    return slot;
  }

  const selection = window.GameStoreIOSelection({
    validateRaw,
    getLocalDetails: local.getLocalDetails,
    getCloudRaw: cloud.getRaw,
  });
  const mutations = window.GameStoreIOMutations({
    validateRaw,
    putLocalRaw: local.putLocalRaw,
    removeLocalRaw: local.removeLocalRaw,
    runMutation: cloud.runMutation,
  });
  const recovery = window.GameStoreIORecovery({
    getRawDetails: selection.getRawDetails,
    putRaw: mutations.putRaw,
  });

  return {
    key, settingsKey, slotKey, slotIds, ownedKeys, validSlotId,
    withTimeout: cloud.withTimeout,
    compareRaw: selection.compareRaw,
    getLocalDetails: local.getLocalDetails,
    getRawDetails: selection.getRawDetails,
    getRaw: selection.getRaw,
    putLocalRaw: local.putLocalRaw,
    putCloudRaw: mutations.putCloudRaw,
    putRawDetailed: mutations.putRawDetailed,
    putRaw: mutations.putRaw,
    delRaw: mutations.delRaw,
    captureRaw: recovery.captureRaw,
    restoreRaw: recovery.restoreRaw,
  };
})();
