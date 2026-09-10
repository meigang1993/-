window.GameStoreMigrations = (() => {
  const {
    characterProgressionVersion, characterGrowthVersion, baseStats, freshState,
  } = window.GameStoreStateFactory;
  const {
    renameRelicMap, repairCardLists, repairRelicLists,
  } = window.StoreRepairs;
  const {
    cleanResource, migrateCharacter, migrateDeck, migrateBondiShopUnlock, syncCardTexts,
  } = window.StoreCharacterMigrations;
  const {
    migrateDifficulties, recoverBrokenDungeonState, recoverOrphanedBattleNode,
    migrateRunReceipts,
  } = window.StoreRunMigrations;
  const unlocks = window.StoreUnlockMigrations;
  const normalizers = window.StoreMigrationNormalizers;

  function markForSave(state) {
    Object.defineProperty(state, "_needsSaveAfterMigration", {
      value: true, configurable: true,
    });
  }

  const { finishCharacterMigration } = window.StoreMigrationsCharacters({
    markForSave, characterProgressionVersion, characterGrowthVersion,
  });
  const { runUnlockMigrations } = window.StoreMigrationsUnlocks({ markForSave });

  function migrate(state) {
    if (window.GameRandom.normalize(state)) markForSave(state);
    state.updatedAt = state.updatedAt || 0;
    state.currentSaveSlot = state.currentSaveSlot || null;
    state.settings = {
      sfxVolume: 80, musicVolume: 80, battleSpeed: 1, manualResponse: false,
      appearanceUpdatedAt: 0, equippedSkins: {}, ...(state.settings || {}),
    };
    state.settings.battleSpeed = [1, 1.5, 2]
      .includes(Number(state.settings.battleSpeed))
      ? Number(state.settings.battleSpeed) : 1;
    state.settings.manualResponse = !!state.settings.manualResponse;
    state.settings.appearanceUpdatedAt = Math.max(
      0, Number(state.settings.appearanceUpdatedAt) || 0,
    );
    const equippedSkins = state.settings.equippedSkins;
    state.settings.equippedSkins = window.SkinSystem?.normalizeEquipment
      ? window.SkinSystem.normalizeEquipment(equippedSkins)
      : equippedSkins && typeof equippedSkins === "object" && !Array.isArray(equippedSkins)
        ? { ...equippedSkins }
        : {};
    delete state.settings.manualDodge;
    delete state.settings.manualCounter;
    state.resources ||= {};
    state.flags ||= {};
    if (!Object.prototype.hasOwnProperty.call(state.flags, "firstExpeditionStarted")) {
      state.flags.firstExpeditionStarted = true;
      markForSave(state);
    }
    state.chars = Array.isArray(state.chars) ? state.chars : [];
    const migrateProgression =
      (state.flags.characterProgressionVersion || 0) < characterProgressionVersion;
    const previousGrowthVersion = state.flags.characterGrowthVersion || 0;
    const migrateGrowth = previousGrowthVersion < characterGrowthVersion;
    state.flags.defeatCount ||= 0;
    state.resources.relics ||= [];
    state.resources.gold = cleanResource(state.resources.gold)
      + cleanResource(state.resources.shards);
    state.resources.essence ??= state.resources.cores?.length || 0;
    delete state.resources.shards;
    delete state.resources.cores;
    state.unlockedDifficulties = migrateDifficulties(state.unlockedDifficulties);
    state.battleLog = Array.isArray(state.battleLog) ? state.battleLog : [];
    state.defeatedElites ||= [];
    normalizers.normalizeShopUnlocks(state, markForSave);
    normalizers.normalizeRelics(state, markForSave);

    const oldCharacters = Array.isArray(state.chars) ? state.chars : [];
    state.chars = GameData.characters.map(template =>
      migrateCharacter(template, oldCharacters, {
        migrateProgression, migrateGrowth, previousGrowthVersion,
      }));
    finishCharacterMigration(state, migrateProgression, migrateGrowth);
    if (migrateDeck(state, oldCharacters)) markForSave(state);
    migrateBondiShopUnlock(state);
    syncCardTexts(state);
    if (repairCardLists(state)) markForSave(state);
    if (repairRelicLists(state)) markForSave(state);
    state.equipment = renameRelicMap(state.equipment || {});
    if (unlocks.recoverPartyUnlocks(state)) markForSave(state);
    normalizers.normalizeParty(state);

    const interruptedBattle = !!state.battle
      || state.view === "battle" || state.view === "battleLoading";
    const resumedBattle = window.BattleSaveCheckpoint?.restore?.(state) === true;
    const interruptedModal = resumedBattle ? null : unlocks.recoverInterruptedBattle(state);
    if (interruptedBattle && !resumedBattle) markForSave(state);
    recoverOrphanedBattleNode(state);
    window.GameStoreCompact?.stripTransientUiState?.(state);
    recoverBrokenDungeonState(state);
    normalizers.normalizeUiState(state, interruptedModal);
    normalizers.normalizeLedgers(state, markForSave);
    if (migrateRunReceipts(state)) markForSave(state);
    state._pendingSettlementActions = Array.isArray(state._pendingSettlementActions)
      ? state._pendingSettlementActions : [];
    normalizers.normalizeCollectionState(state, markForSave);
    runUnlockMigrations(state);
    return state;
  }

  return { freshState, migrate, baseStats };
})();
