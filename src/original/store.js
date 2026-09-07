window.GameStore = (() => {
  const { freshState, migrate, baseStats } = window.GameStoreMigrations;
  const main = window.GameStoreMainSave({ freshState, migrate });
  const slots = window.GameStoreSlotsData({ main });
  let pauseGeneration = 0;
  async function pauseSaving() {
    const generation = ++pauseGeneration;
    await Promise.all([
      window.GameStoreSettings.pause(),
      slots.pause(),
    ]);
    if (generation !== pauseGeneration) return false;
    await main.pause();
    if (generation !== pauseGeneration) {
      main.resume();
      return false;
    }
    return true;
  }
  function resumeSaving() {
    pauseGeneration += 1;
    main.resume();
    slots.resume();
    window.GameStoreSettings.resume();
  }
  function acceptRestored(key, data) {
    if (key === window.GameStoreIO.key) main.acceptRestored(data);
  }
  function clearSettingsMemory() {
    window.GameStoreSettings.clearMemory();
  }
  async function persistMigration(state) {
    if (!state?._needsSaveAfterMigration) return false;
    await main.save(state, { flush: true });
    delete state._needsSaveAfterMigration;
    return true;
  }
  return {
    freshState,
    load: main.load,
    hasMainSave: main.hasMainSave,
    save: main.save,
    loadSettings: window.GameStoreSettings.load,
    retrySettings: window.GameStoreSettings.retryLoad,
    saveSettings: window.GameStoreSettings.save,
    retryDirty: main.retryDirty,
    overwrite: main.overwrite,
    restoreCurrent: main.restoreCurrent,
    flushPending: main.flushPending,
    promoteLoaded: main.promoteLoaded,
    repairMain: main.repairMain,
    status: () => ({
      ...main.status(),
      slotPending: slots.status(),
      settings: window.GameStoreSettings.status(),
    }),
    getSlots: slots.getSlots,
    saveSlot: slots.saveSlot,
    retrySlotSave: slots.retrySlotSave,
    loadAuto: slots.loadAuto,
    loadSlot: slots.loadSlot,
    deleteSlot: slots.deleteSlot,
    pauseSaving,
    resumeSaving,
    acceptRestored,
    clearSettingsMemory,
    persistMigration,
    ownedKeys: window.GameStoreIO.ownedKeys,
    baseStats,
  };
})();
